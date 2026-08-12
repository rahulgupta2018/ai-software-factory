---
# Reference infra plan — parsed and verified by test/infra-plan-verify.test.ts so this fixture
# can't drift silent. It is the machine record `/provision` emits from `terraform show -json`
# (or `pulumi preview --json`): the planned resource changes, the protected resources, the
# operator's explicit destroy-consent flag, and the policy-scan findings — so
# lib/infra-plan-verify.ts can prove SAFE-TO-APPLY offline (no protected resource destroyed
# without consent, no long-lived downloadable credential, no raw secret in state, no high-severity
# policy finding). This reference plan is deliberately SAFE — every negative case lives in the test.
cloud: gcp
iac_tool: terraform

# Resource addresses OR types the operator marked protected (stateful / irreversible).
protected_resources:
  - google_sql_database_instance.main
  - google_storage_bucket.tf_state

# The operator has NOT consented to destroy a protected resource; this plan touches none.
consent_to_destroy: false

# The planned resource changes (subset of terraform show -json resource_changes[]).
changes:
  - address: google_storage_bucket.assets
    type: google_storage_bucket
    actions: [create]
  - address: google_service_account.repairs_api
    type: google_service_account
    actions: [create]
  - address: google_storage_bucket_iam_member.api_reads_assets
    type: google_storage_bucket_iam_member
    actions: [create]
  - address: google_sql_database_instance.main
    type: google_sql_database_instance
    actions: [update]

# Policy-scan findings (tfsec / Checkov / OPA-Conftest). Only low/medium here — none blocking.
policy_findings:
  - id: tfsec-google-storage-bucket-logging
    severity: low
    resource: google_storage_bucket.assets
    detail: "bucket access logging is not configured (advisory)"
---

# Reference infra plan (safe)

This plan creates a bucket, a purpose-scoped service account, a least-privilege IAM binding, and
updates a Cloud SQL instance in place. No protected resource is destroyed or replaced, no
long-lived credential is created, no raw secret is written to state, and no high-severity policy
finding is present — so `/provision` may apply it. The body is prose the verifier ignores.
