# CliScanApp — reusable 5-tab Scan UI

Reusable widget component for every CLI/API tool scan surface (SPEC-008).

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
  onOptionsChange: (snap) => {
    // edit-run only: { toolId, argv, values, scenarioKey }
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
app.setRunEnabled(true);   // AU2: enable Scan Now when editor validationResult.ok
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
| `runEnabled` | no | When `false` in `edit-run`, **Scan Now** stays disabled. Defaults `false` for unset (`!hasRun`) edit-run mounts. Composer AU2 sets this from editor `validationResult.ok` (R11-15). |
| `onOptionsChange` | no | `edit-run` callback when options change; snapshot includes `argv` tokens for workflow `config.argv` (R11-14) |
| `scenarioKey` | no | Status/label only |
| `instanceId` | no | Unique when multiple instances exist |
| `dataSource.contentBase` | no | Default `/content` |
| `dataSource.corpusBase` | no | Reserved for hosts |

### Modes

- **`view`** — options read-only; Scan button becomes **Scan Complete**; command preview shows captured command when present.
- **`edit-run`** — options editable. **Scan Now** follows `runEnabled` (Composer drives it from editor `validationResult`, not client-side guesses). When `hasRun` is false, only the Scan tab is accessible. Option edits emit `onOptionsChange` for host YAML sync.

### Unset-step gating (R11-13 / AT2) + validation enable (R11-15 / AU2)

For a Composer step with no prior run:

| Surface | Behavior |
|---------|----------|
| Scan tab | Accessible; option controls editable |
| Scan Now | Disabled until Composer applies editor `validationResult.ok` via `setRunEnabled` |
| Text / Structured / Graph / Report | Locked until `hasRun` is true |

Composer listens for `composer-workflow:validation-result` (from the yaml-workflow-widget `validationResult` postMessage) and toggles Scan Now accordingly.

## Hosts today

| Host | Mount | Mode |
|------|-------|------|
| CLI Profiling examination detail | `#profiling-cli-scan-mount` via `profiling.js` | `view` |
| Composer (SPEC-011) | `#composer-cliscan-slot` via `composer.js` | `edit-run` + unset gating + option → `setYaml` argv round-trip |

Hosts must call `destroy()` before clearing the mount or creating a new instance with the same `instanceId`.

## Graph fullscreen

`CliScanApp` toggles `.profiling-graph-host-fullscreen` on the **mount container**. Generic CSS in `custom.css` covers any host; Profiling adds page-chrome `:has(...)` rules.
