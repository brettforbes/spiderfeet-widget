# Bootstrap Feedback (current)

## What went well

- Clean working tree simplified init.
- Template repo already has CI workflow for future branch protection checks.
- Governance rules installed from canonical `governance-foundation/vibegov.io` source.

## Friction

- `gh` project commands require scope refresh — cannot be completed without operator interactive auth.
- Issues disabled prevents canonical issue import and issue-id branch naming.

## Recommendations

1. Run `gh auth refresh -s read:project,project` locally (interactive).
2. Enable Issues in repo settings before next feature branch.
3. Push `develop` and apply branch-protection checklist.
4. Re-run bootstrap **`update`** to adopt/normalize project board.
5. Schedule brief stakeholder session to replace provisional `PROJECT_INTENT.md`.

## Operator feedback channel

File bootstrap improvement notes here or in `history/<timestamp>/feedback.md` before opening public GitHub discussions.
