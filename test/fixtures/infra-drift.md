---
# Reference drift report — parsed and verified by test/infra-drift-report.test.ts so this fixture
# can't drift silent. It is the machine record `/drift` emits from `terraform plan -refresh-only`
# (or `pulumi refresh --json`): the resources that differ between the IaC-owned state and the live
# cloud, how each differs (modified / deleted / unmanaged), the attributes that changed, and
# whether the drift touches a security-sensitive surface — so lib/infra-drift-report.ts can classify
# the drift into a bug-list offline. This reference report is deliberately IN-SYNC (no drifted
# resources) — every drift case lives in the test.
cloud: gcp
iac_tool: terraform
environment: prod

# No resource has drifted — the live estate matches its IaC.
resources: []
---

# Reference drift report (in sync)

A refresh against prod shows no divergence: no managed resource was modified or deleted out of
band, and no unmanaged shadow resource exists. `/drift` reports a clean estate. The body is prose
the check ignores.
