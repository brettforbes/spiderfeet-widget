# Agent Entrypoint

This repository uses **VibeGov** governance. Read this file first, then follow linked sources.

## Canonical sources

| Resource | Path / URL |
|----------|------------|
| Bootstrap contract | https://vibegov.io/docs/bootstrap |
| Agent bootstrap | https://vibegov.io/agent.txt |
| Bootstrap manifest | https://vibegov.io/bootstrap.json |
| Governance rules (GOV-01…09) | `.governance/rules/gov-*.mdc` |
| Project intent | `.governance/project/PROJECT_INTENT.md` |
| Active spec | `.governance/specs/SPEC-001-bootstrap-governance-setup.md` |
| Backlog | `.governance/project/BACKLOG.md` |
| Bootstrap status (current) | `.governance/project/bootstrap/STATUS.md` |
| Setup blockers / preflight | `INIT-TODO.md` |

## Delivery loop

`Observe → Plan → Implement → Verify → Document`

## Execution modes

- **Development** — code/spec/shipping changes with verification evidence.
- **Exploration** — discovery, review, backlog hydration (see `gov-08-exploratory-review.mdc`).

## Git workflow (summary)

- `main` — promotion/release only.
- `develop` — integration; normal PR target.
- Work branches: `feature/`, `fix/`, `docs/`, `chore/` + issue id + slug from `develop`.
- Do not push directly to `main` or `develop`.

Full detail: `.governance/project/GIT_WORKFLOW.md`

## Continuity

Checkpoint and promotion rules: `.governance/project/continuity/`

## Hard gate

Do not implement product features until:

1. Pass Gate #1 in `.governance/project/bootstrap/STATUS.md` is satisfied (or blockers explicitly accepted), and
2. `INIT-TODO.md` prerequisites for your task are complete.

## Provider rules mirroring

No provider-native rules directory detected. Use `.governance/rules/*.mdc` only (do not invent `.cursor/rules` placeholders).

## Issue pickup

`.governance/project/ISSUE_PICKUP_FLOW.md`
