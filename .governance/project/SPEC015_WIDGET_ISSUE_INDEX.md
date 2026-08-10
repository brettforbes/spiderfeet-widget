# SPEC-015 issue index — widget (`spiderfeet-widget`)

**Spec:** `@spiderfeet/.governance/specs/SPEC-015-workflow-live-status-viz.md`
**Repo:** `brettforbes/spiderfeet-widget` · integration branch `develop`
**Backend index:** `@spiderfeet/.governance/project/SPEC015_ISSUE_INDEX.md`
**YAML widget index:** `@yaml-workflow-widget/.governance/project/SPEC015_ISSUE_INDEX.md`

Status legend: `open` → `in progress` → `in review` → `done`.

Status mapping (backend `scan_status` → UI): `UNKNOWN`=waiting; `STARTING`/`RUNNING`=running; `FINISHED`=complete; `ERROR-FAILED`=failed. Key by DSL step id.

## Epic C — Host: poll status + forward to DAG + unwind

| Code | Issue | Requirement | Depends on | Status |
|------|-------|-------------|------------|--------|
| Epic C | [#231](https://github.com/brettforbes/spiderfeet-widget/issues/231) | R15-12..17 | Backend A1-A4, YAML B1 | in review |
| C1 — API client: async execute + getWorkflowStatus | [#232](https://github.com/brettforbes/spiderfeet-widget/issues/232) | R15-12 | Backend A1-A3 | done |
| C2 — composer-workflow.js setStepStatuses bridge | [#233](https://github.com/brettforbes/spiderfeet-widget/issues/233) | R15-13 | YAML B1 | done |
| C3 — Run Workflow live polling + forwarding | [#234](https://github.com/brettforbes/spiderfeet-widget/issues/234) | R15-14 | C1, C2 | done |
| C4 — Scan Now live polling + forwarding | [#235](https://github.com/brettforbes/spiderfeet-widget/issues/235) | R15-15 | Backend A3, C2 | done |
| C5 — Reset + project-switch status unwind/paint | [#236](https://github.com/brettforbes/spiderfeet-widget/issues/236) | R15-16 | Backend A4, C2 | done |
| C6 — Poller lifecycle + status legend | [#237](https://github.com/brettforbes/spiderfeet-widget/issues/237) | R15-17 | C3 | in review |

## Execution order

```
C1 (needs backend A1-A3) → C3
C2 (needs YAML B1) → C3
C4 (needs backend A3, C2) ; C5 (needs backend A4, C2) ; C6 (needs C3)
```

## Key files (host)
- `src/js/spiderfeet-api.js` — `executeWorkflowAsync`, `executeStepAsync`, `getWorkflowStatus` (C1)
- `src/js/composer-workflow.js` — `setStepStatuses` bridge + `HOST_MSG` (C2)
- `src/js/composer.js` — `runWorkflow` poll/forward (C3), Scan Now path (C4), `resetWorkflow` unwind + project-open paint (C5), poller lifecycle (C6)
- `src/js/cli-scan-app.js` — Scan Now execute integration (C4)
- `src/js/projects.js` — `openProjectInComposer` / restore paint (C5)
- `src/html/content.html` — status legend (C6)

## Governance
Branch from `develop`; PR into `develop`; close each issue with a completion note + evidence; merge before the next. One issue at a time. Bind to SPEC-015 requirement IDs.
