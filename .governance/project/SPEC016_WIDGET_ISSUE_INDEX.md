# SPEC-016 issue index — host widget (`spiderfeet-widget`)

**Spec:** `@spiderfeet/.governance/specs/SPEC-016-workflow-run-robustness-and-per-project-context.md`
**Repo:** `brettforbes/spiderfeet-widget` · integration branch `develop`

Status legend: `open` → `in progress` → `in review` → `done`.

## Cross-repo map

| Repo | Epic | Issue index |
|------|------|-------------|
| `spiderfeet-widget` | B (per-project reload + incremental import + viewer UX) | this file |
| `spiderfeet` | A (backend), D (integration) | `@spiderfeet/.governance/project/SPEC016_ISSUE_INDEX.md` |
| `yaml-workflow-widget` | C (target port + collector) | `@yaml-workflow-widget/.governance/project/SPEC016_ISSUE_INDEX.md` |

## Epic B — Host: per-project context, incremental import, clustering, label centring

| Code | Issue | Requirement | Depends on | Status |
|------|-------|-------------|------------|--------|
| Epic B | [#247](https://github.com/brettforbes/spiderfeet-widget/issues/247) | R16-05..08 | — | open |
| B1 — Per-project temporary context reload on switch | [#248](https://github.com/brettforbes/spiderfeet-widget/issues/248) | R16-05 | backend A3 | open |
| B2 — Incremental temp-graph import on step FINISHED | [#249](https://github.com/brettforbes/spiderfeet-widget/issues/249) | R16-06 | — | open |
| B3 — Cluster temp subgraphs (grouped variant) | [#250](https://github.com/brettforbes/spiderfeet-widget/issues/250) | R16-07 | — | open |
| B4 — Clickable label chips centre their nodes | [#251](https://github.com/brettforbes/spiderfeet-widget/issues/251) | R16-08 | B1 | open |

## Execution order

```
B1 (needs backend A3) → B4 ; B2 ∥ B3 (independent)
```

## Key files (widget)
- `src/js/composer-temp-graph.js` — in-memory store, `renderSubgraphToggles`, `clear()`, `buildServerPayload`, `toCanvasGraph` (B1, B3, B4)
- `src/js/projects.js` — `openProjectInComposer`, `restoreComposerFromStorage` (B1)
- `src/js/composer.js` — `loadProjectContexts` (define), `startStatusPoller`/`_importWorkflowTempGraphs`, `mountCanvasGraph` variant (B1, B2, B3)
- `src/js/spiderfeet-api.js` — `getTemporaryContext` (wire in B1)
- `src/js/canvas-graph.js` — VARIANTS grouped (B3); new `centerOnNodes` (B4)

## Governance
Branch from `develop`; PR into `develop`; close each issue with a completion note + evidence; merge before the next. One issue at a time. Commit/merge per operator-approved policy.
