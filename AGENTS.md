# Agent Entrypoint

This repository uses **VibeGov** governance. Read this file first, then follow linked sources.

## Canonical sources

| Resource | Path / URL |
|----------|------------|
| Bootstrap contract | https://vibegov.io/docs/bootstrap |
| Governance rules | `.governance/rules/gov-*.mdc` (mirrored in `.cursor/rules/`) |
| Project rules | `.governance/project/rules/` (mirrored in `.cursor/rules/proj-*.mdc`) |
| Project intent | `.governance/project/PROJECT_INTENT.md` |
| Active spec (bootstrap) | `.governance/specs/SPEC-001-bootstrap-governance-setup.md` |
| Active spec (product) | `@spiderfeet/.governance/specs/SPEC-002-first-four-stages.md` |
| Backlog | `.governance/project/BACKLOG.md` |
| Stage plan | `@spiderfeet/.seed/02_stage_by_stage_reengineer.md` |
| Bootstrap status | `.governance/project/bootstrap/STATUS.md` |
| Setup blockers | `INIT-TODO.md` |

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

## Operating rules

1. **Stage 0–4 work** must map to SPEC-002 requirement IDs (widget: R2-03-03, R2-04-04, R2-04-08, etc.).
2. Use **bootstrap** and **d3js** skills from spiderfeet for UI work (multi-root workspace).
3. API calls go to spiderfeet FastAPI — never TypeDB from the browser.
4. **Commit policy:** only when the operator explicitly requests commits.

## Tests tab contract

- Backend guide: `@spiderfeet/.docs/analysis/stage4_seed_corpus_and_tests.md`
- Negative fixtures pass on `module_execution.verdict === 'clean_miss'`, not empty produced alone.
- Tests/Subscriptions APIs exclude upstream-broken modules (`service_state: error`); trust API lists, do not duplicate the eight module IDs in widget code.

## Continuity

Checkpoint and promotion rules: `.governance/project/continuity/`

## Issue pickup

`.governance/project/ISSUE_PICKUP_FLOW.md`
