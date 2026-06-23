## Outcome (revised 2026-06-05)

Tests page drives **subscription-aware** module test execution:

- Only runnable modules visible (no key OR key configured via Subscriptions tab)
- Strict pass/fail with session summary counts
- Subscriptions tab for API key management

## Child stories

### Original scaffold
- #33 Tests tab scaffold
- #34 Summary metrics (incl. session passed/failed/skipped)
- #35 Filters panel (subscription tier + runnable-only)
- #36 Accordion header (extended by #51)
- #37–#41 Accordion bodies, history, exploratory

### Subscriptions & gating (new)
- #48 SFW-04-10 Subscriptions tab scaffold
- #49 SFW-04-11 API key editor + Tests unlock
- #50 SFW-04-13 Hide modules until key configured
- #51 SFW-04-14 Pass/fail + tier icons on accordion

## Cross-repo
- spiderfeet #657 tier classification
- spiderfeet #658 Subscriptions API
- spiderfeet #659–#660 test corpus

## Spec binding
- SPEC-002: R2-04-04, R2-04-05 (SPEC_GAP), R2-04-06 (SPEC_GAP), R2-04-08 (SPEC_GAP)

## Board state
Backlog — move to Ready when #657/#658 land.
