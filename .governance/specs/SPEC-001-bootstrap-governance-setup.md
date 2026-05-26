# SPEC-001: Bootstrap & Governance Setup

**Type:** Bootstrap / governance setup spec (product intent still provisional).

**Mode completed:** VibeGov bootstrap `init` (pre-product-code gate).

## Intent

Establish VibeGov governance, strict Git workflow artifacts, continuity scaffolding, and GitHub tracking prerequisites so subsequent feature work is traceable, reviewable, and recoverable across agent sessions.

## Scope

### In scope

- `.governance/rules/` with GOV-01 … GOV-09
- `.governance/project/PROJECT_INTENT.md` (provisional)
- This spec and mapped backlog (`.governance/project/BACKLOG.md`)
- `AGENTS.md`, `INIT-TODO.md`, PR template, branch-protection checklist
- Git workflow documentation and local `develop` branch
- Continuity paths and operating guidance
- Bootstrap reporting (current surface + historical run bundle)
- GitHub preflight classification and blocker capture

### Out of scope

- Product feature implementation (widget behavior, UI, data)
- Enabling GitHub Projects board mutation (blocked on auth scope — tracked in `INIT-TODO.md`)
- Branch protection enforcement on GitHub (documented; not yet configured)

## Acceptance Criteria

| ID | Criterion | Evidence |
|----|-----------|----------|
| AC-001 | `.governance/rules/gov-01` … `gov-09` present | Directory listing / bootstrap STATUS |
| AC-002 | `PROJECT_INTENT.md` exists and marks intent provisional | File path |
| AC-003 | Backlog sections map to this spec | `BACKLOG.md` traceability table |
| AC-004 | `AGENTS.md` points to canonical governance sources | File content |
| AC-005 | Strict Git artifacts installed | PR template, checklist, `GIT_WORKFLOW.md` |
| AC-006 | Continuity structure + checkpoint/diary/promotion guidance | `.governance/project/continuity/` |
| AC-007 | Bootstrap reporting current + history bundle | `.governance/project/bootstrap/` |
| AC-008 | GitHub preflight reported with explicit states | `INIT-TODO.md`, `GITHUB_PROJECT_STATUS.md` |
| AC-009 | No product code written during bootstrap init | Git diff excludes `src/` changes |

## Tests and Evidence

- Pass Gate #1 checklist in `.governance/project/bootstrap/STATUS.md`
- Preflight commands recorded in `INIT-TODO.md`
- Historical run: `.governance/project/bootstrap/history/20260526T141000Z/`

## Documentation Impact

- `AGENTS.md` (new repo entrypoint)
- `.governance/project/*` bootstrap and workflow docs
- `INIT-TODO.md` for open prerequisites

## Verification

Bootstrap `init` is complete when Pass Gate #1 items are satisfied except where explicitly blocked with tracked remediation; product implementation must not start until blockers are resolved or explicitly accepted.

## Change Notes

- 2026-05-26: Initial bootstrap `init` on existing template repo; product brief deferred.
