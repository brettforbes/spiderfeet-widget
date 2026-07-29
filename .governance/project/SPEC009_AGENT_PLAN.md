# SPEC-009 agent plan (widget) — CanvasGraph engine + Web Worker offload

**Spec:** `@spiderfeet/.governance/specs/SPEC-009-canvas-graph-component.md`
**Issue index (this repo):** `.governance/project/SPEC009_ISSUE_INDEX.md`
**Repo scope:** `spiderfeet-widget` only — no backend/`spiderfeet` issues exist for this SPEC
**Audience:** Lesser agents — **one child issue at a time**, fully autonomous, no hard gates

---

## 0. Autonomous execution protocol (read this before picking up any SPEC-009 issue)

The operator has explicitly pre-authorized fully autonomous execution for SPEC-009: no human
review wait is required before merging, because `develop` on `brettforbes/spiderfeet-widget` has
no branch-protection review requirement.

1. **Start:** Comment on the issue: "Starting <code> — <one-line intent>."
2. **Branch:** `git checkout develop && git pull && git checkout -b feature/<issue-number>-<slug>`.
3. **Implement:** Do only the scope listed on the issue.
4. **Verify:** Run every command/check in the issue's "Verification" section.
5. **Comment evidence:** Paste verification output as an issue comment before opening the PR.
6. **Commit + push; open PR to `develop`** linking the issue and citing the SPEC-009 requirement ID(s).
7. **Self-merge:** `gh pr merge --squash --delete-branch` once any configured CI is green. Do not
   wait for a human reviewer.
8. **Close the loop:** Comment final outcome (PR link, commit SHA, verification evidence); close
   the issue.
9. **Update `.governance/project/SPEC009_ISSUE_INDEX.md`** row to `done` with the PR link.
10. **Return to `develop`**, pick the next unblocked child.

### 0.1 Hard gates

There is **no operator sign-off gate** in this SPEC (unlike SPEC-008's execute-safety design) —
CanvasGraph has no execute/security surface.

The only gate is a **structural dependency**, not an approval: **AG1** (delete `viz.force.js`)
must not start until **AE2** and **AF2** are both recorded with a completeness label
(`Complete` or `Complete-with-blockers`) in their issue comments. Check both issues on the tracker
before starting AG1. If either is still open/in-progress, work a different unblocked item instead.

### 0.2 Forbidden (all SPEC-009 stories)

- Do not change the `graph_proposal` JSON contract from `/cli-corpus` — this SPEC is rendering-only.
- Do not change `GraphShadows.apply()`'s shadow-count *behavior* in AD1 — only its algorithmic
  complexity. Same nodes/edges in the output, just computed faster.
- Do not delete `viz.force.js` or the SVG rendering path before AG1's gate clears (AE2 + AF2 both
  recorded complete).
- Do not touch Composer, Tests, Subscriptions, or Settings panes under this SPEC.
- Do not add a second graph engine or duplicate drawing logic between `canvas-graph.js` and any
  consumer — all node/link drawing lives in `canvas-graph.js`.
- Do not introduce a build-step dependency (bundler transform, TypeScript, ES modules) for the
  worker script — it must stay a plain classic script loaded via `new Worker('/workers/canvas-graph.worker.js')`
  and copied verbatim by the existing static-asset `CopyWebpackPlugin` rule, consistent with how
  `mermaid.min.js`/`icons/*.svg` already ship.

---

## 1. Epic map

| Epic | Code | Intent | Children |
|------|------|--------|----------|
| CanvasGraph rendering engine | **AB** | Canvas scaffold, drawing parity, hit-testing/interactivity parity, legend/lifecycle | AB1-AB4 |
| Web Worker physics offload | **AC** | Worker script, main-thread integration, performance verification | AC1-AC3 |
| GraphShadows O(n) fix | **AD** | Fix the nested-loop bug that nearly doubles node count today | AD1 |
| Cut over CLI Scan App Graph tab | **AE** | Swap the Graph tab to CanvasGraph, regression review | AE1-AE2 |
| Cut over Maps tab | **AF** | Swap the Maps tab to CanvasGraph, regression review | AF1-AF2 |
| Decommission SVG path | **AG** | Delete `viz.force.js` + dead code, doc pass | AG1-AG2 |

## 2. Execution order

```text
AD1 (independent — can start immediately, any time)

AB1 -> AB2 -> AB4
AB1 -> (AC1 in parallel with AB2/AB4) -> AC2 -> AB3 -> AC3

AE1 -> AE2   (after AB4 and AC3 both merged)
AF1 -> AF2   (after AB4 and AC3 both merged, parallel with AE)

AG1 -> AG2   (only after AE2 AND AF2 both show a recorded completeness label)
```

`AD1` has no dependency on the canvas/worker work at all — it is a pure bug fix in
`graph-shadows.js` and can be picked up by the very first available agent.

`AB1` (canvas scaffold) and `AC1` (worker script) can be built in parallel: AB1 draws from a
static/local position array with no physics yet; AC1 is a standalone script testable by posting
fixture data at it and logging received `tick` messages. They only need to meet at `AC2`, which
wires AB1's draw loop to consume AC1's worker output.

`AB3` (drag/hit-testing) is sequenced *after* `AC2` because pinning a dragged node must message the
live worker — building it against a fake/local physics loop first would mean redoing the wiring.

---

## Epic AB — CanvasGraph rendering engine

New module `src/js/canvas-graph.js` → `window.Viz.CanvasGraph`. Add it to `webpack.common.js`'s
`widget.js` files array, positioned immediately after `viz.force.js` (so during the migration
window both engines exist side by side; AG1 removes `viz.force.js`'s entry later).

Reference implementation to port from: `src/js/viz.force.js` (full file) and `src/js/viz.core.js`
(`Viz.Core.dimensions`, `observeResize`, `cloneGraph`, `colourByGroup`, `iconExists`,
`iconUrlForNugget`, `normalizeNuggetLabel` — reuse these unchanged, do not reimplement).

### AB1 — Canvas scaffold + zoom/resize + draw-loop stub

**Do**
1. `Viz.CanvasGraph.create(options)` accepting the same option shape as `Viz.ForceGraph.create`
   (`canvas` selector instead of `svg`, `tooltip`, `nodes`, `links`, `variant`, `nodeDisplay`,
   `linkLabels`, `linkDistance`, `onNodeClick`, `onNodeHover`), returning `{ destroy() }` (add
   `restart()` too if trivial, to stay a full drop-in — but no current consumer calls it, so it is
   not required for parity).
2. Size the canvas using `Viz.Core.dimensions`/`observeResize` exactly like `Viz.ForceGraph` does,
   accounting for `window.devicePixelRatio` (scale the backing-store width/height by DPR, scale the
   2D context, keep CSS width/height at the logical size) so rendering is crisp on HiDPI displays.
3. Bind `d3.zoom()` directly to the canvas element (`scaleExtent([0.2, 8])`, disable
   `dblclick.zoom` exactly like `viz.force.js` does); apply the resulting transform manually inside
   the draw loop (`ctx.translate`/`ctx.scale`) rather than via an SVG `<g>` transform.
4. A `requestAnimationFrame` loop that clears and redraws every frame from a local, in-memory
   position array (seed it with random/grid positions for now — no physics simulation yet, that is
   Epic AC). This story only proves the canvas/zoom/pan/resize plumbing works.
5. Add `paths.src + '/js/canvas-graph.js'` to `webpack.common.js`'s `widget.js` files array.

**Verify:** `npm run build` succeeds; a throwaway test page mounts `Viz.CanvasGraph.create` against
a small fixture graph, and the canvas element resizes/pans/zooms correctly with no console errors.

### AB2 — Node/link drawing parity

**Do**
1. Port `appendNodeShape`/`appendLabelRectNode`/`appendCenteredLabelText`/`formatNuggetFallbackLines`/
   `linkStroke`/`linkDash`/`nodeFill`/`nodeCollisionRadius` from `viz.force.js` to canvas
   equivalents: `drawImage` (with an `Image` object cache keyed by URL, so icons are decoded once)
   for `nodeDisplay: 'icons'`, `fillRect`/`roundRect`/`arc` for backgrounds and quarantine rings,
   `fillText` with manual multi-line layout (reuse the exact line-wrapping logic from
   `formatNuggetFallbackLines`, just draw with `ctx.fillText` per line instead of SVG `<tspan>`).
2. Draw links as `ctx.moveTo`/`lineTo` strokes with the same role-based colour/dash rules
   (`linkStroke`/`linkDash`), and — when `linkLabels: true` — draw the role/label text at each
   link's midpoint.
3. Respect `d.pinned`/`d.isShadow`/service quarantine-ring styling exactly as `viz.force.js` does.

**Verify:** Manual visual side-by-side comparison against `Viz.ForceGraph` output for at least 2
existing scenarios (one `nodeDisplay: 'icons'`, one `nodeDisplay: 'circles'`) — same node
shapes/colours/labels/link styling, allowing for anti-aliasing differences between SVG and canvas.

### AB3 — Hit-testing + interactivity parity (after AC2 lands)

**Do**
1. Maintain a `d3.quadtree` rebuilt from the current position array on every frame (or every worker
   tick, whichever is cheaper) for nearest-node lookups.
2. `mousemove`: find the nearest node within a small pixel radius via the quadtree; replicate
   `viz.force.js`'s `neighbourSet`/hover-dim-non-neighbours/tooltip behaviour exactly (same tooltip
   HTML content: label, kind, `nugget_type`, `relation`, `fixture_category`, `service_origin`,
   `service_state`, `data`).
3. `click`: invoke `onNodeClick` for the node under the pointer.
4. `dblclick`: unpin the node under the pointer (clear `fx`/`fy`, post `unpin` to the worker,
   restart via `reheat`).
5. `d3.drag()` bound to the canvas with a `subject` resolver backed by the quadtree (canvas drag
   has no per-element target, so the resolver must find the node under the pointer manually); on
   drag start/move post `pin` messages with live coordinates to the worker; on drag end, keep the
   node pinned (matches `viz.force.js`'s pin-on-drop behaviour).

**Verify:** Manual check against a live scenario: hovering dims non-neighbours and shows the
tooltip, clicking fires `onNodeClick` (check in the Maps tab, which wires it), dragging moves and
pins a node, double-clicking releases it.

### AB4 — Legend + lifecycle

**Do**
1. Confirm the existing HTML/DOM legend rendering (`renderLegend` in `cli-scan-app.js` / `map.js` —
   already plain HTML, not SVG) needs no changes to work with `CanvasGraph`.
2. Implement `.destroy()`: stop the `requestAnimationFrame` loop, remove the `d3.zoom`/`d3.drag`
   listeners, clear the `Image` cache, disconnect the resize observer, and terminate the Web Worker
   (`worker.terminate()`) once AC2 exists.

**Verify:** Repeatedly switching between scenarios/tabs in a live consumer does not leak workers or
listeners (check `chrome://inspect` or DevTools' Performance/Memory panel shows no growth in
worker/listener counts across ~10 switches).

---

## Epic AC — Web Worker physics offload

New file `src/assets/workers/canvas-graph.worker.js`. This lives under `src/assets/` (`paths.public`
in `webpack._paths.js`), which `CopyWebpackPlugin` already copies verbatim to `dist/` root — **no
webpack config change is needed for the worker file itself**, exactly like `mermaid.min.js` and
`icons/*.svg` already ship today. It will be served at `/workers/canvas-graph.worker.js`.

### AC1 — Worker script + message protocol

**Do**
1. Classic (non-module) Worker script. At the top: `importScripts('/vendor.js')` to get the global
   `d3` (this has been validated in a Node `vm` sandbox with no `window`/`document` present — d3's
   UMD bundle loads cleanly; `d3.forceSimulation`/`d3.forceManyBody`/`d3.forceLink`/
   `d3.forceCollide`/`d3.forceCenter`/`d3.forceX`/`d3.forceY` are pure math with no DOM dependency).
   **If this throws in a real browser Worker** (untested there — only Node `vm` so far), fall back
   to vendoring `d3-force` + `d3-quadtree` + `d3-timer` as a small standalone
   `canvas-graph-worker-vendor.js` built once via `npm pack`/manual concat of just those 3 packages'
   dist files, and `importScripts` that instead. Document whichever path you took in the PR.
2. Port the `VARIANTS` object (`default`/`sparse`/`dense`/`grouped` force configs) from
   `viz.force.js` verbatim.
3. Message protocol, **in** (`self.onmessage`):
   - `{type:'init', nodes, links, variant, width, height}` — start a fresh `d3.forceSimulation`
   - `{type:'pin', id, x, y}` — set `fx`/`fy` on the node with that id, `simulation.alphaTarget(0.3).restart()`
   - `{type:'unpin', id}` — clear `fx`/`fy` on that node
   - `{type:'reheat'}` — `simulation.alphaTarget(0.3).restart()`, then `alphaTarget(0)` after ~400ms
   - `{type:'destroy'}` — `simulation.stop()`
   - `{type:'resize', width, height}` — update the `center`/`x`/`y` forces' target coordinates
4. Message protocol, **out** (`self.postMessage`): on each simulation tick, batch the current
   `{id, x, y}` for every node and post `{type:'tick', positions:[...]}`. Throttle to roughly one
   post per animation frame (~16ms) rather than posting on every internal d3-force tick, since
   d3-force's internal tick rate can exceed what the main thread needs to redraw.

**Verify:** A standalone smoke test (throwaway HTML page or a short script) that spawns the worker,
posts the Katana `from_httpx_upside_com` fixture
(`.docs/docs-for-cli-tools/nugget_structure/katana_from_httpx_upside_com_proposed_nuggets_edges.json`
in the `spiderfeet` repo) as an `init` message, and logs received `tick` messages — confirms
`importScripts('/vendor.js')` does not throw in a real browser Worker (this is the one thing the
Node `vm` sandbox test could not fully prove) and that positions update over time.

### AC2 — Main-thread integration

**Do**
1. `Viz.CanvasGraph.create()` spawns `new Worker('/workers/canvas-graph.worker.js')` and posts
   `init` with the graph data once nodes/links are known.
2. Store the latest received `tick` position batch in a shared object that AB1's `requestAnimationFrame`
   draw loop reads from — this decouples the worker's physics tick rate from the render frame rate
   (the draw loop always draws the latest known positions, never blocks waiting for a new tick).
3. Wire drag start/end (from AB3, once it exists) to post `pin`/`unpin` messages.
4. `.destroy()` posts `{type:'destroy'}` then calls `worker.terminate()`.
5. Feature-detect `typeof Worker === 'undefined'`: if unavailable, run the exact same
   physics-stepping logic synchronously on the main thread instead. To make this practical without
   duplicating code, extract the per-tick force-stepping function so both the worker script and
   this fallback path call the same implementation (e.g. a small shared function embedded in both
   places, or the worker script's core logic written so it can also run when merely evaluated in
   the main-thread global scope — pick whichever is less duplication and document the choice).

**Verify:** With a live scenario, layout visibly animates from initial positions to a stable
force-directed layout; killing/disabling Web Workers (e.g. via a manual feature-detect override)
falls back to a working main-thread simulation instead of a blank canvas.

### AC3 — Performance verification

**Do**
1. Run the Katana `from_httpx_upside_com` proposal graph end-to-end through the real consumer (CLI
   Scan App Graph tab, once AE1 exists — if AE1 is not done yet, use the same throwaway test page
   from AC1/AB1).
2. Confirm: no browser "page unresponsive" prompt; panning/zooming remains responsive (input lag
   under roughly 100ms) while the simulation is actively settling; first visible frame renders
   within about 2 seconds of mount.
3. Record actual timings (e.g. via `performance.now()` around mount-to-first-frame, and a note on
   whether any jank was observed) as a comment on this issue.

**Verify:** Timings comment posted on the issue; no "page unresponsive" browser prompt observed
during a full manual run against the Katana fixture.

---

## Epic AD — GraphShadows O(n) fix (independent — pick up any time)

### AD1 — Fix the nested-loop scan in `GraphShadows.apply()`

**Do**
1. In `src/js/graph-shadows.js`, the `shadowPairs.forEach(({originalId, shadowId}) => { edges.forEach(edge => { if (edge.source !== originalId) return; ... }) })`
   block is O(shadowPairs × edges). Replace it with a single pass that first builds a
   `Map<sourceId, edge[]>` index over `edges`, then for each shadow pair does an O(1) map lookup
   plus O(matching edges) work — total O(edges) instead of O(shadowPairs × edges).
2. The output must be byte-for-byte equivalent in *semantics* (same node ids, same edge
   source/target/relation sets) — only the implementation changes, not behavior. Do not change the
   shadow-count threshold (`< 2`) or which targets get shadowed.

**Verify:**
1. Before/after comparison: run both the old and new implementation against the Katana
   `from_httpx_upside_com` fixture and diff the resulting node/edge id sets — must be identical.
2. Before/after timing: log `Date.now()` around the fixed block against the same fixture; expect
   the previous ~500-900ms nested-loop cost to drop to low single-digit milliseconds. Paste both
   numbers in the issue comment.

---

## Epic AE — Cut over CLI Scan App Graph tab

### AE1 — Swap the Graph tab to CanvasGraph

**Do**
1. In `cli-scan-app.js`'s Graph tab pane template, replace the `<svg id="${id}-graph-svg" ...>`
   element with a `<canvas id="${id}-graph-svg" ...>` (keep the same id/selector so the rest of the
   wiring — `data-cli-scan-graph-svg`, fullscreen toggle, stats line — needs no other changes).
2. In `CliScanApp.renderProposalGraph`, switch `window.Viz.ForceGraph.create(...)` to
   `window.Viz.CanvasGraph.create(...)`, passing the exact same options object already built by
   `transformProposalGraph`/`applyShadowOptions` (no shape changes needed if AB1-AB4/AC1-AC3
   preserved the option contract).
3. Leave fullscreen toggle, stats line (`${nodes.length} nodes · ${links.length} links`), and
   legend rendering untouched.

**Verify:** `npm run build`; manually open CLI Profiling for at least nmap and httpx scenarios and
confirm the Graph tab renders correctly; open the Katana `from_httpx_upside_com` scenario and
confirm no freeze (this is the scenario that motivated this SPEC).

### AE2 — GOV-08 regression matrix

**Do**
1. Build the scenario matrix: gold/capstone scenario for each of the 8 onboarded tools (nmap,
   netdiscover, nerva, pius, subfinder, httpx, katana, nuclei) + the Katana `from_httpx_upside_com`
   stress scenario + one empty/no-graph scenario.
2. Classify each `Validated`/`Invalidated`/`Blocked`/`Uncovered-spec-gap` per GOV-08. File tracked
   follow-up issues for anything not `Validated`.
3. Record the final completeness label (`Complete`/`Complete-with-blockers`/`Partial`) as an issue
   comment — **AG1 checks for this label before it may start.**

**Verify:** Exploratory review comment with the full scenario matrix and completeness label posted
on this issue.

---

## Epic AF — Cut over Maps tab

### AF1 — Swap the Maps tab to CanvasGraph

**Do**
1. In `map.js`, replace the Maps graph stage's `<svg id="graph" ...>` with a `<canvas id="graph" ...>`.
2. Switch `Map._graphInstance = Viz.ForceGraph.create({...})` (around `map.js:500`) to
   `Viz.CanvasGraph.create({...})`, same options (`svg`→`canvas` selector only change).
3. Leave `Map.transformGraph`, icon-fallback logic, and the existing
   `GraphShadows.apply(payload, {mode:'map-nuggets', edgeRoles:['consumed','produced'], ...})` call
   at `map.js:281-285` unchanged — AD1 already made that call fast, this story doesn't touch it.

**Verify:** `npm run build`; manually open the Maps tab and confirm the graph renders, pans/zooms,
and node click still raises the `map-node-selected` event.

### AF2 — GOV-08 regression check

**Do**
1. Scenario matrix for the Maps tab: default layout variant, at least one alternate variant
   (sparse/dense/grouped), `nodeDisplay: 'circles'` and `'icons'`, and the largest available org
   graph.
2. Classify each; file tracked follow-ups for anything not `Validated`. Record the final
   completeness label as an issue comment — **AG1 checks for this label before it may start.**

**Verify:** Exploratory review comment with the full scenario matrix and completeness label posted
on this issue.

---

## Epic AG — Decommission the SVG path

**Precondition check before starting AG1:** confirm both AE2 and AF2 issues have a completeness
label comment (`Complete` or `Complete-with-blockers`). If either is still open/in-progress, work a
different unblocked item instead.

### AG1 — Remove `viz.force.js` and dead code

**Do**
1. Remove `paths.src + '/js/viz.force.js'` from `webpack.common.js`'s `widget.js` files array; delete
   `src/js/viz.force.js`.
2. Delete `profiling.js`'s orphaned `ForceGraph.create` call (`profiling.js:343-352` and its
   surrounding dead helpers — `content.html` has no matching `#profiling-graph-svg`/
   `#profiling-graph-stage`/`#profiling-graph-tooltip` DOM, so this code path is unreachable).
3. Remove now-unused SVG-only CSS selectors from `custom.scss`/`custom.css` (the `.node`,
   `.node-*`, `.link`, `.link-label*` family that only ever targeted the SVG structure) — keep any
   selector still used by the tooltip/legend HTML (`.profiling-graph-tooltip*`, `#*-legend*`).

**Verify:** `npm run build` succeeds with no reference to `viz.force.js` remaining anywhere in
`src/`; grep confirms no remaining `Viz.ForceGraph` call sites in the repo; CLI Scan App Graph tab
and Maps tab both still render correctly post-removal.

### AG2 — Documentation pass

**Do**
1. Update the `d3js` skill (`c:\projects\spiderfeet\.cursor\skills\d3js\SKILL.md`) and any other doc
   that names `Viz.ForceGraph` as the current graph engine to point at `Viz.CanvasGraph`.
2. Add a SPEC-009 pointer row to both `spiderfeet/AGENTS.md` and `spiderfeet-widget/AGENTS.md`
   (matching how SPEC-008's row was added) — mark it complete once AG1 merges.

**Verify:** Grep for `ForceGraph` across `.docs`/`.cursor` finds no remaining "current engine"
claims (references describing the SPEC-009 migration history are fine to keep).

---

## Definition of done

- [ ] AB1-AB4 merged to `develop`
- [ ] AC1-AC3 merged to `develop`
- [ ] AD1 merged to `develop`
- [ ] AE1-AE2 merged to `develop`; regression review shows `Complete` or `Complete-with-blockers`
      with tracked follow-ups
- [ ] AF1-AF2 merged to `develop`; regression review shows `Complete` or `Complete-with-blockers`
      with tracked follow-ups
- [ ] AG1-AG2 merged to `develop` only after AE2 + AF2 both show a completeness label
- [ ] `SPEC009_ISSUE_INDEX.md` shows every row `done` with PR links
- [ ] No remaining `Viz.ForceGraph`/`viz.force.js` reference anywhere in `spiderfeet-widget`
