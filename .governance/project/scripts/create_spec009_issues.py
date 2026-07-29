#!/usr/bin/env python3
"""Create SPEC-009 GitHub epics and child stories (Epics AB-AG) via gh CLI.

Run once from the spiderfeet-widget repo root:
  python .governance/project/scripts/create_spec009_issues.py

Writes `.governance/project/SPEC009_ISSUE_INDEX.md`.
"""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

REPO = "brettforbes/spiderfeet-widget"
INDEX = Path(__file__).resolve().parents[1] / "SPEC009_ISSUE_INDEX.md"
SPEC_LINK = "@spiderfeet/.governance/specs/SPEC-009-canvas-graph-component.md"

FOOTER = """
## Branch
`feature/<issue>-<slug>` from `develop` · PR into `develop`

## Autonomous execution (no human review wait required)
This repo's `develop` has no branch-protection review requirement, and the operator has
pre-authorized fully autonomous execution for SPEC-009 (see `.governance/project/SPEC009_AGENT_PLAN.md` Section 0).
Implement -> verify -> comment evidence -> PR -> **self-merge via `gh pr merge --squash --delete-branch`** ->
close this issue with a comment linking the PR and verification evidence -> update
`SPEC009_ISSUE_INDEX.md` -> return to `develop` -> pick the next unblocked child.
The **only** exception is issue AG1, which additionally requires confirming on this repo's issue
tracker that both AE2 and AF2 carry a recorded completeness label comment before AG1 work starts.

## Forbidden (all SPEC-009 stories)
- Do not change the `graph_proposal` JSON contract from `/cli-corpus` — this SPEC is rendering-only
- Do not change GraphShadows.apply's shadow-count behavior in AD1 — only its algorithmic complexity
- Do not delete viz.force.js or the SVG path before AG1's gate clears (AE2 + AF2 both complete)
- Do not touch the Composer/Tests/Subscriptions/Settings panes under this SPEC
- Do not duplicate node/link drawing logic outside canvas-graph.js
- Do not introduce a build-step dependency for the worker script — plain classic script, copied
  verbatim by the existing static-asset CopyWebpackPlugin rule

## Agent instructions
1. Read `.governance/project/SPEC009_AGENT_PLAN.md` for this story's epic section
2. Read `{spec}` for this issue's requirement ID
3. One issue -> one PR -> self-merge -> comment verification evidence -> close issue -> update index
""".format(spec=SPEC_LINK)


def gh_create(title: str, body: str, labels: list[str]) -> int:
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".md", delete=False) as fh:
        fh.write(body.strip() + "\n")
        path = fh.name
    cmd = ["gh", "issue", "create", "--repo", REPO, "--title", title, "--body-file", path]
    for lab in labels:
        cmd.extend(["--label", lab])
    out = subprocess.check_output(cmd, text=True).strip()
    Path(path).unlink(missing_ok=True)
    return int(out.rstrip("/").split("/")[-1])


def child(
    code: str,
    title: str,
    parent: int,
    req_id: str,
    scope: str,
    verify: str,
    blocked_by: str = "",
    extra: str = "",
) -> int:
    blocked = f"\n## Blocked by\n{blocked_by}\n" if blocked_by else ""
    body = f"""## Problem
See parent epic #{parent}. Bounded unit: **{code}**.

## Desired outcome
Lesser agent can complete this unit with evidence; the CanvasGraph engine / Web Worker offload
moves one bounded step closer to the SPEC-009 milestone (no page freeze on large graph scenarios).

## Spec binding
{req_id} · Parent epic #{parent} · Spec `{SPEC_LINK}`

## Scope
{scope}
{blocked}
{extra}
## Acceptance criteria
- [ ] Scope completed with evidence (paths + commands in PR/issue comment)
- [ ] Forbidden list respected
- [ ] PR to `develop` links this issue
- [ ] Lesser-agent playbook section for this code followed (`SPEC009_AGENT_PLAN.md`)

## Verification
{verify}
{FOOTER}
"""
    n = gh_create(f"[SPEC-009] {code} - {title}", body, ["enhancement"])
    print(f"{code} = #{n}")
    return n


def main() -> None:
    epic_ab = gh_create(
        "[SPEC-009] Epic AB - CanvasGraph rendering engine",
        f"""## Problem
`Viz.ForceGraph` (`src/js/viz.force.js`) renders nugget graphs as SVG: one `<g>` per node with
2-4 children, one `<line>`/`<text>` per edge, with 6+ attributes rewritten on every one of D3's
~300 default simulation ticks. For large examination scenarios (e.g. Katana's
`from_httpx_upside_com`: 3,426 nodes / 11,199 edges) this produces tens of millions of synchronous
main-thread DOM writes and freezes the browser tab. A canvas-rendered engine, `window.Viz.CanvasGraph`,
replaces the SVG DOM tree with cheap per-frame draw calls.

## Spec binding
SPEC-009 R9-01, R9-02, R9-03, R9-04 · Spec `{SPEC_LINK}`

## Children (order)
- AB1 Canvas scaffold + zoom/resize + draw-loop stub
- AB2 Node/link drawing parity
- AB3 Hit-testing + interactivity parity (after Epic AC's AC2 lands)
- AB4 Legend + lifecycle

## Success
`window.Viz.CanvasGraph.create(options)` exists with the same option contract as
`Viz.ForceGraph.create` (canvas selector instead of svg), renders visually/behaviorally equivalent
output, and is ready for Epic AE/AF to cut real consumers over to it.
{FOOTER}
""",
        ["epic", "enhancement"],
    )
    print(f"Epic AB = #{epic_ab}")

    epic_ac = gh_create(
        "[SPEC-009] Epic AC - Web Worker physics offload",
        f"""## Problem
D3's force simulation (physics) is the single largest cost driving the "page not responding"
freeze on large graphs — it runs synchronously on the main thread for ~300 ticks by default,
recomputing forces for every node/edge each tick. Moving the simulation into a Web Worker
decouples that cost from the main thread entirely, so the UI stays responsive regardless of graph
size.

## Spec binding
SPEC-009 R9-05, R9-06, R9-07 · Spec `{SPEC_LINK}` · Depends on Epic AB (AB1 must exist before AC2)

## Children (order)
- AC1 Worker script + message protocol
- AC2 Main-thread integration
- AC3 Performance verification (Katana from_httpx_upside_com stress scenario)

## Success
The Katana `from_httpx_upside_com` proposal graph (3,426 nodes / 11,199 edges) mounts and renders
without the browser's "page unresponsive" prompt, with pan/zoom remaining responsive during active
layout.
{FOOTER}
""",
        ["epic", "enhancement"],
    )
    print(f"Epic AC = #{epic_ac}")

    epic_ad = gh_create(
        "[SPEC-009] Epic AD - GraphShadows O(n) fix",
        f"""## Problem
`GraphShadows.apply()` (`src/js/graph-shadows.js`) runs a nested
`shadowPairs.forEach(p => edges.forEach(...))` scan that is O(shadowPairs x edges). Measured
against the Katana `from_httpx_upside_com` fixture: ~4,406 shadow pairs x 11,199 edges ~= 49.3M
iterations, ~0.5-0.9s of main-thread blocking, and ~4,400 near-duplicate shadow nodes added —
nearly doubling total node count before any rendering happens. This is independent of the
SVG-vs-canvas question and should be fixed regardless of which engine renders the result.

## Spec binding
SPEC-009 R9-08 · Spec `{SPEC_LINK}` · Independent — no dependency on Epic AB/AC

## Children (order)
- AD1 Fix the nested-loop scan in GraphShadows.apply()

## Success
Same shadow-node output (identical node/edge id sets) for the Katana fixture, computed in O(edges)
instead of O(shadowPairs x edges) — before/after timing logged on the issue.
{FOOTER}
""",
        ["epic", "enhancement"],
    )
    print(f"Epic AD = #{epic_ad}")

    epic_ae = gh_create(
        "[SPEC-009] Epic AE - Cut over CLI Scan App Graph tab",
        f"""## Problem
Once `Viz.CanvasGraph` exists (Epic AB/AC) and `GraphShadows` is fast (Epic AD), the CLI Scan App
Graph tab (`cli-scan-app.js`, the CLI Profiling examination detail view) should be cut over from
`Viz.ForceGraph` to `Viz.CanvasGraph`, with a full regression pass across onboarded tools.

## Spec binding
SPEC-009 R9-09, R9-10 · Spec `{SPEC_LINK}` · Depends on Epic AB (AB4) and Epic AC (AC3)

## Children (order)
- AE1 Swap the Graph tab to CanvasGraph
- AE2 GOV-08 regression matrix

## Success
Opening CLI Profiling -> any onboarded tool -> the Katana `from_httpx_upside_com` scenario renders
the Graph tab without freezing the browser tab; GOV-08 scenario matrix classified with tracked
follow-ups for anything not Validated, and a completeness label recorded (required before Epic AG
may start).
{FOOTER}
""",
        ["epic", "enhancement"],
    )
    print(f"Epic AE = #{epic_ae}")

    epic_af = gh_create(
        "[SPEC-009] Epic AF - Cut over Maps tab",
        f"""## Problem
The Maps tab (`map.js`) is the second and only other consumer of `Viz.ForceGraph`. It should be
cut over to `Viz.CanvasGraph` in parallel with Epic AE, with its own regression pass (Maps has
different variant/nodeDisplay toggles and its own `GraphShadows.apply('map-nuggets', ...)` call
that must keep working unchanged).

## Spec binding
SPEC-009 R9-11, R9-12 · Spec `{SPEC_LINK}` · Depends on Epic AB (AB4) and Epic AC (AC3)

## Children (order)
- AF1 Swap the Maps tab to CanvasGraph
- AF2 GOV-08 regression check

## Success
The Maps tab renders, pans/zooms, and node click still raises `map-node-selected` after the
cutover; GOV-08 review classified with tracked follow-ups, and a completeness label recorded
(required before Epic AG may start).
{FOOTER}
""",
        ["epic", "enhancement"],
    )
    print(f"Epic AF = #{epic_af}")

    epic_ag = gh_create(
        "[SPEC-009] Epic AG - Decommission the SVG path",
        f"""## Problem
Once both consumers (Epic AE, Epic AF) are cut over and verified stable, the old SVG engine
(`viz.force.js`) and the already-dead `profiling.js` graph-rendering code should be removed, along
with now-unused SVG-only CSS, and documentation updated to point at the new engine.

## Spec binding
SPEC-009 R9-13, R9-14 · Spec `{SPEC_LINK}`

## Children (order)
- AG1 Remove viz.force.js and dead code **[GATED — check AE2 + AF2 completeness labels before starting]**
- AG2 Documentation pass

## Hard gate
AG1 requires confirming on this repo's issue tracker that **both** AE2 and AF2 carry a recorded
completeness label comment (`Complete` or `Complete-with-blockers`). If either is still
open/in-progress, work a different unblocked item instead of starting AG1.

## Success
No remaining `Viz.ForceGraph`/`viz.force.js` reference anywhere in `spiderfeet-widget`; both live
consumers unaffected by the removal.
{FOOTER}
""",
        ["epic", "enhancement"],
    )
    print(f"Epic AG = #{epic_ag}")

    # AB children
    ab1 = child(
        "AB1",
        "Canvas scaffold + zoom/resize + draw-loop stub",
        epic_ab,
        "R9-01",
        """1. `Viz.CanvasGraph.create(options)` in new `src/js/canvas-graph.js`, same option shape as
   `Viz.ForceGraph.create` except a `canvas` selector instead of `svg`; returns `{ destroy() }`
2. DevicePixelRatio-aware sizing via `Viz.Core.dimensions`/`observeResize` (scale backing-store
   width/height by DPR, scale the 2D context, keep CSS size at the logical size)
3. `d3.zoom()` bound directly to the canvas (scaleExtent [0.2, 8], dblclick.zoom disabled),
   transform applied manually via `ctx.translate`/`ctx.scale` in the draw loop
4. `requestAnimationFrame` draw loop clearing/redrawing from a local static/random position array
   — no physics yet, that is Epic AC
5. Add `paths.src + '/js/canvas-graph.js'` to webpack.common.js's widget.js files array, positioned
   right after viz.force.js""",
        "`npm run build` succeeds; a throwaway test page mounts Viz.CanvasGraph against a small fixture graph and resizes/pans/zooms correctly with no console errors.",
    )
    ab2 = child(
        "AB2",
        "Node/link drawing parity",
        epic_ab,
        "R9-02",
        """1. Port appendNodeShape/appendLabelRectNode/appendCenteredLabelText/
   formatNuggetFallbackLines/linkStroke/linkDash/nodeFill/nodeCollisionRadius from viz.force.js to
   canvas draw calls (drawImage with an Image cache keyed by URL, fillRect/roundRect/arc for
   backgrounds and quarantine rings, fillText with manual multi-line layout reusing the exact
   line-wrapping logic)
2. Draw links as moveTo/lineTo strokes with the same role-based colour/dash rules; draw link-label
   text at the midpoint when linkLabels: true
3. Respect d.pinned / d.isShadow / service quarantine-ring styling exactly as viz.force.js does""",
        "Manual visual side-by-side comparison against Viz.ForceGraph output for 2 existing scenarios (one icons, one circles nodeDisplay) — same shapes/colours/labels/link styling.",
        blocked_by=f"#{ab1}",
    )
    ab3 = child(
        "AB3",
        "Hit-testing + interactivity parity",
        epic_ab,
        "R9-03",
        """1. Maintain a d3.quadtree rebuilt from current positions each frame/tick for nearest-node
   lookups
2. mousemove: nearest-node-within-radius via quadtree; replicate neighbourSet/hover-dim/tooltip
   behaviour exactly (same tooltip HTML fields: label, kind, nugget_type, relation,
   fixture_category, service_origin, service_state, data)
3. click: invoke onNodeClick for the node under the pointer
4. dblclick: unpin the node under the pointer (clear fx/fy, post unpin to worker, reheat)
5. d3.drag() on the canvas with a quadtree-backed subject resolver; drag start/move posts pin
   messages to the worker with live coordinates; drag end keeps the node pinned""",
        "Manual check against a live scenario: hover dims non-neighbours and shows tooltip, click fires onNodeClick, drag moves+pins a node, dblclick releases it.",
        blocked_by=f"#{ab1} · Epic AC's AC2 must exist first (pin/unpin messaging target)",
    )
    ab4 = child(
        "AB4",
        "Legend + lifecycle",
        epic_ab,
        "R9-04",
        """1. Confirm the existing HTML/DOM legend rendering needs no changes to work with CanvasGraph
2. Implement .destroy(): stop the rAF loop, remove zoom/drag listeners, clear the Image cache,
   disconnect the resize observer, terminate the Web Worker (worker.terminate()) once AC2 exists""",
        "Repeatedly switching between scenarios/tabs in a live consumer does not leak workers or listeners (DevTools Performance/Memory panel shows no growth in worker/listener counts across ~10 switches).",
        blocked_by=f"#{ab2} #{ab3}",
    )

    # AC children
    ac1 = child(
        "AC1",
        "Worker script + message protocol",
        epic_ac,
        "R9-05",
        """1. New src/assets/workers/canvas-graph.worker.js (classic, non-module worker — lands under
   paths.public and is copied verbatim to dist/ by the existing CopyWebpackPlugin rule, no webpack
   config change needed). importScripts('/vendor.js') for the global d3 (validated safe in a Node
   vm sandbox with no window/document; d3-force functions are pure math). If this throws in a real
   browser Worker, fall back to vendoring d3-force + d3-quadtree + d3-timer as a standalone
   worker-vendor bundle instead — document whichever path was taken in the PR
2. Port the VARIANTS object (default/sparse/dense/grouped force configs) from viz.force.js verbatim
3. Message protocol in: {type:'init', nodes, links, variant, width, height} /
   {type:'pin', id, x, y} / {type:'unpin', id} / {type:'reheat'} / {type:'destroy'} /
   {type:'resize', width, height}
4. Message protocol out: throttled {type:'tick', positions:[{id,x,y}]} batches, roughly one post
   per animation frame rather than every internal d3-force tick""",
        "Standalone smoke test spawning the worker, posting the Katana from_httpx_upside_com fixture as an init message, and logging received tick batches — confirms importScripts('/vendor.js') does not throw in a real browser Worker and positions update over time.",
        blocked_by=f"Epic AB's #{ab1} not required (can build in parallel) — independent standalone script",
    )
    ac2 = child(
        "AC2",
        "Main-thread integration",
        epic_ac,
        "R9-06",
        """1. Viz.CanvasGraph.create() spawns new Worker('/workers/canvas-graph.worker.js') and posts
   init once nodes/links are known
2. AB1's draw loop reads from the latest received tick position batch instead of a static array
   (decouples worker tick rate from render frame rate)
3. Wire drag start/end (once AB3 exists) to post pin/unpin messages
4. .destroy() posts {type:'destroy'} then worker.terminate()
5. Feature-detect typeof Worker === 'undefined': fall back to running the same physics-stepping
   logic synchronously on the main thread; extract the per-tick stepping function so both the
   worker and the fallback share one implementation (minimize duplication, document the approach
   chosen in the PR)""",
        "With a live scenario, layout visibly animates from initial to stable force-directed positions; disabling Web Workers via a manual feature-detect override falls back to a working main-thread simulation instead of a blank canvas.",
        blocked_by=f"#{ab1} #{ac1}",
    )
    ac3 = child(
        "AC3",
        "Performance verification",
        epic_ac,
        "R9-07",
        """1. Run the Katana from_httpx_upside_com proposal graph end-to-end (via AE1's consumer if it
   exists yet, else the AC1/AB1 throwaway test page)
2. Confirm: no browser "page unresponsive" prompt; pan/zoom stays responsive (input lag roughly
   under 100ms) while the simulation is actively settling; first visible frame renders within
   about 2 seconds of mount
3. Record actual timings (performance.now() around mount-to-first-frame, note on any observed jank)
   as a comment on this issue""",
        "Timings comment posted on the issue; no page-unresponsive browser prompt observed during a full manual run against the Katana fixture.",
        blocked_by=f"#{ac2} #{ab4}",
    )

    # AD children
    ad1 = child(
        "AD1",
        "Fix the nested-loop scan in GraphShadows.apply()",
        epic_ad,
        "R9-08",
        """1. In src/js/graph-shadows.js, replace the
   `shadowPairs.forEach(({originalId, shadowId}) => { edges.forEach(edge => {...}) })` O(shadowPairs
   x edges) scan with a single pass that first builds a Map<sourceId, edge[]> index over edges,
   then for each shadow pair does an O(1) lookup plus O(matching edges) work — total O(edges)
2. Output must be semantically identical (same node ids, same edge source/target/relation sets) —
   only the implementation changes. Do not change the shadow-count threshold (< 2) or which targets
   get shadowed""",
        "Before/after comparison: run old vs new implementation against the Katana from_httpx_upside_com fixture, diff the resulting node/edge id sets (must be identical); log before/after timing (expect ~500-900ms nested loop to drop to low single-digit ms) and paste both numbers in the issue comment.",
    )

    # AE children
    ae1 = child(
        "AE1",
        "Swap the Graph tab to CanvasGraph",
        epic_ae,
        "R9-09",
        """1. In cli-scan-app.js's Graph tab pane template, replace the <svg id="${id}-graph-svg" ...>
   element with a <canvas id="${id}-graph-svg" ...> (keep the same id/selector)
2. In CliScanApp.renderProposalGraph, switch window.Viz.ForceGraph.create(...) to
   window.Viz.CanvasGraph.create(...), same options object already built by
   transformProposalGraph/applyShadowOptions
3. Leave fullscreen toggle, stats line, and legend rendering untouched""",
        "`npm run build`; manually open CLI Profiling for nmap and httpx scenarios and confirm the Graph tab renders correctly; open the Katana from_httpx_upside_com scenario and confirm no freeze.",
        blocked_by=f"Epic AB #{ab4} · Epic AC #{ac3}",
    )
    ae2 = child(
        "AE2",
        "GOV-08 regression matrix",
        epic_ae,
        "R9-10",
        """1. Scenario matrix: gold/capstone scenario for each of the 8 onboarded tools (nmap,
   netdiscover, nerva, pius, subfinder, httpx, katana, nuclei) + the Katana from_httpx_upside_com
   stress scenario + one empty/no-graph scenario
2. Classify each Validated/Invalidated/Blocked/Uncovered-spec-gap per GOV-08; file tracked
   follow-up issues for anything not Validated
3. Record the final completeness label (Complete/Complete-with-blockers/Partial) as an issue
   comment — Epic AG's AG1 checks for this label before it may start""",
        "Exploratory review comment with the full scenario matrix and completeness label posted on this issue.",
        blocked_by=f"#{ae1}",
    )

    # AF children
    af1 = child(
        "AF1",
        "Swap the Maps tab to CanvasGraph",
        epic_af,
        "R9-11",
        """1. In map.js, replace the Maps graph stage's <svg id="graph" ...> with a
   <canvas id="graph" ...>
2. Switch Map._graphInstance = Viz.ForceGraph.create({...}) (around map.js:500) to
   Viz.CanvasGraph.create({...}), same options (svg->canvas selector only change)
3. Leave Map.transformGraph, icon-fallback logic, and the existing
   GraphShadows.apply(payload, {mode:'map-nuggets', edgeRoles:['consumed','produced'], ...}) call
   at map.js:281-285 unchanged""",
        "`npm run build`; manually open the Maps tab and confirm the graph renders, pans/zooms, and node click still raises the map-node-selected event.",
        blocked_by=f"Epic AB #{ab4} · Epic AC #{ac3}",
    )
    af2 = child(
        "AF2",
        "GOV-08 regression check",
        epic_af,
        "R9-12",
        """1. Scenario matrix for the Maps tab: default layout variant, at least one alternate variant
   (sparse/dense/grouped), nodeDisplay circles and icons, and the largest available org graph
2. Classify each; file tracked follow-ups for anything not Validated. Record the final
   completeness label as an issue comment — Epic AG's AG1 checks for this label before it may
   start""",
        "Exploratory review comment with the full scenario matrix and completeness label posted on this issue.",
        blocked_by=f"#{af1}",
    )

    # AG children
    ag1 = child(
        "AG1",
        "Remove viz.force.js and dead code [GATED]",
        epic_ag,
        "R9-13",
        """Precondition check before starting: confirm on this repo's issue tracker that both AE2 and
AF2 carry a recorded completeness label comment (Complete or Complete-with-blockers). If either is
still open/in-progress, do not start this issue — work a different unblocked item instead.

1. Remove paths.src + '/js/viz.force.js' from webpack.common.js's widget.js files array; delete
   src/js/viz.force.js
2. Delete profiling.js's orphaned ForceGraph.create call (profiling.js:343-352 and surrounding dead
   helpers — content.html has no matching #profiling-graph-svg/#profiling-graph-stage/
   #profiling-graph-tooltip DOM, so this code path is unreachable)
3. Remove now-unused SVG-only CSS selectors from custom.scss/custom.css (the .node, .node-*, .link,
   .link-label* family that only targeted the SVG structure) — keep any selector still used by the
   tooltip/legend HTML""",
        "`npm run build` succeeds with no reference to viz.force.js remaining anywhere in src/; grep confirms no remaining Viz.ForceGraph call sites in the repo; CLI Scan App Graph tab and Maps tab both still render correctly post-removal.",
        blocked_by=f"#{ae2} #{af2} (both must carry a completeness label comment)",
        extra="## Hard gate\nDo not start this issue without confirming both AE2 and AF2 completeness labels above. This is the one SPEC-009 issue that is not fully autonomous.\n",
    )
    ag2 = child(
        "AG2",
        "Documentation pass",
        epic_ag,
        "R9-14",
        """1. Update the d3js skill (spiderfeet .cursor/skills/d3js/SKILL.md) and any other doc naming
   Viz.ForceGraph as the current graph engine to point at Viz.CanvasGraph
2. Add a SPEC-009 pointer row to both spiderfeet/AGENTS.md and spiderfeet-widget/AGENTS.md
   (matching how SPEC-008's row was added); mark it complete once AG1 has merged""",
        "Grep for ForceGraph across .docs/.cursor finds no remaining 'current engine' claims (references describing the SPEC-009 migration history are fine to keep).",
        blocked_by=f"#{ag1}",
    )

    lines = [
        "# SPEC-009 issue index (widget: spiderfeet-widget)",
        "",
        "Generated by `.governance/project/scripts/create_spec009_issues.py`.",
        "",
        "**Plan:** `.governance/project/SPEC009_AGENT_PLAN.md`",
        "**Spec:** `@spiderfeet/.governance/specs/SPEC-009-canvas-graph-component.md`",
        "**Repo scope:** `spiderfeet-widget` only — no backend/`spiderfeet` issues for this SPEC",
        "",
        "| Code | Issue | Status |",
        "|------|-------|--------|",
        f"| Epic AB | [#{epic_ab}](https://github.com/brettforbes/spiderfeet-widget/issues/{epic_ab}) | open |",
        f"| Epic AC | [#{epic_ac}](https://github.com/brettforbes/spiderfeet-widget/issues/{epic_ac}) | open |",
        f"| Epic AD | [#{epic_ad}](https://github.com/brettforbes/spiderfeet-widget/issues/{epic_ad}) | open |",
        f"| Epic AE | [#{epic_ae}](https://github.com/brettforbes/spiderfeet-widget/issues/{epic_ae}) | open |",
        f"| Epic AF | [#{epic_af}](https://github.com/brettforbes/spiderfeet-widget/issues/{epic_af}) | open |",
        f"| Epic AG | [#{epic_ag}](https://github.com/brettforbes/spiderfeet-widget/issues/{epic_ag}) | open (gated) |",
        f"| AB1 | [#{ab1}](https://github.com/brettforbes/spiderfeet-widget/issues/{ab1}) | open |",
        f"| AB2 | [#{ab2}](https://github.com/brettforbes/spiderfeet-widget/issues/{ab2}) | open |",
        f"| AB3 | [#{ab3}](https://github.com/brettforbes/spiderfeet-widget/issues/{ab3}) | open |",
        f"| AB4 | [#{ab4}](https://github.com/brettforbes/spiderfeet-widget/issues/{ab4}) | open |",
        f"| AC1 | [#{ac1}](https://github.com/brettforbes/spiderfeet-widget/issues/{ac1}) | open |",
        f"| AC2 | [#{ac2}](https://github.com/brettforbes/spiderfeet-widget/issues/{ac2}) | open |",
        f"| AC3 | [#{ac3}](https://github.com/brettforbes/spiderfeet-widget/issues/{ac3}) | open |",
        f"| AD1 | [#{ad1}](https://github.com/brettforbes/spiderfeet-widget/issues/{ad1}) | open |",
        f"| AE1 | [#{ae1}](https://github.com/brettforbes/spiderfeet-widget/issues/{ae1}) | open |",
        f"| AE2 | [#{ae2}](https://github.com/brettforbes/spiderfeet-widget/issues/{ae2}) | open |",
        f"| AF1 | [#{af1}](https://github.com/brettforbes/spiderfeet-widget/issues/{af1}) | open |",
        f"| AF2 | [#{af2}](https://github.com/brettforbes/spiderfeet-widget/issues/{af2}) | open |",
        f"| AG1 | [#{ag1}](https://github.com/brettforbes/spiderfeet-widget/issues/{ag1}) | blocked (needs AE2 + AF2 completeness labels) |",
        f"| AG2 | [#{ag2}](https://github.com/brettforbes/spiderfeet-widget/issues/{ag2}) | blocked |",
        "",
        "## Execution order",
        "",
        "```",
        "AD1 (independent, any time)",
        "",
        "AB1 -> AB2 -> AB4",
        "AB1 -> (AC1 in parallel) -> AC2 -> AB3 -> AC3",
        "",
        "AE1 -> AE2   (after AB4 + AC3)",
        "AF1 -> AF2   (after AB4 + AC3, parallel with AE)",
        "",
        "AG1 -> AG2   (only after AE2 AND AF2 both carry a completeness label comment)",
        "```",
        "",
        "Lesser agents: pick next unblocked child; read SPEC009_AGENT_PLAN.md epic section first.",
        "Autonomous self-merge applies to every issue except AG1's precondition check (see plan Section 0.1).",
        "",
    ]
    INDEX.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {INDEX}")


if __name__ == "__main__":
    main()
