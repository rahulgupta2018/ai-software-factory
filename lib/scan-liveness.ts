/**
 * scan-liveness — a security gate must FAIL CLOSED when its scan did not run (Phase 7 hardening).
 *
 * A pure verifier over a findings list cannot tell "the scan ran and was clean" from "the scan was
 * skipped" — both yield an empty list, so `evaluate*Report([])` returns `pass: true`. That is a
 * fail-OPEN a misconfigured CI can exploit by simply not producing a report: no scan, no findings,
 * gate passes. This module closes that hole for the gates that lack a natural liveness signal.
 *
 * SCA already has one — the supply-chain gate demands a non-empty SBOM (`verifySbom`), so "no scan"
 * is caught by "no bill of materials". SAST, DAST, and the container scan have no such artifact, so
 * their skills must assert a report was actually produced. `verifyScanRan` is that assertion: the
 * caller reports whether the scan step emitted a report, and an absent report blocks.
 *
 * Pure by design — no fs, no process, no network. The caller (the `/security` skill / CI wiring)
 * observes whether the report file exists; this owns the fail-closed policy.
 */

/** The verdict for a scan-liveness check. */
export interface ScanLivenessVerdict {
  /** True only when the scan produced a report. A missing report is never a pass. */
  pass: boolean;
  reason: string;
}

/**
 * Fail closed when a required scan produced no report.
 *
 * @param scan          human label for the gate, e.g. `SAST`, `DAST`, `container-image`.
 * @param reportPresent what the caller observed — did the scan step emit a report to read?
 */
export function verifyScanRan(scan: string, reportPresent: boolean): ScanLivenessVerdict {
  return reportPresent
    ? { pass: true, reason: `${scan} scan report present` }
    : {
        pass: false,
        reason:
          `${scan} scan produced no report — the scan did not run. A security gate fails closed ` +
          `when its scan is absent: wire the ${scan} step into CI (see /pipeline) rather than skipping it.`,
      };
}
