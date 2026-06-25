## Problem statement

Tests tab currently lists all OSINT modules including those that **cannot run** (missing API key). This caused 515/526 failures in batch runs. Modules requiring a key should be **hidden** until configured on Subscriptions page.

## Desired outcome

**Visibility rule:** Show module accordion item only if:
1. `subscription_tier === none` (no key required), OR
2. Key required AND `has_api_key === true` from `/tests/plan`

**Run rule:** Same gate for Run button, Run module all, and global Run All (only visible/runnable tests).

## Epic

Parent: #32 [Epic] Stage 4d — Tests tab UI

## Spec binding

- SPEC-002: **R2-04-06**, **R2-04-08**

## Acceptance criteria

- [ ] Catalog/plan load filters modules by visibility rule
- [ ] Summary counts reflect **runnable** tests only (or separate "hidden (need key)" count)
- [ ] Search/filter does not reveal hidden modules unless "Show locked" toggle (optional, default off)
- [ ] Global Run All confirm dialog shows runnable count only

## Verification

- Fresh install: Tests tab shows only `none`-tier modules (~95 modules, fewer tests)
- After adding key on Subscriptions: module accordion appears in Tests

## Related

- Updates scope of #35 Filters panel, #33 scaffold
