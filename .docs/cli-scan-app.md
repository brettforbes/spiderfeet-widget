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
  detail: scenarioDetailOrNull,
  hasRun: false,      // R11-13: false locks Text/Structured/Graph/Report
  runEnabled: false,  // R11-13 / AU2: false keeps Scan Now disabled in edit-run
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
app.destroy();
```

### Config

| Field | Required | Notes |
|-------|----------|--------|
| `container` | yes | Host element; component owns its innerHTML |
| `toolId` | yes | Loads `/content/tools/{id}/options-schema` |
| `mode` | no | `view` (default) or `edit-run` |
| `detail` | no | Examination payload: `command`, `output_text`, `structured`, `graph_proposal`, `narrative_markdown` |
| `hasRun` | no | When `false`, Text/Structured/Graph/Report tabs are locked (R11-13). Defaults from whether `detail` carries outputs. |
| `runEnabled` | no | When `false` in `edit-run`, **Scan Now** stays disabled. Defaults `false` for unset (`!hasRun`) edit-run mounts. |
| `scenarioKey` | no | Status/label only |
| `instanceId` | no | Unique when multiple instances exist |
| `dataSource.contentBase` | no | Default `/content` |
| `dataSource.corpusBase` | no | Reserved for hosts |

### Modes

- **`view`** — options read-only; Scan button becomes **Scan Complete**; command preview shows captured command when present.
- **`edit-run`** — options editable. **Scan Now** follows `runEnabled` (unset Composer steps keep it disabled until AU2 validation). When `hasRun` is false, only the Scan tab is accessible.

### Unset-step gating (R11-13 / AT2)

For a Composer step with no prior run:

| Surface | Behavior |
|---------|----------|
| Scan tab | Accessible; option controls editable |
| Scan Now | Disabled |
| Text / Structured / Graph / Report | Locked until `hasRun` is true |

## Hosts today

| Host | Mount | Mode |
|------|-------|------|
| CLI Profiling examination detail | `#profiling-cli-scan-mount` via `profiling.js` | `view` |
| Composer (SPEC-011 AT) | `#composer-cliscan-slot` via `composer.js` | `edit-run` + unset gating (`hasRun: false`, `runEnabled: false`) |

Hosts must call `destroy()` before clearing the mount or creating a new instance with the same `instanceId`.

## Graph fullscreen

`CliScanApp` toggles `.profiling-graph-host-fullscreen` on the **mount container**. Generic CSS in `custom.css` covers any host; Profiling adds page-chrome `:has(...)` rules.
