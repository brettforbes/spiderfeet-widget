# SPEC-008 agent plan (widget) — reusable CliScanApp component + Composer

**Backend spec:** `@spiderfeet/.governance/specs/SPEC-008-cli-app-scan-ui-content-platform.md`
**Backend plan:** `@spiderfeet/.governance/project/SPEC008_AGENT_PLAN.md`
**Content contract:** `@spiderfeet/.governance/project/SPEC008_CONTENT_CONTRACT.md`
**Issue index (this repo):** `.governance/project/SPEC008_WIDGET_ISSUE_INDEX.md`
**Issue index (backend repo):** `@spiderfeet/.governance/project/SPEC008_ISSUE_INDEX.md`
**Source prompt:** `@spiderfeet/.seed/15_CLI_App_UI.md`
**Audience:** Lesser agents — **one child issue at a time**, fully autonomous unless a hard gate says otherwise

---

## 0. Autonomous execution protocol (read this before picking up any SPEC-008 issue)

Same protocol as the backend plan. The operator has explicitly pre-authorized fully autonomous
execution for SPEC-008: no human review wait is required before merging, because `develop` on
`brettforbes/spiderfeet-widget` has no branch-protection review requirement.

1. **Start:** Comment on the issue: "Starting <code> — <one-line intent>."
2. **Branch:** `git checkout develop && git pull && git checkout -b feature/<issue-number>-<slug>`.
3. **Implement:** Do only the scope listed on the issue.
4. **Verify:** Run every command in the issue's "Verification" section.
5. **Comment evidence:** Paste verification output as an issue comment before opening the PR.
6. **Commit + push; open PR to `develop`** linking the issue and citing SPEC-008 requirement IDs.
7. **Self-merge:** `gh pr merge --squash --delete-branch` once any configured CI is green. Do not
   wait for a human reviewer.
8. **Close the loop:** Comment final outcome (PR link, commit SHA, verification evidence); close
   the issue.
9. **Update `.governance/project/SPEC008_WIDGET_ISSUE_INDEX.md`** row to `done` with the PR link.
10. **Return to `develop`**, pick the next unblocked child.

### 0.1 The only hard gate that touches this repo

**AA2** (wire Composer's Execute button to the live backend API) is blocked until:
- Backend issue **X1** has an explicit **operator sign-off comment** (not just a merged PR), and
- Backend issue **X3** is merged (completion pipeline exists).

Check both conditions on the backend issue tracker before starting AA2. If either is missing,
**do not** start AA2 — work AA1/AA3 or a different unblocked item instead.

Everything else in Y, Z, and AA1/AA3 proceeds with full autonomy — no additional approval needed.

### 0.2 Forbidden (all SPEC-008 widget stories)

- Do not duplicate Text/Structured/Graph/Report rendering logic between `profiling.js` and the
  new `CliScanApp` — extract and share (`DataViewerHost`, `Viz.ForceGraph`, `Widgets.Markdown`).
- Do not raw-postMessage into the Data Viewer iframe — always go through `DataViewerHost`.
- Do not build a second theme system — reuse `Widgets.Theme` / `data-bs-theme`.
- Do not wire the Execute button to a live network call before AA2's gate clears — Y3 wires it to
  a documented `POST .../execute` placeholder contract only.
- Do not invent new tool-id namespaces — reuse the ids the backend `/cli-corpus` and `/content`
  APIs already use.
- Do not touch the Maps/Tests/Subscriptions panes under this SPEC.

---

## 1. Epic map

| Epic | Code | Intent | Children |
|------|------|--------|----------|
| Reusable CliScanApp component | **Y** | 5-tab component, dynamic form, right rail, shared tab rendering, theme | Y1–Y5 |
| Cutover CLI Profiling | **Z** | Wire Single Scan page to component, regression review | Z1–Z2 |
| Composer + live execute wiring (gated) | **AA** | Composer scaffold, execute wiring, exploratory review | AA1–AA3 |

## 2. Execution order

```text
Y1 -> Y2 (needs backend W1 live) -> Y3 -> Y5
Y1 -> Y4 (parallel with Y2/Y3) -> Y5
  -> Z1 (after Y5) -> Z2

AA1 (after Y5, no backend blocker) -> AA2 (after AA1 + backend X1 sign-off + X3 merged) -> AA3
```

Y1 and Y4 can start immediately (Y4 is a refactor-extraction of existing `profiling.js` logic and
does not need the new backend content API). Y2/Y3 should wait until backend **W1** has landed so
the Scan tab is built against a real `/content/*` response, not a guessed shape.

---

## Epic Y — Reusable CliScanApp component

### Y1 — Component skeleton + config contract + webpack wiring

**Do**
1. New module `src/js/cli-scan-app.js` → `window.Widgets.CliScanApp`, following the existing
   namespace/IIFE/`watchDOMForComponent` convention (see `src/js/_namespace.js` and any existing
   `Widgets.*` module for the pattern).
2. Define the config contract: `CliScanApp.create({ container, mode: 'view'|'edit-run', toolId,
   dataSource: { corpusBase: '/cli-corpus', contentBase: '/content' }, scenarioKey? })`.
3. Five-tab shell markup (Scan/Text/Structured/Graph/Report) with tab switching, no content
   wired yet beyond placeholders.
4. Add the new JS file to the webpack entry/bundle list.

**Verify:** `npm run build` succeeds; a throwaway test page mounts `CliScanApp` and all 5 tabs
switch without console errors.

### Y2 — Scan tab dynamic form renderer

**Do**
1. Fetch `GET {contentBase}/tools/{toolId}/options-schema` and render one form field per flag per
   `SPEC008_CONTENT_CONTRACT.md` §2's type table (string→text, boolean→checkbox,
   integer/float→number, select→dropdown, path→text+browse-hint).
2. Required flags get a red asterisk. Flags marked `advanced: true` are hidden behind an
   "Advanced" toggle. More than 10 flags in a `group` collapse into a Bootstrap accordion section.
3. Keep the form in the left ~9 grid columns, scrollable if content overflows.

**Verify:** Loading the nmap options-schema renders every documented flag exactly once, with the
correct input type; a manual visual check confirms grouping matches the schema's `groups` array.

### Y3 — Right rail: execute stub, modals, command preview, progress

**Do**
1. Right 3 columns: Execute button (in `edit-run` mode; hidden/disabled in `view` mode), three
   modal-trigger buttons (`Options`, `Graph Structure`, `User Guide`) that open a Bootstrap modal
   rendering the corresponding content-platform document via `Widgets.Markdown`.
2. Live **Command Preview** panel: recomputes the exact CLI invocation string as form fields
   change (read-only textbox or `<pre>`), driven by the `flag`/`type`/current-value pairs from Y2.
3. Created/progress/finished timestamps + a progress bar element (inert until AA2 wires a real
   run's status into it) at the bottom of the right rail.
4. Execute button posts to a documented placeholder contract (`POST {contentBase}/tools/{id}/execute`)
   but this issue does **not** need the backend endpoint to exist yet — stub the response handling
   and leave a TODO comment citing AA2.

**Verify:** Manual check: filling in a few fields updates the Command Preview live; all three
modal buttons open the correct document; Execute button is absent/disabled when `mode: 'view'`.

### Y4 — Extract shared Text/Structured/Graph/Report tab rendering

**Do**
1. Move the Text/Structured/Graph/Report rendering logic currently inline in `profiling.js` into
   `cli-scan-app.js` (or a small shared helper module both files import) so there is exactly one
   implementation, reused by both the legacy Profiling detail view (until Z1 cuts it over) and the
   new component.
2. Preserve the existing `DataViewerHost`, `Viz.ForceGraph`, and `Widgets.Markdown` wiring exactly
   — this is an extraction, not a rewrite.

**Verify:** Existing CLI Profiling detail view (pre-cutover) still renders identically for at
least 2 tools/scenarios after the extraction — no visual or functional regression.

### Y5 — Theme + accessibility pass

**Do**
1. Confirm `CliScanApp` respects `data-bs-theme` / `Widgets.Theme` toggling without a separate
   theme system.
2. Add `aria-*` attributes to the tab list and modal triggers; ensure every form input from Y2 has
   an associated `<label>`.

**Verify:** Toggling dark/light mode from the navbar updates `CliScanApp` styling; a quick
keyboard-only pass (Tab key) can reach every tab and every form field.

---

## Epic Z — Cutover CLI Profiling

### Z1 — Wire Single Scan detail view to CliScanApp (view mode)

**Do**
1. Replace the CLI Profiling detail-view rendering in `profiling.js` with a `CliScanApp.create({
   mode: 'view', ... })` call sourced from `/cli-corpus` (existing) + `/content` (new, from
   backend W1/W3) endpoints.
2. Keep the existing "Approve/Reject" review controls working (they are not part of `CliScanApp`
   — keep them in the Profiling-specific wrapper around the component).

**Verify:** `npm run build`; manual check against at least the nmap and httpx tool/scenario pages
that Scan/Text/Structured/Graph/Report all render with the same information as before the cutover.

### Z2 — Exploratory regression review (GOV-08)

**Do**
1. Build the GOV-08 scenario matrix: every tool (8) × representative scenario (at least the
   capstone/gold scenario per tool + 2 others), classify each `Validated`/`Invalidated`/
   `Blocked`/`Uncovered-spec-gap`.
2. File tracked follow-up issues for anything not `Validated`.
3. Record the final completeness label for this review unit.

**Verify:** Exploratory review note checked into the PR/issue comment with the full scenario
matrix and completeness label (`Complete`, `Complete-with-blockers`, or `Partial`).

---

## Epic AA — Composer + live execute wiring (gated)

### AA1 — Composer page shell/nav scaffold

**Do**
1. Replace the disabled "Composer — Stage 2 — not yet implemented" nav stub in
   `src/html/content.html` with a real `#pane-composer` panel and enabled nav link.
2. Composer's initial content: a tool picker (reuses `/content/tools` list) that mounts
   `CliScanApp.create({ mode: 'edit-run', toolId: <picked> })` for the chosen tool.
3. No live execute wiring yet — Execute button behaves per Y3's stub.

**Verify:** Composer tab is enabled and navigable; picking a tool mounts the 5-tab component in
edit-run mode with the Scan tab populated from that tool's options-schema.

### AA2 — Wire Execute to the live backend API **[GATED]**

**Precondition check before starting:** confirm on the backend issue tracker that (a) issue X1 has
an operator sign-off comment, and (b) issue X3 is merged. If either is not true, do not start this
issue.

**Do**
1. Replace Y3's stubbed Execute handler with a real `POST {contentBase}/tools/{id}/execute` call.
2. Poll `GET {contentBase}/tools/{id}/runs/{run_id}` and drive the progress bar / timestamps from
   real run status until `complete`/`error`.
3. On completion, populate Text/Structured/Graph/Report tabs from the run's result artifacts.

**Verify:** End-to-end manual run against a permissive lab target only (e.g. `scanme.nmap.org`
via nmap), never a production/corporate target; progress bar reaches 100% and all 4 output tabs
populate.

### AA3 — Exploratory review: Composer live-run flow (GOV-08)

**Do**
1. Scenario matrix for the Composer live-run flow: happy path, cancel/abort mid-run (if
   supported), invalid input, disallowed flag rejection (should surface the backend's 4xx clearly),
   empty/loading states, error state.
2. Classify each scenario; file tracked follow-ups for anything not `Validated`.

**Verify:** Review note with full scenario matrix and completeness label checked into the PR/issue
comment.

---

## Definition of done (program, widget side)

- [ ] Y1–Y5 merged to `develop`
- [ ] Z1–Z2 merged to `develop`; exploratory regression review shows `Complete` or
      `Complete-with-blockers` with tracked follow-ups
- [ ] `SPEC008_WIDGET_ISSUE_INDEX.md` shows every row `done` with PR links
- [ ] AA1 merged regardless of Phase 2 timing (Composer scaffold has value even before execute
      wiring lands)
- [ ] AA2/AA3 only proceed after the backend X1/X3 gate clears
