/**
 * TLS verifier — the mechanical half of the transport-security gate `/deploy` enforces.
 *
 * The Factory rolls no certificate authority and runs no ACME client itself; provisioning a cert
 * is the deploy target's job (Let's Encrypt on Fly, ACM on AWS, Cloudflare, ...). What the Factory
 * DOES own is the check: before a PUBLIC endpoint ships, `/deploy` gathers what the live endpoint
 * actually presents (did it negotiate TLS, does the chain verify to a trusted root, when does the
 * leaf expire, which protocol version, does it send HSTS) and passes that observation here.
 * `verifyTls` decides pass/fail against a fixed policy: a trusted, in-date chain, at least
 * TLS 1.2, and a long-lived HSTS header.
 *
 * Pure by design (no node imports, no network, no keys) so the whole policy is provable in
 * `bun test` with a negative case per rule — the expired cert that must fail, the TLS 1.0 endpoint
 * that must fail, the missing HSTS that must fail — all offline against a plain data fixture. The
 * observation is gathered elsewhere (an `openssl s_client` / `curl -I` step in the deploy skill);
 * this module never touches the socket.
 *
 * Scope: the gate applies to PUBLIC endpoints only. An internal-only service (no public ingress)
 * passes without a finding — there is nothing to gate.
 */

/** Why an endpoint fails the transport gate — drives the finding text `/deploy` shows. */
export type TlsRisk =
  | 'no-tls'
  | 'invalid-chain'
  | 'expired'
  | 'not-yet-valid'
  | 'weak-protocol'
  | 'no-hsts'
  | 'weak-hsts';

/**
 * What was observed for one endpoint. Gathered by the deploy skill (not this module) and passed in
 * as plain data. Dates are ISO-8601 strings so a fixture is human-readable and the check is
 * deterministic against an injected `now`.
 */
export interface TlsObservation {
  /** Host (or host:port) that was probed — echoed into the verdict. */
  endpoint: string;
  /** Whether this endpoint has public ingress. The gate only applies when true. */
  isPublic: boolean;
  /** Whether the endpoint negotiated TLS at all (false = plaintext HTTP). */
  tlsEnabled: boolean;
  /** Whether the presented certificate chain verified to a trusted root. */
  chainValid: boolean;
  /** Leaf certificate valid-from, ISO-8601. Omit if unknown (treated as no lower bound). */
  notBefore?: string;
  /** Leaf certificate expiry, ISO-8601. Omit if unknown (treated as a failure — can't prove in-date). */
  notAfter?: string;
  /** Negotiated protocol, e.g. `TLSv1.2`, `TLSv1.3`. */
  protocol?: string;
  /** Value of the `Strict-Transport-Security` response header, or null/absent if not sent. */
  hstsHeader?: string | null;
}

/** One failed policy rule. */
export interface TlsFinding {
  rule: string;
  risk: TlsRisk;
  detail: string;
}

/** Verdict for one endpoint: whether the gate applied and, if so, whether it passed. */
export interface TlsVerdict {
  endpoint: string;
  /** True when the gate applied to this endpoint (i.e. it is public). */
  gated: boolean;
  /** True when the endpoint satisfies every rule (or the gate did not apply). */
  pass: boolean;
  findings: TlsFinding[];
}

/** Lowest protocol version accepted. TLS 1.0/1.1 are deprecated (RFC 8996). */
export const MIN_TLS_VERSION = 1.2;

/**
 * Minimum acceptable HSTS `max-age`, in seconds (180 days). Below this a browser forgets the
 * HTTPS pin too soon to matter; the common recommendation is >= 6 months.
 */
export const MIN_HSTS_MAX_AGE = 15_552_000;

/** Parse a `TLSvX.Y` (or bare `X.Y`) protocol string to a comparable number. NaN if unrecognised. */
export function parseTlsVersion(protocol: string): number {
  const match = /^(?:TLSv)?(\d+(?:\.\d+)?)$/i.exec(protocol.trim());
  return match ? Number.parseFloat(match[1]) : Number.NaN;
}

/** Extract `max-age` (seconds) from a `Strict-Transport-Security` header value. null if absent. */
export function parseHstsMaxAge(header: string): number | null {
  const match = /max-age\s*=\s*"?(\d+)"?/i.exec(header);
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Verify one endpoint against the transport policy. `now` is injectable so expiry is deterministic
 * in tests; it defaults to the wall clock for real use.
 *
 * Non-public endpoints short-circuit to a passing, ungated verdict — there is nothing to gate.
 */
export function verifyTls(obs: TlsObservation, now: Date = new Date()): TlsVerdict {
  if (!obs.isPublic) {
    return { endpoint: obs.endpoint, gated: false, pass: true, findings: [] };
  }

  const findings: TlsFinding[] = [];

  // A plaintext endpoint fails outright — none of the cert/HSTS rules can even apply.
  if (!obs.tlsEnabled) {
    findings.push({
      rule: 'tls-required',
      risk: 'no-tls',
      detail: 'public endpoint served over plaintext HTTP; TLS is required',
    });
    return { endpoint: obs.endpoint, gated: true, pass: false, findings };
  }

  if (!obs.chainValid) {
    findings.push({
      rule: 'chain-valid',
      risk: 'invalid-chain',
      detail: 'certificate chain did not verify to a trusted root',
    });
  }

  // Expiry: an unknown expiry is a failure — the gate proves in-date, it does not assume it.
  if (obs.notAfter === undefined) {
    findings.push({
      rule: 'cert-in-date',
      risk: 'expired',
      detail: 'certificate expiry unknown; cannot prove the leaf is in date',
    });
  } else if (now.getTime() > Date.parse(obs.notAfter)) {
    findings.push({
      rule: 'cert-in-date',
      risk: 'expired',
      detail: `certificate expired at ${obs.notAfter}`,
    });
  }

  if (obs.notBefore !== undefined && now.getTime() < Date.parse(obs.notBefore)) {
    findings.push({
      rule: 'cert-active',
      risk: 'not-yet-valid',
      detail: `certificate not valid until ${obs.notBefore}`,
    });
  }

  const version = obs.protocol ? parseTlsVersion(obs.protocol) : Number.NaN;
  if (Number.isNaN(version) || version < MIN_TLS_VERSION) {
    findings.push({
      rule: 'min-tls-version',
      risk: 'weak-protocol',
      detail: `negotiated ${obs.protocol ?? 'unknown'}; minimum is TLS ${MIN_TLS_VERSION}`,
    });
  }

  const maxAge = obs.hstsHeader ? parseHstsMaxAge(obs.hstsHeader) : null;
  if (maxAge === null) {
    findings.push({
      rule: 'hsts-present',
      risk: 'no-hsts',
      detail: 'no Strict-Transport-Security header with a max-age directive',
    });
  } else if (maxAge < MIN_HSTS_MAX_AGE) {
    findings.push({
      rule: 'hsts-strong',
      risk: 'weak-hsts',
      detail: `HSTS max-age ${maxAge}s is below the ${MIN_HSTS_MAX_AGE}s minimum`,
    });
  }

  return { endpoint: obs.endpoint, gated: true, pass: findings.length === 0, findings };
}

/** Verify a set of endpoints. The batch passes only if every gated endpoint passes. */
export function verifyEndpoints(
  observations: readonly TlsObservation[],
  now: Date = new Date(),
): { pass: boolean; verdicts: TlsVerdict[] } {
  const verdicts = observations.map((o) => verifyTls(o, now));
  return { pass: verdicts.every((v) => v.pass), verdicts };
}
