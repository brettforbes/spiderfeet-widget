## Problem statement

Summary table must reflect **session test outcomes** under strict pass rules, not only TypeDB route states.

## Desired outcome (extends original)

Coverage summary shows:

- Modules / Tests (runnable count when gated)
- Session: **Passed**, **Failed**, **Skipped** (missing key, no input, user stop)
- TypeDB states: not-started, in-test, tested (when connected)

## Epic

Parent: #32

## Spec binding

- SPEC-002: **R2-04-04**, **R2-04-08** (SPEC_GAP)

## Acceptance criteria (revised)

- [ ] Passed = strict pass (`FINISHED` + produced objects)
- [ ] Failed includes zero-output finishes and errors
- [ ] Skipped includes key-gated modules excluded from Run All
- [ ] Counts update live during batch

## Verification

- Run All partial batch: numbers match accordion/results

## Note

Partial implementation exists in widget; align with SFW-04-13/14 on completion.
