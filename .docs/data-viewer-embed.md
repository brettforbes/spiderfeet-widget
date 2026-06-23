# Data Viewer embed — spiderfeet-widget host integration

**Upstream contract (canonical):** [json-yaml-xml-csv-widget / Embed_prompt.md](https://github.com/brettforbes/json-yaml-xml-csv-widget/blob/main/Embed_prompt.md)  
**SpiderFeet integration map:** [03-spiderfeet-integration.md](https://github.com/brettforbes/json-yaml-xml-csv-widget/blob/main/.plan/03-spiderfeet-integration.md)

This document records how **this repo** implements the embed. Read it before touching Structured tabs or adding new Data Viewer panes.

---

## Dev stack

| Service | Command | URL |
|---------|---------|-----|
| Data Viewer | `.\start.ps1` in `json-yaml-xml-csv-widget` | `http://localhost:3000/widget` (embed) |
| SpiderFeet API | `.\start.ps1 -Mode api` in `spiderfeet` | `http://127.0.0.1:8001/api/v1` |
| Widget | `npm start` / `.\start.ps1` in `spiderfeet-widget` | `http://localhost:4001` |

Widget root sets embed URL:

```html
<div id="widget-root" data-data-viewer-url="http://localhost:3000/widget" ...>
```

Override at runtime via API `GET /cli-corpus/config` → `data_viewer_url` or env `SPIDERFEET_DATA_VIEWER_URL` on the backend.

---

## Module layout (do not bypass)

| Module | Path | Role |
|--------|------|------|
| **DataViewer** | `src/js/data-viewer.js` | Protocol v1 bridge: `postMessage`, queue-until-ready, format inference, theme sync |
| **DataViewerHost** | `src/js/data-viewer-host.js` | Reusable tab/pane helper: register iframe, tab-shown reload, fullscreen hooks |
| **Theme** | `src/js/theme.js` | Shell `data-bs-theme`; calls `DataViewer.syncTheme()` on toggle |

Webpack order in `webpack.common.js`: `theme.js` → `data-viewer.js` → `data-viewer-host.js` → page modules (e.g. `profiling.js`).

> **Served CSS gotcha:** styling must go in **`src/css/custom.css`**. `src/sass/custom.scss` is loaded via `raw-loader` and discarded — only `src/css/**/*.css` is merged into the served `widget.css`. Adding a **new JS file** to the `widget.js` list is a webpack-config change; **restart `npm start`** (the running watcher won't pick it up).

---

## Adding a viewer to a new tab (Maps, Tests, Composer, …)

### 1. HTML

```html
<div class="tab-pane fade profiling-tab-pane-fill" id="pane-maps-structured">
  <div class="data-viewer-host">
    <iframe
      id="data-viewer-maps"
      title="Structured data viewer"
      class="data-viewer-iframe"
      src="http://localhost:3000/widget"
    ></iframe>
  </div>
</div>
```

Rules:

- **Unique `id`** on iframe = `instanceId`. It is *not* necessarily the `frameId` sent in messages — cross-origin embeds report `frameId: null`; the bridge echoes the viewer-reported value (see "Cross-origin `frameId`" below).
- **Stable `src`** — do not churn query strings; data flows via `postMessage` only.
- **Do not remove** iframe when hiding tabs; use `d-none` / Bootstrap tab panes only.
- Parent chain must give height: `html, body, #widget-root { height: 100% }`, flex column, `.data-viewer-host { flex:1; min-height:0 }`, iframe `height:100%`.

### 2. JavaScript

```javascript
const viewer = DataViewerHost.create({
  instanceId: 'data-viewer-maps',
  iframe: '#data-viewer-maps',
  tabButton: '#maps-tab-structured',   // optional: reload when tab shown
  importExportRoot: '/maps/exports',   // logical path for delegated IO
  onFullscreen: (detail) => { /* expand host layout */ },
  // or built-in layout:
  fullscreenRoot: '#profiling-view-detail',
  structuredTabButton: '#profiling-tab-structured',
  onReady: (api) => { /* optional */ },
});

// When API/scan data arrives:
viewer.setPayload({
  content: rawString,
  filename: 'scan.xml',   // strongly recommended
  format: 'xml',            // optional — inferred if omitted
});
```

### 3. CSS classes

- `.data-viewer-host` — flex fill container
- `.data-viewer-iframe` — full-size iframe
- Embed/graph tabs (fill height): `.profiling-tab-pane-fill`
- Scrollable non-embed tabs (text, markdown): `.profiling-tab-pane-scroll` with `overflow: auto`

---

## Fullscreen handoff (viewer ↔ host)

The viewer **reports** layout intent; the host **resizes chrome**. The viewer does not expand the iframe by itself.

### Viewer → host events

| User action in viewer | Event | Payload |
|----------------------|-------|---------|
| Expand graph (hide text pane) — bottom bar panel-close | `data-viewer-fullscreen-changed` | `fullscreen: true`, `target: "graph"` |
| Restore / reduce — left chevron or panel-close again | `data-viewer-fullscreen-changed` | `fullscreen: false`, `target: "graph"` |
| Browser fullscreen — top toolbar icon | `data-viewer-fullscreen-changed` | `fullscreen: true/false`, `target: "browser"` |

`DataViewer` receives the iframe `postMessage`, then dispatches `data-viewer:fullscreen-changed` on `window` with `{ instanceId, fullscreen, target }`.

### Host responsibilities

On **`target: "graph"` + `fullscreen: true`**:

1. Expand the embed root to fill the widget pane (fixed overlay).
2. Hide host chrome marked `data-viewer-chrome="graph"` (exam sub-tabs, command line, meta, pane toolbar).
3. Force the structured viewer tab/pane visible (Bootstrap tab show on `structuredTabButton`).
4. Let the iframe fill remaining height.

On **`target: "graph"` + `fullscreen: false`**:

1. Remove fullscreen classes.
2. Restore the exam sub-tab that was active before graph fullscreen.

On **`target: "browser"`** — same graph layout expansion, plus hide `#widget-root > header` (main navbar).

In embed mode (`/widget` route), the viewer **does not** call `requestFullscreen()` inside the iframe (browsers block this cross-origin). The toolbar posts `data-viewer-fullscreen-changed` with `target: "browser"` and the host applies the overlay. The iframe should include `allow="fullscreen"` (`DataViewer.register` adds it automatically).

### Built-in handler (recommended)

```javascript
const viewer = DataViewerHost.create({
  instanceId: 'data-viewer-profiling',
  iframe: '#data-viewer-profiling',
  tabButton: '#profiling-tab-structured',
  fullscreenRoot: '#profiling-view-detail',           // element that gets overlay classes
  structuredTabButton: '#profiling-tab-structured', // shown when graph fullscreen enters
  tabListSelector: '#profiling-exam-tabs',            // remembers prior sub-tab for restore
  importExportRoot: '/cli-corpus',
});
```

Or explicit handler:

```javascript
onFullscreen: DataViewerHost.createFullscreenHandler({
  instanceId: 'data-viewer-maps',
  root: '#maps-view-detail',
  structuredTabButton: '#maps-tab-structured',
}),
```

Applied CSS classes on `fullscreenRoot`:

| Class | When |
|-------|------|
| `data-viewer-host-fullscreen` | any fullscreen |
| `data-viewer-host-fullscreen-graph` | `target: "graph"` |
| `data-viewer-host-fullscreen-browser` | `target: "browser"` (also on `#widget-root`) |

Mark hideable chrome in HTML: `data-viewer-chrome="graph"`. Styles in `src/css/custom.css`.

### Host → viewer (optional)

Drive the viewer from the host:

```javascript
DataViewer.setFullscreen('data-viewer-profiling', true, 'graph');
DataViewer.setFullscreen('data-viewer-profiling', false, 'graph');
```

Posts `data-viewer-fullscreen` into the iframe (queued until ready).

---

## Format detection (`DataViewer.inferFormat`)

Used automatically by `setData` / `setPayload`. Priority:

1. Explicit `format` (`json` | `yaml` | `xml` | `csv`; `jsonl` → `json`)
2. `filename` extension (`.xml`, `.json`, `.yaml`, `.csv`, …)
3. Content sniff: `<?xml` → xml; `{`/`[` → json; `---` / `key:` → yaml; comma-separated rows → csv

**Critical:** Viewer must receive `data-viewer-set-mode` with the resolved format **before** `data-viewer-set`. The bridge enforces this with a **120ms** delay (`DataViewer.MODE_SET_DELAY_MS`). Do not post both in the same synchronous tick from page code — use `DataViewer.setData()` or `viewer.setPayload()`.

---

## Message sequence (per load)

```
iframe loads /widget
  ← data-viewer-ready
  → data-viewer-configure { theme, parentOrigin, importExportRoot, fileIoMode, toolsMenuEnabled }
  → data-viewer-set-mode { format: "xml", clear: false }
  → (120ms)
  → data-viewer-set { content, format, filename, options: { theme } }
```

Theme changes from shell:

```
Theme.apply() on #widget-root
  → DataViewer.syncTheme(theme)
  → data-viewer-configure + data-viewer-theme (per iframe)
```

On `data-viewer:ready`, host re-sends current shell theme. Embed `/widget` hides the viewer's own theme toggle; **do not** force light on viewer mount (races host configure).

Viewer → host: `data-viewer-theme-changed` (apply with `fromViewer:true` to avoid a loop).

---

## Cross-origin `frameId` (critical)

In dev the host runs on `localhost:4001` and the viewer iframe on `localhost:3000` — **different origins**. The viewer derives its own id with `window.frameElement?.getAttribute("id")`, which browsers force to `null` across origins. Its `matchesEmbedFrame()` then **rejects any host message whose `frameId` is a non-null string** (e.g. `data-viewer-profiling`), so content and `set-mode` silently never apply (viewer stays empty + JSON).

**Contract:** never assume the viewer's `frameId` equals your iframe `id`. Capture the `frameId` the viewer reports in `data-viewer-ready` (it is `null` cross-origin, the real id when same-origin static export) and echo exactly that back on every message. `DataViewer` does this via `state.remoteFrameId` (`_onReadyFrom`) and `_post` overrides the outgoing `frameId`. Per-iframe targeting is still correct because we post to a specific `iframe.contentWindow`.

---

## CLI Profiling (reference implementation)

| Piece | Value |
|-------|--------|
| Instance ID | `data-viewer-profiling` |
| Tab button | `#profiling-tab-structured` |
| Page module | `src/js/profiling.js` |
| API | `GET /api/v1/cli-corpus/tools/{tool}/scenarios/{key}` |
| Import root | `/cli-corpus` |

Scenario model (backend): **one row per scan command**, not per file type. Each scenario bundle under:

`@spiderfeet/.docs/docs-for-cli-tools/app_examination_docs/<tool>/scenarios/<scenario_key>/`

| File | Tab |
|------|-----|
| `output_text.txt` | Text |
| `output_structured.*` | Structured (Data Viewer) |
| `proposed_nuggets_edges.json` | Graph |
| `nugget_graph_structure.md` | Structure doc |

`setPayload` passes `structured.content`, `structured.filename`, `structured.format` from API.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| “Start typing…” / empty viewer **and format stuck on JSON** | **Most common cause: cross-origin `frameId` mismatch** (see section above). The viewer rejects messages because `window.frameElement` is null across origins. Echo the viewer-reported `frameId` (null cross-origin), don't send your iframe id. Also check viewer not-ready / dev server on :3000. |
| Format stuck on JSON | Echo viewer `frameId`; pass explicit `format`/`filename`; ensure `set-mode` runs before `set` (use bridge, not raw postMessage). |
| Theme out of sync | Shell toggle must call `DataViewer.syncTheme()`; configure must include `theme` on ready. |
| Iframe toolbar-height only | Fix host CSS height chain (§ HTML above). |
| Data lost on tab switch | Do not unmount iframe; `DataViewerHost` uses `tabButton` + `reloadWhenVisible()`. |
| API 404 on `/scenarios` | Restart FastAPI after pulling `cli-corpus` routes; port 8001 must be free. |

---

## Files to read when debugging

- `src/js/data-viewer.js` — protocol + `inferFormat` + `setData`
- `src/js/data-viewer-host.js` — `create()`, tab wiring
- `src/js/profiling.js` — first consumer
- `src/sass/custom.scss` — `.data-viewer-host`, tab scroll/layout
- `@spiderfeet/spiderfeet/api/services/cli_corpus.py` — scenario bundles API
