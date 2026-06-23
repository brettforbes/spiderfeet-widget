## Problem statement

Accordion headers need at-a-glance status for batch runs and subscription tier.

## Desired outcome

Extend Tests accordion header (#36) with icons:

| Icon | Meaning |
|------|---------|
| Green | All run tests in module passed (session: produced objects) |
| Red | One or more failed |
| Grey/none | Not run this session |
| Tier: open lock | No subscription required |
| Tier: key | Free subscription (key required) |
| Tier: paid | Paid subscription |

Icons compose with existing test count badges.

## Epic

Parent: #32 [Epic] Stage 4d — Tests tab UI

## Spec binding

- SPEC-002: **R2-04-04**, **R2-04-08**

## Acceptance criteria

- [ ] Icons update live during Run All / module batch
- [ ] Tier icon from `/tests/plan` or module metadata
- [ ] Accessible labels (aria/text for screen readers)
- [ ] Pass/fail derived from strict rule: `FINISHED` + `produced.length > 0`

## Verification

- Run mixed batch: headers reflect pass/fail accurately
- Module with missing key not shown (see #SFW-04-13)

## Note

Supersedes/extends original #36 "status icon" acceptance criteria.
