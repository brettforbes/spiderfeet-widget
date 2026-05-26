# Backlog

Mapped to **SPEC-001** (`.governance/specs/SPEC-001-bootstrap-governance-setup.md`).

| ID | Spec section | Item | Priority | Status |
|----|--------------|------|----------|--------|
| BL-001 | AC-001 | Verify GOV-01…GOV-09 installed | P0 | Done |
| BL-002 | AC-002 | Provisional `PROJECT_INTENT.md` | P0 | Done |
| BL-003 | AC-003 | Backlog ↔ spec mapping (this file) | P0 | Done |
| BL-004 | AC-004 | `AGENTS.md` entrypoint | P0 | Done |
| BL-005 | AC-005 | Git workflow artifacts + local `develop` | P0 | Done (local); remote protection pending |
| BL-006 | AC-006 | Continuity scaffolding | P0 | Done |
| BL-007 | AC-007 | Bootstrap reporting surfaces | P0 | Done |
| BL-008 | AC-008 | GitHub preflight + project board | P0 | Blocked — see INIT-TODO |
| BL-009 | Intent | Replace provisional intent with validated product brief | P1 | Backlog |
| BL-010 | Out of scope | Enable GitHub Issues on repository | P1 | Backlog |
| BL-011 | Out of scope | Configure branch protection on `main` / `develop` | P1 | Backlog |
| BL-012 | — | Re-run bootstrap `update` after GitHub prerequisites | P1 | Backlog |

## Default issue pickup flow

See `.governance/project/ISSUE_PICKUP_FLOW.md`.

When GitHub Issues and Projects are available: pick from canonical board `Ready` → create `feature|fix|docs|chore/<issue-id>-<slug>` from `develop` → PR to `develop` with spec/issue links.

Until Issues are enabled, use backlog items here and SPEC sections as the intake source; record decisions in continuity artifacts.
