# Vulnerable & Outdated Components

**Impact: HIGH** | **Category: security** | **OWASP: A06** | **Tags:** dependencies, sca, supply-chain

Most breaches ride in on a known-vulnerable dependency. Pin versions, scan continuously, and update
on a cadence — including transitive dependencies.

## Why this matters
A CVE in a transitive package (e.g. a parser) is exploitable even if your code is clean.

## Checklist
- [ ] Dependencies are pinned/locked (lockfile committed).
- [ ] SCA scanning runs in CI (e.g. `pip-audit`, `npm audit`, Dependabot/Snyk).
- [ ] No unmaintained/abandoned packages for security-relevant functions.
- [ ] Base images and runtimes are patched; minimal images used.
- [ ] A process exists to act on high/critical CVEs promptly.
