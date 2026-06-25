---
name: data-viewer-embed
description: Embed json-yaml-xml-csv-widget in spiderfeet-widget via postMessage. Use when adding or fixing Structured tabs, DataViewer/DataViewerHost modules, theme sync, format/mode handshake, cross-origin frameId issues, full-height layout, fullscreen/graph-expand/browser-fullscreen handoff, or the CLI Profiling structured pane.
---

# Data Viewer embed (spiderfeet-widget)

The Data Viewer is the `json-yaml-xml-csv-widget` app embedded in an **iframe** and driven over `postMessage`. The host owns the data, theme, and fullscreen policy; the viewer is a slave that renders what it is told.

## Read first

| Doc | Path |
|-----|------|
| **Host integration (this repo)** | `.docs/data-viewer-embed.md` |
| Upstream protocol | https://github.com/brettforbes/json-yaml-xml-csv-widget/blob/main/Embed_prompt.md |
| Upstream source (if checked out locally) | `C:\projects\json-yaml-xml-csv-widget\apps\www\src\hooks\useEmbedBridge.ts`, `.../lib/utils/embedMessage.ts` |

When behaviour is confusing, **read the upstream `useEmbedBridge.ts` / `embedMessage.ts` directly** — they are the ground truth for the contract.

## Two-layer API

1. **`Widgets.DataViewer`** (`src/js/data-viewer.js`) — low-level protocol bridge (handshake, frameId, queue, format, theme)
2. **`Widgets.DataViewerHost`** (`src/js/data-viewer-host.js`) — tab/pane integration (register, reload-on-show, fullscreen, payload memory)

**Always use `DataViewerHost.create()` + `setPayload()` in page modules.** Never hand-roll `postMessage`.

## Critical invariants (the things that break)

1. **Echo the viewer's reported `frameId` — never send your own iframe id.**
   Dev is cross-origin (host `:4001`, viewer `:3000`). The viewer derives its id from `window.frameElement?.getAttribute("id")`, which is forced to `null` cross-origin. Its `matchesEmbedFrame()` then rejects any message whose `frameId` is a non-null string. `DataViewer` captures the reported id in `data-viewer-ready` (`_onReadyFrom` → `state.remoteFrameId`) and `_post` stamps it on every message. Per-iframe targeting still works because we post to a specific `iframe.contentWindow`.
2. **Styling lives in `src/css/custom.css`, NOT `src/sass/custom.scss`.**
   The SCSS is loaded via `raw-loader` and discarded; only `src/css/**/*.css` is merged into the served `widget.css`. Edit `custom.css` or your change will never reach the browser.
3. **`set-mode` must precede `set`, with a delay.** `DataViewer.setData` sends `data-viewer-set-mode` then `data-viewer-set` after `MODE_SET_DELAY_MS` (120ms). Don't collapse them.
4. **Full height needs an unbroken flex chain.** Every ancestor from the tab pane down to the iframe needs `min-height:0` and the iframe needs `height:100%`. Bootstrap has no `min-h-0` helper — it's defined in `custom.css`.
5. **New JS files need a dev-server restart.** `webpack.common.js` lists `widget.js` sources explicitly; adding a file is a config change the running watcher won't pick up. Restart `npm start`.

## `setPayload` contract

```javascript
viewer.setPayload({
  content: '<raw string>',     // required
  filename: 'scan.xml',        // strongly recommended — drives format detection
  format: 'xml',               // optional — inferred from filename/content if omitted
});
```

Format resolves to one of `json | yaml | xml | csv`. Pass the API's explicit `format` when you have it; otherwise `filename` extension; otherwise content sniffing. JSON is the fallback default.

## Add a Data Viewer to a new tab (copy-paste recipe)

### 1. HTML (`src/html/content.html`)

```html
<div class="tab-pane fade profiling-tab-pane-fill" id="pane-mytab" role="tabpanel">
  <div class="data-viewer-host" data-data-viewer-host="mytab">
    <iframe
      id="data-viewer-mytab"
      title="Structured data viewer"
      class="data-viewer-iframe"
      allow="fullscreen"
      src="http://localhost:3000/widget"
    ></iframe>
  </div>
</div>
```

- iframe `id` is the `instanceId`. Stable `src` (no query churn). Do **not** swap `src` or unmount on tab switch.
- Add `allow="fullscreen"` on the iframe (`DataViewer.register` also sets this in JS).

### 2. HTML chrome markers (fullscreen)

Mark host UI that should hide when the viewer expands. Use space-separated values if needed:

```html
<ul id="mytab-exam-tabs" data-viewer-chrome="graph" role="tablist">…</ul>
<p id="mytab-detail-meta" data-viewer-chrome="graph"></p>
```

`data-viewer-chrome="graph"` elements are hidden when graph **or** browser fullscreen is active (CSS in `custom.css`).

### 3. CSS (`src/css/custom.css` — the served file)

Reuse existing classes: `.data-viewer-host`, `.data-viewer-iframe`, and the **fullscreen overlay** classes (already in `custom.css`):

| Class | Applied to | When |
|-------|------------|------|
| `data-viewer-host-fullscreen` | `fullscreenRoot` element | Any fullscreen |
| `data-viewer-host-fullscreen-graph` | `fullscreenRoot` | Graph or browser expand |
| `data-viewer-host-fullscreen-browser` | `fullscreenRoot` + `#widget-root` | Browser toolbar fullscreen |

Fill panes need ID-specific rules like `#pane-mytab.active.show { display:flex; … min-height:0 }`.

### 4. JavaScript (page module)

```javascript
const viewer = DataViewerHost.create({
  instanceId: 'data-viewer-mytab',
  iframe: '#data-viewer-mytab',
  tabButton: '#mytab-tab-button',   // reloads content when tab becomes visible
  fullscreenRoot: '#mytab-view-detail',
  structuredTabButton: '#mytab-tab-structured',
  importExportRoot: '/my-exports',
  onReady: () => pushMyData(),
});

// when data is available:
viewer.setPayload({ content, filename, format });
```

### 5. Wire-up

- Add the module to `webpack.common.js` `widget.js` list **after** `data-viewer-host.js`, then **restart `npm start`**.
- Theme: on `shell:theme-changed` call `DataViewer.syncTheme(theme)`.

## Message sequence (per load)

```
iframe loads /widget
  ← data-viewer-ready { frameId: <null cross-origin | id same-origin> }   // capture this frameId
  → data-viewer-configure { theme, parentOrigin, importExportRoot, fileIoMode, toolsMenuEnabled }
  → data-viewer-set-mode { format, clear:false }
  → (120ms)
  → data-viewer-set { content, format, filename, options:{ theme } }
```

## Theme

**Host is authoritative** in embed mode. The viewer toolbar theme toggle is hidden on `/widget`.

Flow when the shell toggles light/dark (`Theme.apply` → `data-bs-theme` on `#widget-root`):

1. `Theme.apply` calls `DataViewer.syncTheme(theme)` (skips when change came from viewer via `fromViewer`).
2. `shell:theme-changed` fires; `DataViewerHost` listener also calls `syncTheme` (belt-and-braces).
3. Each registered iframe receives `data-viewer-configure` + `data-viewer-theme` with the new theme.
4. On `data-viewer:ready`, host re-sends current shell theme so late handshakes match.

Viewer → host (only if viewer theme UI were enabled): `data-viewer-theme-changed` → `Theme.apply(theme, { fromViewer: true })` to avoid a loop.

Do **not** reset embed theme to light on viewer mount (`useEmbedBridge` must not call `setColorScheme("light")` on ready — that races host configure).

## Fullscreen (graph expand + browser) — implementation guide

**Principle:** The viewer **reports** layout intent; the host **resizes chrome**. The viewer cannot expand the host tab by itself.

### Two fullscreen controls (different events)

| User action in viewer | Viewer UI | Event to host |
|----------------------|-----------|---------------|
| Expand graph (hide text pane) | Bottom bar panel-close icon | `data-viewer-fullscreen-changed` · `fullscreen: true`, `target: "graph"` |
| Restore / reduce | Left-edge chevron or panel-close again | `data-viewer-fullscreen-changed` · `fullscreen: false`, `target: "graph"` |
| Browser fullscreen | Top toolbar fullscreen icon | `data-viewer-fullscreen-changed` · `fullscreen: true/false`, `target: "browser"` |

`DataViewer._onMessage` dispatches `data-viewer:fullscreen-changed` on `window` with `{ instanceId, fullscreen, target }`.

### Why browser fullscreen must be delegated in embed

On `/widget` (cross-origin iframe, e.g. host `:4001` → viewer `:3000`), calling `document.documentElement.requestFullscreen()` **inside the iframe fails**. The viewer shows a red toast: *"Unable to enter fullscreen mode."*

**Fix (viewer repo — `json-yaml-xml-csv-widget`):**

- `Toolbar/index.tsx` — on embed route (`useViewerRoute().isEmbed`), toolbar fullscreen posts `postFullscreenChanged(next, "browser")` instead of calling `requestFullscreen()`.
- `useEmbedHost` — tracks `browserFullscreenDelegated` state for toggle on/off.
- `useEmbedBridge.ts` — skips native `applyBrowserFullscreen()` on embed route; syncs state when host sends `data-viewer-fullscreen`.

**Fix (host repo — `spiderfeet-widget`):**

- Pass `fullscreenRoot` + `structuredTabButton` to `DataViewerHost.create()` — wires `createFullscreenHandler()` automatically.
- Handler toggles CSS classes on `fullscreenRoot` and `#widget-root`; activates Structured sub-tab on enter; restores prior sub-tab on exit.
- Iframe: `allow="fullscreen"` in HTML; `DataViewer._applyIframeLayout` adds it in JS.

### Host handler (`DataViewerHost.createFullscreenHandler`)

Reference: `src/js/data-viewer-host.js` · used by CLI Profiling via shorthand config in `profiling.js`:

```javascript
DataViewerHost.create({
  instanceId: 'data-viewer-profiling',
  iframe: '#data-viewer-profiling',
  tabButton: '#profiling-tab-structured',
  fullscreenRoot: '#profiling-view-detail',
  structuredTabButton: '#profiling-tab-structured',
  tabListSelector: '#profiling-exam-tabs',
  importExportRoot: '/cli-corpus',
});
```

On enter (`fullscreen: true`):

1. Add overlay classes to `fullscreenRoot` (fixed `inset: 0`, high z-index).
2. Hide elements with `data-viewer-chrome="graph"`.
3. Force `#…-pane-structured` visible; hide sibling exam panes.
4. `bootstrap.Tab.show(structuredTabButton)` if not already active; remember prior sub-tab.

On exit (`fullscreen: false`): remove classes; restore prior sub-tab.

Browser target additionally adds `data-viewer-host-fullscreen-browser` on `#widget-root` (hides main navbar).

### Host → viewer (optional)

```javascript
DataViewer.setFullscreen('data-viewer-profiling', true, 'graph');   // or 'browser'
DataViewer.setFullscreen('data-viewer-profiling', false, 'graph');
```

Posts `data-viewer-fullscreen` into the iframe (queued until ready).

### Upstream source files (fullscreen)

| Repo | File | Role |
|------|------|------|
| `json-yaml-xml-csv-widget` | `apps/www/src/features/editor/Toolbar/index.tsx` | Embed-aware toolbar fullscreen |
| `json-yaml-xml-csv-widget` | `apps/www/src/hooks/useEmbedBridge.ts` | Graph/browser FS bridge |
| `json-yaml-xml-csv-widget` | `apps/www/src/lib/embed/postToHost.ts` | `postFullscreenChanged()` |
| `spiderfeet-widget` | `src/js/data-viewer.js` | Receives FS events; `setFullscreen()` |
| `spiderfeet-widget` | `src/js/data-viewer-host.js` | `createFullscreenHandler()` |
| `spiderfeet-widget` | `src/css/custom.css` | Overlay + chrome-hide rules |
| `spiderfeet-widget` | `src/js/profiling.js` | Reference consumer |

Full protocol write-up: `.docs/data-viewer-embed.md` § Fullscreen.

## CLI Profiling reference (working implementation)

- Instance: `data-viewer-profiling` · Module: `src/js/profiling.js`
- API: `/api/v1/cli-corpus/tools/{tool}/scenarios/{scenario_key}` (one scenario per scan command; bundles `output_text.txt`, `output_structured.*`, `proposed_nuggets_edges.json`, `nugget_graph_structure.md`)
- Markdown "Structure doc" tab rendered by `src/js/markdown.js` into `.profiling-markdown-doc`.

## Debug playbook

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Viewer empty + stuck on **JSON**, host says "loaded" | **Cross-origin `frameId` mismatch** (invariant #1) | Echo viewer-reported `frameId` (`null` cross-origin). Verify in browser: viewer drops messages in `matchesEmbedFrame`. |
| CSS edits have no effect | Edited `custom.scss` (invariant #2) | Edit `src/css/custom.css`; confirm rule appears in served `widget.css`. |
| Iframe only toolbar-tall / half height | Broken flex chain (invariant #4) | Add `min-height:0` up the chain; iframe `height:100%`; pane is a *fill* pane not scroll. |
| Format wrong for XML/CSV | Format not passed/inferred | Pass API `format` or correct `filename`; check `inferFormat`. |
| New module not loaded | webpack file list (invariant #5) | Add to `webpack.common.js`, restart `npm start`. |
| Data lost on tab switch | iframe unmounted/src changed | Keep iframe mounted; `DataViewerHost` reloads via `tabButton` + `reloadWhenVisible()`. |
| Red toast **Unable to enter fullscreen mode** | Viewer calling `requestFullscreen()` inside cross-origin iframe | Viewer `/widget` must delegate browser FS to host (`postFullscreenChanged`). Host must pass `fullscreenRoot`. Restart viewer dev server after viewer-repo changes. |
| Fullscreen expands viewer but host chrome remains | Missing `fullscreenRoot` / `data-viewer-chrome` / CSS | Wire handler; mark chrome; confirm `custom.css` ships overlay rules. |
| Verify served bundle | — | `Invoke-WebRequest http://localhost:4001/widget.js` (or `widget.css`) and grep for your symbol. |

## Anti-patterns

- **Sending your iframe `id` as `frameId`** (see invariant #1). Symptom: empty viewer stuck on JSON.
- **Editing `src/sass/custom.scss`** expecting it to ship (see invariant #2).
- Posting `set` and `set-mode` in one tick without delay.
- Defaulting format to `json` when content is XML/CSV.
- Removing/`about:blank`-ing the iframe on tab hide.
- Page-specific `postMessage` instead of the shared bridge.
- Calling `requestFullscreen()` inside the viewer iframe on `/widget` — use delegated browser fullscreen instead.
