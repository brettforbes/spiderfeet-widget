# SPEC-011 agent plan — Composer & Projects widget UI (v2 engine)

**Spec:** `@spiderfeet/.governance/specs/SPEC-011-composer-projects-ui.md`
**Backend spec:** `@spiderfeet/.governance/specs/SPEC-010-spiderfeet-v2-engine.md`
**Issue index (this repo):** `.governance/project/SPEC011_WIDGET_ISSUE_INDEX.md`
**Backend plan:** `@spiderfeet/.governance/project/SPEC010_AGENT_PLAN.md`
**Source prompt:** `@spiderfeet/.seed/17_SpiderFeet_v2_Integrating_TypeDB_FastAPI_iFrame.md`
**Reused:** `Widgets.CliScanApp` (`src/js/cli-scan-app.js`), `Viz.CanvasGraph` (`src/js/canvas-graph.js`), `Widgets.Theme`, `DataViewerHost`
**Embedded editor:** `yaml-workflow-widget` iframe `http://localhost:4009/` (`?embed=1`); protocol `HOST_PROTOCOL.md` / data-viewer-embed skill
**Audience:** Lesser agents — **one child issue at a time**, fully autonomous unless a hard gate says otherwise.

---

## 0. Autonomous execution protocol (read before picking up any SPEC-011 issue)

Operator has pre-authorized fully autonomous execution: no human review wait before merging to `develop`. Rigor (GOV-02/04/05/06/08) still applies. For **every** child issue:

1. **Start:** Comment "Starting <code> — <one-line intent>." Move to `In progress` on board #1.
2. **Branch:** `git checkout develop && git pull && git checkout -b feature/<issue-number>-<slug>` — from `develop` only.
3. **Implement:** Only the issue scope. Adjacent gaps → follow-up issue, no scope creep.
4. **Verify:** Run the issue's Verification steps. UI work uses a GOV-08 scenario check where relevant.
5. **Comment evidence:** Paste verification / screenshots-description before the PR.
6. **Commit + push:** Conventional commit referencing the issue.
7. **PR to `develop`:** `gh pr create --base develop`; body links the issue, cites `R11-*`, repeats evidence.
8. **Self-merge:** PR open + CI green → `gh pr merge --squash --delete-branch`. No human wait except the §0.1 gate.
9. **Close the loop:** Comment outcome; confirm issue closed.
10. **Update the index:** Row `done` (with PR link) in `SPEC011_WIDGET_ISSUE_INDEX.md`.
11. **Return to `develop`:** never end parked on a stray branch.
12. **Next unblocked child.**

Dev loop: `npm start` serves the widget on `http://localhost:4001` (writeToDisk). Adding a new JS file requires editing the `widget.js` source order in `webpack.common.js` (~L155–174) and **restarting** `npm start`. The widget talks to the v2 engine via `data-api-base` (`http://127.0.0.1:8001/api/v1`).

### 0.1 Hard gate (the only one)

- **AX1 — Live Composer acceptance (R11-21).** The full live end-to-end demonstration against a real target is presented for **operator sign-off**; do not mark the SPEC-011 program `done` without an operator approval comment on AX1. Everything else is fully autonomous.

**Cross-repo dependency (not a gate, a sequencing fact):** AV/AW/AX consume SPEC-010's v2 execute + context endpoints (Epic AN2). AQ–AU can proceed against the documented API contract and a local stub before AN2 lands. If a needed endpoint is missing, stub it locally, mark the issue `blocked` with the exact missing route, file/link the SPEC-010 dependency, and move to the next unblocked child.

### 0.2 Forbidden (all SPEC-011 issues)

- Do not modify the `yaml-workflow-widget` repo; integrate via its existing postMessage contract only (escalate a genuine contract gap as a separate tracked issue — R11 non-goals).
- Do not hand-roll `postMessage` for the Data Viewer / structured pane — use `DataViewerHost`.
- Do not duplicate `CliScanApp` or `CanvasGraph`; reuse and extend minimally.
- Do not store `temporary_id` on the server — strip before send (R11-20 ↔ R10-25).
- Do not break Maps/Tests/Subscriptions/CLI-Profiling/Settings when renaming Enrichments→Projects.
- Do not leave the Project Context Viewer erroring on empty data — it is intentionally empty this spec.

---

## 1. Epic map

| Epic | Code | Intent | Children |
|------|------|--------|----------|
| v2 API client + Projects page | **AQ** | API client, rename Enrichments→Projects, projects table + CRUD, row→Composer | AQ1–AQ4 |
| Composer page shell | **AR** | 4-pane layout, pane full-screen expand/revert, two CanvasGraph viewers | AR1–AR3 |
| Embed YAML editor iframe | **AS** | Collapsing left iframe (0/3/12 cols), handshake, theme sync | AS1–AS3 |
| Step selection → CliScanApp | **AT** | `stepSelected` → right slide-in per tool, unset-step Scan-tab-only gating | AT1–AT2 |
| Option-edit round-trip + gating | **AU** | option change → YAML update; validation → enable Scan Now | AU1–AU2 |
| Live execute + replay | **AV** | Scan Now → execute → four forms; read-only replay; Run Workflow (validated YAML) | AV1–AV3 |
| Temporary Subgraph Viewer | **AW** | temporary_id import/merge, discrete subgraphs, remove toggle, strip-on-send | AW1–AW3 |
| Widget acceptance | **AX** | live E2E + GOV-08 exploratory review | AX1–AX2 |

## 2. Execution order

```text
AQ1 -> AQ2 -> AQ3 -> AQ4
AR1 -> AR2 -> AR3                 (after AQ2 nav/pane exists)
AS1 -> AS2 -> AS3                 (after AR1 layout)
AT1 -> AT2                        (after AS2 editor emits stepSelected)
AU1 -> AU2                        (after AT + AS; needs editor round-trip)
AV1 -> AV2 -> AV3                 (after AT; needs SPEC-010 AN2/AO2 execute API)
AW1 -> AW2 -> AW3                 (after AV1; needs completed scan graphs)
AX1 [OPERATOR SIGN-OFF] -> AX2    (after AV + AW)
```

AQ (API client + Projects) and the AR/AS layout can proceed immediately against the documented SPEC-010 contract with a local stub. AV/AW require the live SPEC-010 AN2 endpoints.

---

## Epic AQ — v2 API client + Projects page

### AQ1 — v2 API client
**Do:** `src/js/spiderfeet-api.js` wrapping SPEC-010 routes (projects/workflows/targets CRUD, execute, contexts) against `data-api-base`; typed helpers, UI-visible error states. Register in `webpack.common.js` order; restart `npm start`.
**Verify:** From the console, `Widgets.SpiderfeetApi.listProjects()` returns data or a clean error against a running v2 engine (or documented stub).

### AQ2 — Rename Enrichments→Projects + pane
**Do:** In `src/html/content.html` rename the Enrichments nav button to **Projects**, enable it, add `#pane-projects`; wire `shell.js` (`data-shell-tab="projects"`). Leave other tabs untouched.
**Verify:** Nav shows Projects; clicking activates `#pane-projects`; Maps/Tests/Subscriptions/Profiling/Settings still work.

### AQ3 — Projects table
**Do:** `src/js/projects.js` renders the projects table (id, created, workflow count, stix incident id) from `GET /projects`; empty/loading/error states.
**Verify:** Table renders live data; empty and error states shown when the API is empty/down.

### AQ4 — Project CRUD + row→Composer
**Do:** create/edit/delete wired to the API (delete verified by refresh); row click fetches full project JSON and navigates to Composer with the project loaded (re-fetchable on refresh).
**Verify:** Create→appears after refresh; delete→gone after refresh; row click lands on Composer with the right project.

---

## Epic AR — Composer page shell

### AR1 — Composer pane + layout
**Do:** Enable the Composer nav button; add `#pane-composer`; build the layout — central area split horizontally (upper Project Context Viewer / lower Temporary Subgraph Viewer), collapsible left column, right slide-in region; 12-column model for left/right.
**Verify:** Composer activates; split panes + placeholder regions render at 4001.

### AR2 — Pane full-screen expand/revert
**Do:** Top-right expand icon on each central pane → full-screen; revert icon returns to split; keyboard accessible.
**Verify:** Expand/revert works for both panes via mouse and keyboard.

### AR3 — Two CanvasGraph viewers (empty Project Context)
**Do:** Mount `Viz.CanvasGraph` in both central panes; Project Context Viewer initialized with `{nodes:[],links:[]}` (no error on empty); Temporary viewer ready for AW.
**Verify:** Both canvases mount; empty Project Context Viewer renders without error.

---

## Epic AS — Embed YAML editor iframe

### AS1 — Collapsing left iframe + width states
**Do:** `src/js/composer-workflow.js` embeds `http://localhost:4009/?embed=1` in the left column with three width states (0 / ≈3 / 12 columns) toggled by icons; default = partial (viz-only).
**Verify:** Iframe loads; collapse/partial/full transitions work.

### AS2 — Handshake + load workflow YAML
**Do:** Follow `HOST_PROTOCOL.md`: wait for `ready`, then `setTheme` + `setYaml` (current workflow YAML); listen for `yamlChanged`/`validationResult`.
**Verify:** Editor shows the loaded workflow diagram; `validationResult` received; `yamlChanged` observed on edit.

### AS3 — Theme sync
**Do:** `Widgets.Theme` → `setTheme`; respect iframe `themeChanged`; toggling the host theme re-themes the editor.
**Verify:** Host light/dark toggle re-themes the embedded editor both ways.

---

## Epic AT — Step selection → CliScanApp

### AT1 — stepSelected → right slide-in per tool
**Do:** On `stepSelected {stepId}`, slide in the matching tool's `CliScanApp` over columns 4–12; resolve the tool from the step's `uses`. Handle special ids (`__workflow_start__`/`__workflow_target__`/`__workflow_end__`/etc.) with a graceful no-op/summary.
**Verify:** Clicking each real step opens the correct tool viewer; special ids do not crash.

### AT2 — Unset-step gating
**Do:** For a step with no prior run, expose only the Scan tab with **Scan Now disabled**, other option controls enabled; lock the other four tabs until a run exists.
**Verify:** Unset step → Scan tab only, Scan Now disabled, options editable.

---

## Epic AU — Option-edit round-trip + gating

### AU1 — Option change → YAML update
**Do:** `CliScanApp` (edit-run) option changes recompute the step's workflow YAML and push it to the editor (`setYaml` or the editor's option-update message); viz updates.
**Verify:** Change an option → editor YAML + diagram reflect it.

### AU2 — Validation → enable Scan Now
**Do:** Scan Now enables only when the editor reports the step's four sub-tasks (Input/Config/Output/Context) valid (`validationResult.ok`), driven by editor messages not client guesses.
**Verify:** Invalid YAML → Scan Now disabled; valid → enabled; transition driven by `validationResult`.

---

## Epic AV — Live execute + replay

### AV1 — Scan Now → execute → four forms
**Do:** Scan Now calls the SPEC-010 execute endpoint, shows progress, populates Text/Structured/Graph/Report on completion; scan_step persisted (verified by re-fetch). Needs SPEC-010 AN2.
**Verify:** Live run against a lab/permissive target populates four tabs; re-fetch confirms persistence.

### AV2 — Read-only replay
**Do:** Selecting an already-run step loads its stored four forms read-only (all tabs viewable, Scan Now complete/disabled) from the persisted scan_step.
**Verify:** Re-open a completed step → four forms shown read-only.

### AV3 — Run validated multi-step workflow
**Do:** Composer toolbar **Run Workflow** enabled only when the YAML DSL iframe reports `validationResult.ok` (R11-23). On click: sync editor YAML via `updateWorkflow`/`createWorkflow`, call `executeWorkflow`, show succeeded/failed/skipped summary, import each `scan_graph` export into Temporary Subgraph Viewer. Keep per-step Scan Now unchanged.
**Verify:** Invalid YAML keeps the button disabled; valid multi-step YAML runs AO2 end-to-end; temp viewer gains discrete imports for exporting steps; `npm run build` succeeds.

---

## Epic AW — Temporary Subgraph Viewer

### AW1 — Import with temporary_id
**Do:** `src/js/composer-temp-graph.js` — on a completed step with `context.export: scan_graph`, assign each imported node a fresh `temporary--<uuidv4>`, remap edges to temporary ids, append as a discrete subgraph.
**Verify:** Importing two graphs with overlapping canonical ids yields two independent subgraphs (no id collision).

### AW2 — Discrete render + remove toggle
**Do:** Render accumulated imports as discrete subgraphs on `Viz.CanvasGraph`; provide a per-subgraph remove toggle.
**Verify:** Multiple imports render discretely; remove drops one subgraph, leaving the rest.

### AW3 — Strip-on-send round-trip
**Do:** When sending the temporary graph to the server, strip `temporary_id` and map edges back to `nugget_instance_id` (aligns with SPEC-010 R10-25).
**Verify:** Captured outbound payload has no `temporary_id`; edges reference `nugget_instance_id`.

---

## Epic AX — Widget acceptance

### AX1 — Live E2E **[OPERATOR SIGN-OFF]**
**Do:** Demonstrate the full Composer flow against the live v2 engine for one of the 4 targets: load project → Composer → select steps → set options (YAML updates) → run → four forms → exported graphs accumulate in the Temporary Subgraph Viewer → temporary graph round-trips to the server. Present for operator sign-off.
**Verify:** Evidence (screen capture / notes) attached; operator approval comment on AX1.

### AX2 — GOV-08 exploratory review
**Do:** Scenario matrix over Projects + Composer (happy/empty/loading/error/cancel-collapse/invalid-options/keyboard/refresh-persistence), classified `Validated`/`Invalidated`/`Blocked`/`Uncovered-spec-gap`, with tracked follow-ups for anything not `Validated`.
**Verify:** Review doc checked in with completeness label; follow-up issues linked.

---

## Definition of done (program)

- [ ] AQ merged; Enrichments renamed Projects; projects table + CRUD live; row→Composer works
- [ ] AR/AS merged; Composer 4-pane layout + pane full-screen + embedded YAML editor (0/3/12) + theme sync
- [ ] AT/AU merged; step selection opens the right tool; unset-step gating; option-edit→YAML round-trip; validation→Scan Now enable
- [ ] AV/AW merged; live execute populates four forms + persists; temporary viewer imports discrete subgraphs and round-trips with temporary_id stripped
- [ ] AX1 live E2E signed off by operator; AX2 GOV-08 review checked in
- [ ] `SPEC011_WIDGET_ISSUE_INDEX.md` all rows `done` with PR links
- [ ] Continuity note written
