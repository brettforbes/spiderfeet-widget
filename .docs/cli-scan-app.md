# CliScanApp — reusable 5-tab Scan UI

Reusable widget component for every CLI/API tool scan surface (SPEC-008 / SPEC-011).

**Source:** `src/js/cli-scan-app.js`  
**Namespace:** `window.Widgets.CliScanApp`  
**Styles:** `src/css/custom.css` (`.cli-scan-*`, `.cli-opt-*`)

## Tabs

| Tab | Role |
|-----|------|
| Scan | Options palette + command palette (preview, docs modals, Scan Now) |
| Text | Human-readable output |
| Structured | Data Viewer embed (`DataViewerHost`) |
| Graph | `Viz.CanvasGraph` proposed nugget graph |
| Report | Narrative markdown |

## Mount (any host)

```js
const app = window.Widgets.CliScanApp.create({
  container: document.getElementById('my-mount'),
  toolId: 'nmap',
  mode: 'view', // or 'edit-run'
  detail: scenarioDetailOrNull, // optional `argv: string[]` seeds the form
  hasRun: false,      // R11-13: false locks Text/Structured/Graph/Report
  runEnabled: false,  // R11-13 / AU2: false keeps Scan Now disabled in edit-run
  executeContext: {   // R11-16 / AV1: Scan Now → Widgets.SpiderfeetApi.executeStep
    workflowId: 'workflow--demo',
    stepId: 'sfp_cli_subfinder',
    projectId: 'project--demo',
  },
  onOptionsChange: (snap) => {
    // edit-run only: { toolId, argv, values, scenarioKey }
  },
  onScanComplete: (outcome) => {
    // { ok, kind: 'complete'|'stub'|'error'|'empty'|'busy', message, detail?, result? }
  },
  instanceId: 'composer-nmap-1',
  dataSource: {
    contentBase: '/content',
    corpusBase: '/cli-corpus',
  },
});

// Later
app.reload({ toolId: 'httpx', detail: nextDetail, mode: 'edit-run', hasRun: false, runEnabled: false });
app.setHasRun(true);       // unlock output tabs after a run
app.setRunEnabled(true);   // AU2: enable Scan Now when options validate
app.setExecuteContext({ workflowId, stepId, projectId });
app.runScanNow();          // programmatic execute (stub/errors surface in status)
app.getArgvTokens();       // workflow config.argv tokens (no executable)
app.destroy();
```

### Config

| Field | Required | Notes |
|-------|----------|--------|
| `container` | yes | Host element; component owns its innerHTML |
| `toolId` | yes | Loads `/content/tools/{id}/options-schema` |
| `mode` | no | `view` (default) or `edit-run` |
| `detail` | no | Examination payload: `command`, `output_text`, `structured`, `graph_proposal`, `narrative_markdown`; Composer may pass `argv` to seed from workflow YAML |
| `hasRun` | no | When `false`, Text/Structured/Graph/Report tabs are locked (R11-13). Defaults from whether `detail` carries outputs. |
| `runEnabled` | no | When `false` in `edit-run`, **Scan Now** stays disabled. Defaults `false` for unset (`!hasRun`) edit-run mounts. |
| `executeContext` | no | `{ workflowId, stepId, projectId? }` for SPEC-010 execute (R11-16). |
| `onOptionsChange` | no | `edit-run` callback when options change; snapshot includes `argv` tokens for workflow `config.argv` (R11-14) |
| `onScanComplete` | no | Called after `runScanNow` with stub / error / complete outcome |
| `scenarioKey` | no | Status/label only |
| `instanceId` | no | Unique when multiple instances exist |
| `dataSource.contentBase` | no | Default `/content` |
| `dataSource.corpusBase` | no | Reserved for hosts |

### Modes

- **`view`** — options read-only; Scan button becomes **Scan Complete**; command preview shows captured command when present.
- **`edit-run`** — options editable. **Scan Now** follows `runEnabled` (Composer: AU2 validation). When `hasRun` is false, only the Scan tab is accessible. Option edits emit `onOptionsChange` for host YAML sync.

### Unset-step gating (R11-13 / AT2)

For a Composer step with no prior run:

| Surface | Behavior |
|---------|----------|
| Scan tab | Accessible; option controls editable |
| Scan Now | Disabled until AU2 validation enables it |
| Text / Structured / Graph / Report | Locked until `hasRun` is true |

### Live execute (R11-16 / AV1)

When **Scan Now** is enabled and `executeContext` is set:

1. Calls `Widgets.SpiderfeetApi.executeStep(workflowId, stepId, { project_id, step_id })`
2. Shows progress in the CliScanApp status footer
3. **Stub / error** — visible status message; output tabs stay locked (AN2 stubs until SPEC-010 AO)
4. **Success with four forms** (or `scan_instance_id`) — re-fetches `getScanStep`, populates Text / Structured / Graph / Report, unlocks tabs

Composer passes `executeContext` from the selected project/workflow YAML `id:` + step id. Programmatic: `Composer.executeSelectedStep()`.

### Full workflow execute (R11-23 / AV3)

Composer toolbar **Run Workflow** (enabled only when the YAML DSL iframe reports `validationResult.ok`):

1. Syncs the current editor YAML via `updateWorkflow` (or `createWorkflow` if missing)
2. Calls `Widgets.SpiderfeetApi.executeWorkflow(workflowId, { project_id })`
3. Shows succeeded/failed/skipped summary on Composer status
4. Imports each completed step with `context.export: scan_graph` into the Temporary Subgraph Viewer

Programmatic: `Composer.runWorkflow()`. Per-step Scan Now is unchanged.

### Read-only replay (R11-17 / AV2)

When Composer selects a step that already has a persisted `scan_step`:

1. Resolves deterministic `scan_instance_id` via `SpiderfeetApi.scanInstanceIdFor(workflowId, stepId)` (SPEC-010 uuid5)
2. Fetches `GET /scan-steps/{id}` through `SpiderfeetApi.fetchPriorScanStep`
3. Mounts `CliScanApp` in **`view`** mode with the four forms in `detail`, `hasRun: true`
4. All five tabs are viewable; the rail button shows **Scan Complete** (disabled)

Unset steps (404 / no four forms) keep the existing `edit-run` + AU2 gating path.

## Hosts today

| Host | Mount | Mode |
|------|-------|------|
| CLI Profiling examination detail | `#profiling-cli-scan-mount` via `profiling.js` | `view` |
| Composer (SPEC-011) | `#composer-cliscan-slot` via `composer.js` | `edit-run` (unset) or `view` (prior-run replay) + option → `setYaml` + execute wiring |

Hosts must call `destroy()` before clearing the mount or creating a new instance with the same `instanceId`.

## Graph fullscreen

`CliScanApp` toggles `.profiling-graph-host-fullscreen` on the **mount container**. Generic CSS in `custom.css` covers any host; Profiling adds page-chrome `:has(...)` rules.
