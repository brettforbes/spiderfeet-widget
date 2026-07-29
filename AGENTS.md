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
| **SPEC-008 CLI/API Scan UI — CliScanApp component + Composer (active):** | backend spec `@spiderfeet/.governance/specs/SPEC-008-cli-app-scan-ui-content-platform.md` · this repo's plan `.governance/project/SPEC008_AGENT_PLAN.md` (autonomous execute→PR→merge loop; gate on AA2) · issue index `.governance/project/SPEC008_WIDGET_ISSUE_INDEX.md` · backend issue index `@spiderfeet/.governance/project/SPEC008_ISSUE_INDEX.md` |
| **SPEC-009 CanvasGraph + Web Worker offload (active, widget-only, no backend issues):** | spec `@spiderfeet/.governance/specs/SPEC-009-canvas-graph-component.md` · this repo's plan `.governance/project/SPEC009_AGENT_PLAN.md` (fully autonomous; one structural gate at AG1 — needs AE2 + AF2 completeness labels) · issue index `.governance/project/SPEC009_ISSUE_INDEX.md` (Epics AB–AG, issues #104–#123) · replaces `Viz.ForceGraph` (SVG) with `Viz.CanvasGraph` (canvas + Web Worker) to fix the large-graph page-freeze |

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

## Data Viewer embed

- **Read:** `.docs/data-viewer-embed.md` and skill `.cursor/skills/data-viewer-embed/SKILL.md`
- Modules: `src/js/data-viewer.js`, `src/js/data-viewer-host.js`, `src/js/theme.js`
- Upstream: [Embed_prompt.md](https://github.com/brettforbes/json-yaml-xml-csv-widget/blob/main/Embed_prompt.md)

## Continuity

Checkpoint and promotion rules: `.governance/project/continuity/`

## Issue pickup

`.governance/project/ISSUE_PICKUP_FLOW.md`
