---
# Reference cost report — parsed and verified by test/infra-cost-report.test.ts so this fixture
# can't drift silent. It is the machine record `/cost` emits from `infracost breakdown`/`diff`
# (--format json): the projected monthly total, the baseline it changes from, the per-resource
# line items with their monthly delta, and the budget + thresholds from
# tech_bindings.infra.cost_budget — so lib/infra-cost-report.ts can decide, offline, whether the
# projection sits inside budget and whether any single resource spiked. `/cost` is ADVISORY
# (measure-and-warn), never a gate. This reference report is deliberately WITHIN budget with no
# spike — every advisory case lives in the test.
cloud: gcp
iac_tool: terraform
currency: GBP

# Budget + thresholds from tech_bindings.infra.cost_budget.
monthly_budget: 2000
warn_threshold: 0.8      # warn once the projection reaches 80% of budget
spike_threshold: 500     # flag any single resource adding >= GBP 500/mo

# The projection and the baseline it changes from.
baseline_monthly: 1200
projected_monthly: 1450

# Per-resource line items (subset of the infracost breakdown). monthly_delta defaults to
# monthly_cost for a brand-new resource.
line_items:
  - address: google_sql_database_instance.main
    monthly_cost: 320.50
    monthly_delta: 120.00
  - address: google_storage_bucket.assets
    monthly_cost: 12.30
    monthly_delta: 12.30
  - address: google_compute_instance.worker
    monthly_cost: 210.00
    monthly_delta: 118.20
---

# Reference cost report (within budget)

The projected GBP 1,450/mo is below the GBP 2,000 budget and under the 80% (GBP 1,600) warn line,
and no single resource adds GBP 500/mo or more — so `/cost` records the estimate with no advisory.
The body is prose the check ignores.
