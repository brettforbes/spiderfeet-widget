# Default Issue Pickup Flow

## When GitHub Issues + Project board are available

1. **Select work** — Choose an item in `Ready` on the canonical project board (Status field).
2. **Confirm binding** — Issue references spec path and acceptance criteria; expand one-liners before coding (`gov-06-issues.mdc`).
3. **Branch** — From latest `develop`:
   ```text
   git checkout develop && git pull
   git checkout -b feature/<issue-number>-<short-slug>
   ```
4. **Board state** — Move issue to `In progress`.
5. **Implement** — Smallest coherent change; mode = Development unless exploring.
6. **Verify** — Record evidence in PR and issue comments at meaningful state changes.
7. **Review** — Open PR to `develop`; move board to `In review`.
8. **Merge** — After checks + review; move to `Done`; update traceability in spec/backlog.
9. **Continuity** — Checkpoint decisions/blockers in `.governance/project/continuity/`.

## Current repository limitations

- **Issues disabled** — Use `.governance/project/BACKLOG.md` and spec ACs until Issues are enabled (`INIT-TODO.md`).
- **Project board blocked** — `gh` missing `read:project` scope; run `gh auth refresh -s read:project,project` then bootstrap `update`.

## Fallback intake (now)

1. Pick backlog row in `BACKLOG.md` tied to active spec.
2. Ensure spec ACs are clear; create `SPEC-002+` for product features when intent is validated.
3. Use branch naming with backlog id: `feature/BL-009-<slug>` until GitHub issue IDs exist.

## Priority field (board)

`P0` > `P1` > `P2` — prefer `P0` ready items unless redirected by human.
