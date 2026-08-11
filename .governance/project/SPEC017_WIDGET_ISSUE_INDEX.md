# SPEC-017 issue index — host widget (`spiderfeet-widget`)

**Spec:** `@spiderfeet/.governance/specs/SPEC-017-multi-temporary-subgraphs-and-dag-colors.md`  
**Agent plan:** `@spiderfeet/.governance/project/SPEC017_AGENT_PLAN.md`  
**Repo:** `brettforbes/spiderfeet-widget` · integration branch `develop`

Status legend: `open` → `in progress` → `in review` → `done`.

## Cross-repo map

| Repo | Epic | Issue index |
|------|------|-------------|
| `spiderfeet-widget` | B (read-only multi-subgraph viewer) | this file |
| `spiderfeet` | A, D | `@spiderfeet/.governance/project/SPEC017_ISSUE_INDEX.md` |
| `yaml-workflow-widget` | C | `@yaml-workflow-widget/.governance/project/SPEC017_ISSUE_INDEX.md` |

## Epic B — Read-only multi-subgraph Temporary Viewer

| Code | Issue | Requirement | Depends on | Status |
|------|-------|-------------|------------|--------|
| Epic B | [#256](https://github.com/brettforbes/spiderfeet-widget/issues/256) | R17-07..10 | — | done |
| B1 — Read-only list load + centre chips | [#257](https://github.com/brettforbes/spiderfeet-widget/issues/257) | R17-07 | backend A4 (#1270) | done |
| B2 — Reload on FINISHED + project switch | [#258](https://github.com/brettforbes/spiderfeet-widget/issues/258) | R17-08 | B1 | done |
| B3 — Cluster icon | [#259](https://github.com/brettforbes/spiderfeet-widget/issues/259) | R17-09 | B1 | done |
| B4 — Run disabled until Reset | [#260](https://github.com/brettforbes/spiderfeet-widget/issues/260) | R17-10 | B1, backend A5 (#1271) | done |

## Execution order

```
WAIT for backend A4 on develop
B1 → B2 ∥ B3 ∥ B4
```

## Key files (widget)

- `src/js/composer-temp-graph.js` — store, chips, loadFromServer (B1–B3)
- `src/js/composer.js` — status poller, Run/Reset (B2, B4)
- `src/js/spiderfeet-api.js` — list temporary contexts (B1)
- `src/js/projects.js` — project switch clear/reload (B2)
- `src/js/canvas-graph.js` — centre / cluster helpers (B3)

## Governance

Branch from `develop`; PR into `develop`; one issue at a time; close with evidence.
