# SPEC-018 issue index — host widget (`spiderfeet-widget`)

**Spec:** `@spiderfeet/.governance/specs/SPEC-018-composer-refine.md`  
**Agent plan:** `@spiderfeet/.governance/project/SPEC018_AGENT_PLAN.md`  
**Repo:** `brettforbes/spiderfeet-widget` · integration branch `develop`

Status legend: `open` → `in progress` → `in review` → `done`.

## Cross-repo map

| Repo | Epic | Issue index |
|------|------|-------------|
| `spiderfeet-widget` | D (Composer progress + temp sequence) | this file |
| `spiderfeet` | A, B, E | `@spiderfeet/.governance/project/SPEC018_ISSUE_INDEX.md` |
| `yaml-workflow-widget` | C | `@yaml-workflow-widget/.governance/project/SPEC018_ISSUE_INDEX.md` |

## Epic D — Composer host: progress + temp viewer sequence

| Code | Issue | Requirement | Depends on | Status |
|------|-------|-------------|------------|--------|
| Epic D | [#269](https://github.com/brettforbes/spiderfeet-widget/issues/269) | R18-15..17 | — | done |
| D1 — Forward i/n via setStepStatuses | [#270](https://github.com/brettforbes/spiderfeet-widget/issues/270) | R18-15 | backend B2 (#1294), YAML C5 (#288) | done (#275) |
| D2 — Temp viewer stability + Reset empty | [#271](https://github.com/brettforbes/spiderfeet-widget/issues/271) | R18-16 | — | done (#273) |
| D3 — Reload temps immediately on FINISHED | [#272](https://github.com/brettforbes/spiderfeet-widget/issues/272) | R18-17 | D2, backend B1 (#1293) | done (#274) |

## Execution order

```
D2 can start immediately
D1 WAIT for backend B2 + YAML C5 on develop
D3 WAIT for D2 + backend B1
```

## Key files (widget)

- `src/js/composer.js` — status poller, Reset, temp reload (D1–D3)
- `src/js/composer-workflow.js` — postMessage to YAML iframe (D1)
- `src/js/composer-temp-graph.js` — loadFromServer, chips, clear/load-generation (D2, D3)
- `src/js/spiderfeet-api.js` — getTemporaryContext / getWorkflowStatus (D1, D2)

## Governance

Branch from `develop`; PR into `develop`; one issue at a time; close with evidence.
