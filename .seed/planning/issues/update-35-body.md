## Problem statement

Tests filters must support subscription-aware testing after tier model (R2-04-06).

## Desired outcome (extends original filters)

Left panel adds:

- **Subscription tier** filter: All | No subscription | Free (key) | Paid (key)
- **Runnable only** (default on): hide modules needing key without configuration
- Existing search by module name retained

## Epic

Parent: #32

## Spec binding

- SPEC-002: **R2-04-04**, **R2-04-06**

## Acceptance criteria (revised)

- [ ] Tier filter narrows accordion + plan
- [ ] Runnable-only toggle (default true) aligns with SFW-04-13 visibility rules
- [ ] Filter state survives tab switch within session
- [ ] Timeout control retained

## Verification

- Toggle tier filters with mixed catalog
- Confirm hidden modules count in status footer

## Dependencies

- SF-04C-10 tier fields on API
