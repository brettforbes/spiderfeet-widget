# Backlog

Primary tracker: [widget issues](https://github.com/brettforbes/spiderfeet-widget/issues) + [spiderfeet issues](https://github.com/brettforbes/spiderfeet/issues).  
Spec: **SPEC-002** (`@spiderfeet/.governance/specs/SPEC-002-first-four-stages.md`).

## Stage program (widget epics)

| Stage | Epic | Spec IDs | Status |
|-------|------|----------|--------|
| 0 | [#1](https://github.com/brettforbes/spiderfeet-widget/issues/1) Governance | R2-00-01 | In progress |
| 1 | [#7](https://github.com/brettforbes/spiderfeet-widget/issues/7) Rebrand | R2-01-01 | Backlog |
| 3 | [#13](https://github.com/brettforbes/spiderfeet-widget/issues/13) Maps UI | R2-03-03 | Backlog |
| 4 | [#32](https://github.com/brettforbes/spiderfeet-widget/issues/32) Tests tab | R2-04-04 | Backlog |

Backend-only stages (2, 4 API/schema) live in the spiderfeet repo — see `@spiderfeet/.governance/project/BACKLOG.md`.

## Bootstrap backlog (SPEC-001) — completed / carry-over

| ID | Item | Status |
|----|------|--------|
| BL-001 | GOV-01…09 installed | Done |
| BL-002 | PROJECT_INTENT | Done (updated 2026-06-03) |
| BL-003 | Backlog mapping | Done |
| BL-004 | AGENTS.md | Done |
| BL-005 | Git workflow + local develop | Done |
| BL-006 | Continuity | Done |
| BL-007 | Bootstrap reporting | Done |
| BL-008 | GitHub project board | Blocked — see INIT-TODO |
| BL-009 | Validated product brief | Done via SPEC-002 / stage plan |
| BL-010 | Enable GitHub Issues | Done (2026-06-03) |

## Pickup flow

1. Read `INIT-TODO.md`.
2. Pick **Ready** issue from active stage epic on GitHub.
3. Branch `feature/<issue>-<slug>` from `develop` (or `main` until develop is pushed).
4. PR to `develop` with SPEC-002 / issue links.
