#!/usr/bin/env python3
"""Create SPEC-008 GitHub epics and child stories (widget: Epics Y, Z, AA) via gh CLI.

Run once from the spiderfeet-widget repo root:
  python .governance/project/scripts/create_spec008_widget_issues.py

Writes `.governance/project/SPEC008_WIDGET_ISSUE_INDEX.md`.
"""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

REPO = "brettforbes/spiderfeet-widget"
INDEX = Path(__file__).resolve().parents[1] / "SPEC008_WIDGET_ISSUE_INDEX.md"

FOOTER = """
## Branch
`feature/<issue>-<slug>` from `develop` · PR into `develop`

## Autonomous execution (no human review wait required)
This repo's `develop` has no branch-protection review requirement, and the operator has
pre-authorized fully autonomous execution for SPEC-008 (see `.governance/project/SPEC008_AGENT_PLAN.md` Section 0).
Implement -> verify -> comment evidence -> PR -> **self-merge via `gh pr merge --squash --delete-branch`** ->
close this issue with a comment linking the PR and verification evidence -> update
`SPEC008_WIDGET_ISSUE_INDEX.md` -> return to `develop` -> pick the next unblocked child.
The **only** exception is issue AA2, which additionally requires confirming on the backend
(`brettforbes/spiderfeet`) issue tracker that issue X1 has an operator sign-off comment and
issue X3 is merged, before AA2 work starts.

## Forbidden (all SPEC-008 widget stories)
- Do not duplicate Text/Structured/Graph/Report rendering logic instead of sharing it
- Do not raw-postMessage into the Data Viewer iframe — always go through DataViewerHost
- Do not build a second theme system — reuse Widgets.Theme
- Do not wire Execute to a live network call before AA2's gate clears
- Do not invent new tool-id namespaces
- Do not touch the Maps/Tests/Subscriptions panes under this SPEC

## Agent instructions
1. Read `.governance/project/SPEC008_AGENT_PLAN.md` for this story's epic section
2. Read `@spiderfeet/.governance/project/SPEC008_CONTENT_CONTRACT.md` for the options_schema.json shape
3. Read `@spiderfeet/.governance/specs/SPEC-008-cli-app-scan-ui-content-platform.md` requirement IDs on this issue
4. One issue -> one PR -> self-merge -> comment verification evidence -> close issue -> update index
"""


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
    specs: str,
    scope: str,
    verify: str,
    blocked_by: str = "",
    extra: str = "",
) -> int:
    blocked = f"\n## Blocked by\n{blocked_by}\n" if blocked_by else ""
    body = f"""## Problem
See parent epic #{parent}. Bounded unit: **{code}**.

## Desired outcome
Lesser agent can complete this unit with evidence; the reusable CliScanApp component / Composer
cutover moves one bounded step closer to the SPEC-008 milestone.

## Spec binding
{specs} · Parent epic #{parent} · Spec `@spiderfeet/.governance/specs/SPEC-008-cli-app-scan-ui-content-platform.md`

## Scope
{scope}
{blocked}
{extra}
## Acceptance criteria
- [ ] Scope completed with evidence (paths + commands in PR/issue comment)
- [ ] Forbidden list respected
- [ ] PR to `develop` links this issue
- [ ] Lesser-agent playbook section for this code followed (`SPEC008_AGENT_PLAN.md`)

## Verification
{verify}
{FOOTER}
"""
    n = gh_create(f"[SPEC-008] {code} - {title}", body, ["enhancement"])
    print(f"{code} = #{n}")
    return n


def main() -> None:
    epic_y = gh_create(
        "[SPEC-008] Epic Y - Reusable CliScanApp component",
        f"""## Problem
CLI Profiling's Single Scan page renders Text/Structured/Graph/Report tabs, but the logic is
monolithic inside `profiling.js` and there is no Scan tab (dynamic form for a tool's CLI
options). `@spiderfeet/.seed/15_CLI_App_UI.md` calls for a reusable, config-driven 5-tab
component usable both in CLI Profiling (view mode) and the future Composer page (edit-run mode).

## Spec binding
SPEC-008 R8-12, R8-13, R8-14, R8-15, R8-16 (backend spec, this repo implements the widget side)
· Cross-repo: depends on backend Epic W (`brettforbes/spiderfeet` `/content/*` APIs)

## Children (order)
- Y1 Component skeleton + config contract + webpack wiring
- Y2 Scan tab dynamic form renderer
- Y3 Right rail: execute stub, modals, command preview, progress
- Y4 Extract shared Text/Structured/Graph/Report tab rendering
- Y5 Theme + accessibility pass

## Success
`window.Widgets.CliScanApp` exists, is config-driven, and renders all 5 tabs correctly in a
throwaway test mount before Epic Z wires it into CLI Profiling for real.
{FOOTER}
""",
        ["epic", "enhancement", "cross-repo"],
    )
    print(f"Epic Y = #{epic_y}")

    epic_z = gh_create(
        "[SPEC-008] Epic Z - Cutover CLI Profiling to CliScanApp",
        f"""## Problem
Once `CliScanApp` exists (Epic Y), the CLI Profiling Single Scan page should be cut over to use
it in view mode, sourced from `/cli-corpus` + the new `/content` APIs, with a full regression
pass across all 8 tools and their examination scenarios.

## Spec binding
SPEC-008 R8-17, R8-18 · Depends on Epic Y (this repo) and backend Epic W (`brettforbes/spiderfeet`)

## Children (order)
- Z1 Wire Single Scan detail view to CliScanApp (view mode)
- Z2 Exploratory regression review (GOV-08) across all 8 tools/scenarios

## Success
Opening CLI Profiling -> any of the 8 tools -> any scenario shows the new component with
identical information content to the pre-cutover rendering; GOV-08 scenario matrix classified
with tracked follow-ups for anything not Validated. **This is the "see the results in the scans
for each examination scenario" milestone the operator asked for.**
{FOOTER}
""",
        ["epic", "enhancement", "cross-repo"],
    )
    print(f"Epic Z = #{epic_z}")

    epic_aa = gh_create(
        "[SPEC-008] Epic AA - Composer + live execute wiring (gated)",
        f"""## Problem
Composer is currently a disabled nav stub. `.seed/15_CLI_App_UI.md` wants Composer to host
`CliScanApp` in edit-run mode, letting an operator pick a tool, fill in options, and execute a
live scan. The execute wiring (AA2) is gated on the backend's operator-approved safety design
(Epic X, issue X1 sign-off + X3 merged) — do not start AA2 until that gate clears.

## Spec binding
SPEC-008 R8-19, R8-20 · Depends on Epic Y (this repo) and backend Epic X (`brettforbes/spiderfeet`,
gated on issue X1 operator sign-off)

## Children (order)
- AA1 Composer page shell/nav scaffold (no backend blocker — can start once Epic Y lands)
- AA2 Wire Execute to the live backend API **[GATED — check backend X1/X3 before starting]**
- AA3 Exploratory review: Composer live-run flow (GOV-08)

## Hard gate
AA2 requires confirming on the backend issue tracker that issue X1 has an **operator sign-off
comment** (not just a merged PR) and issue X3 is merged. If either condition is not met, work a
different unblocked item instead of starting AA2.

## Success
Composer page is enabled, lets an operator run a real scan against a permissive lab target
end-to-end, and lands on the same 5-tab view populated with real results.
{FOOTER}
""",
        ["epic", "enhancement", "cross-repo"],
    )
    print(f"Epic AA = #{epic_aa}")

    # Y children
    y1 = child(
        "Y1",
        "Component skeleton + config contract + webpack wiring",
        epic_y,
        "R8-12",
        """1. New module `src/js/cli-scan-app.js` -> window.Widgets.CliScanApp, following the
   existing namespace/IIFE/watchDOMForComponent convention
2. Config contract: CliScanApp.create({ container, mode: 'view'|'edit-run', toolId, dataSource,
   scenarioKey? })
3. Five-tab shell markup (Scan/Text/Structured/Graph/Report) with tab switching, placeholders only
4. Add the new JS file to the webpack entry/bundle list""",
        "`npm run build` succeeds; a throwaway test page mounts CliScanApp and all 5 tabs switch without console errors.",
    )
    y2 = child(
        "Y2",
        "Scan tab dynamic form renderer",
        epic_y,
        "R8-13",
        """1. Fetch GET {contentBase}/tools/{toolId}/options-schema and render one form field per
   flag (string->text, boolean->checkbox, integer/float->number, select->dropdown, path->text+hint)
2. Required flags get a red asterisk; advanced:true flags hide behind an Advanced toggle; >10
   flags per group collapse into a Bootstrap accordion
3. Keep the form in the left ~9 grid columns, scrollable if needed""",
        "Loading the nmap options-schema renders every documented flag exactly once with the correct input type; grouping matches the schema's groups array.",
        blocked_by=f"#{y1} · backend `/content` API (Epic W) should be live",
    )
    y3 = child(
        "Y3",
        "Right rail: execute stub, modals, command preview, progress",
        epic_y,
        "R8-14",
        """1. Right 3 columns: Execute button (edit-run mode only), 3 modal buttons (Options, Graph
   Structure, User Guide) opening the corresponding content-platform document via Widgets.Markdown
2. Live Command Preview panel recomputing the CLI invocation string as fields change
3. Created/progress/finished timestamps + progress bar (inert until AA2)
4. Execute button posts to a documented placeholder contract; does not require the live backend
   endpoint yet — stub the handler with a TODO citing AA2""",
        "Filling in fields updates Command Preview live; all 3 modal buttons open the correct document; Execute button absent/disabled when mode: 'view'.",
        blocked_by=f"#{y2}",
    )
    y4 = child(
        "Y4",
        "Extract shared Text/Structured/Graph/Report tab rendering",
        epic_y,
        "R8-15",
        """1. Move the Text/Structured/Graph/Report rendering logic currently inline in
   profiling.js into cli-scan-app.js (or a small shared helper both import) — exactly one
   implementation reused by both the legacy Profiling detail view and the new component
2. Preserve the existing DataViewerHost, Viz.ForceGraph, and Widgets.Markdown wiring exactly""",
        "Existing CLI Profiling detail view (pre-cutover) still renders identically for at least 2 tools/scenarios after the extraction.",
        blocked_by=f"#{y1}",
    )
    y5 = child(
        "Y5",
        "Theme + accessibility pass",
        epic_y,
        "R8-16",
        """1. Confirm CliScanApp respects data-bs-theme / Widgets.Theme toggling
2. Add aria-* attributes to the tab list and modal triggers; ensure every Y2 form input has an
   associated label""",
        "Toggling dark/light mode updates CliScanApp styling; a keyboard-only Tab pass reaches every tab and form field.",
        blocked_by=f"#{y3} #{y4}",
    )

    # Z children
    z1 = child(
        "Z1",
        "Wire Single Scan detail view to CliScanApp (view mode)",
        epic_z,
        "R8-17",
        """1. Replace the CLI Profiling detail-view rendering in profiling.js with a
   CliScanApp.create({ mode: 'view', ... }) call sourced from /cli-corpus + /content endpoints
2. Keep the existing Approve/Reject review controls working (kept in the Profiling-specific
   wrapper around the component, not inside CliScanApp itself)""",
        "`npm run build`; manual check against nmap and httpx tool/scenario pages: Scan/Text/Structured/Graph/Report render with the same information as before the cutover.",
        blocked_by=f"#{y5}",
    )
    z2 = child(
        "Z2",
        "Exploratory regression review (GOV-08)",
        epic_z,
        "R8-18",
        """1. Build the GOV-08 scenario matrix: every tool (8) x representative scenario (capstone/
   gold scenario per tool + 2 others), classify each Validated/Invalidated/Blocked/
   Uncovered-spec-gap
2. File tracked follow-up issues for anything not Validated
3. Record the final completeness label for this review unit""",
        "Exploratory review note with the full scenario matrix and completeness label checked into the PR/issue comment.",
        blocked_by=f"#{z1}",
    )

    # AA children
    aa1 = child(
        "AA1",
        "Composer page shell/nav scaffold",
        epic_aa,
        "R8-19",
        """1. Replace the disabled "Composer - Stage 2 - not yet implemented" nav stub in
   src/html/content.html with a real #pane-composer panel and enabled nav link
2. Composer's initial content: a tool picker (reuses /content/tools list) that mounts
   CliScanApp.create({ mode: 'edit-run', toolId: <picked> }) for the chosen tool
3. No live execute wiring yet — Execute button behaves per Y3's stub""",
        "Composer tab is enabled and navigable; picking a tool mounts the 5-tab component in edit-run mode with the Scan tab populated.",
        blocked_by=f"#{y5}",
    )
    aa2 = child(
        "AA2",
        "Wire Execute to the live backend API [GATED]",
        epic_aa,
        "R8-19",
        """Precondition check before starting: confirm on the backend (brettforbes/spiderfeet)
issue tracker that issue X1 has an operator sign-off comment and issue X3 is merged. If either is
not true, do not start this issue — work a different unblocked item instead.

1. Replace Y3's stubbed Execute handler with a real POST {contentBase}/tools/{id}/execute call
2. Poll GET {contentBase}/tools/{id}/runs/{run_id} and drive the progress bar/timestamps from
   real run status until complete/error
3. On completion, populate Text/Structured/Graph/Report tabs from the run's result artifacts""",
        "End-to-end manual run against a permissive lab target only (e.g. scanme.nmap.org); progress bar reaches 100% and all 4 output tabs populate.",
        blocked_by=f"#{aa1} · backend issue X1 (operator sign-off comment) and X3 (merged) in brettforbes/spiderfeet",
        extra="## Hard gate\nDo not start this issue without confirming both backend preconditions above. This is the one widget-side issue that is not fully autonomous.\n",
    )
    aa3 = child(
        "AA3",
        "Exploratory review: Composer live-run flow (GOV-08)",
        epic_aa,
        "R8-20",
        """1. Scenario matrix for the Composer live-run flow: happy path, cancel/abort mid-run (if
   supported), invalid input, disallowed flag rejection surfaced clearly, empty/loading states,
   error state
2. Classify each scenario; file tracked follow-ups for anything not Validated""",
        "Review note with the full scenario matrix and completeness label checked into the PR/issue comment.",
        blocked_by=f"#{aa2}",
    )

    lines = [
        "# SPEC-008 issue index (widget: spiderfeet-widget)",
        "",
        "Generated by `.governance/project/scripts/create_spec008_widget_issues.py`.",
        "",
        "**Plan:** `.governance/project/SPEC008_AGENT_PLAN.md`",
        "**Backend spec:** `@spiderfeet/.governance/specs/SPEC-008-cli-app-scan-ui-content-platform.md`",
        "**Backend index:** `@spiderfeet/.governance/project/SPEC008_ISSUE_INDEX.md`",
        "",
        "| Code | Issue | Status |",
        "|------|-------|--------|",
        f"| Epic Y | [#{epic_y}](https://github.com/brettforbes/spiderfeet-widget/issues/{epic_y}) | open |",
        f"| Epic Z | [#{epic_z}](https://github.com/brettforbes/spiderfeet-widget/issues/{epic_z}) | open |",
        f"| Epic AA | [#{epic_aa}](https://github.com/brettforbes/spiderfeet-widget/issues/{epic_aa}) | open (gated) |",
        f"| Y1 | [#{y1}](https://github.com/brettforbes/spiderfeet-widget/issues/{y1}) | open |",
        f"| Y2 | [#{y2}](https://github.com/brettforbes/spiderfeet-widget/issues/{y2}) | open |",
        f"| Y3 | [#{y3}](https://github.com/brettforbes/spiderfeet-widget/issues/{y3}) | open |",
        f"| Y4 | [#{y4}](https://github.com/brettforbes/spiderfeet-widget/issues/{y4}) | open |",
        f"| Y5 | [#{y5}](https://github.com/brettforbes/spiderfeet-widget/issues/{y5}) | open |",
        f"| Z1 | [#{z1}](https://github.com/brettforbes/spiderfeet-widget/issues/{z1}) | open |",
        f"| Z2 | [#{z2}](https://github.com/brettforbes/spiderfeet-widget/issues/{z2}) | open |",
        f"| AA1 | [#{aa1}](https://github.com/brettforbes/spiderfeet-widget/issues/{aa1}) | open |",
        f"| AA2 | [#{aa2}](https://github.com/brettforbes/spiderfeet-widget/issues/{aa2}) | blocked (needs backend X1 sign-off + X3 merged) |",
        f"| AA3 | [#{aa3}](https://github.com/brettforbes/spiderfeet-widget/issues/{aa3}) | blocked |",
        "",
        "## Execution order",
        "",
        "```",
        "Y1 -> Y2 -> Y3 -> Y5",
        "Y1 -> Y4 ------> Y5",
        "  -> Z1 -> Z2",
        "",
        "AA1 -> AA2 [GATED on backend X1 sign-off + X3 merged] -> AA3",
        "```",
        "",
        "Lesser agents: pick next unblocked child; read SPEC008_AGENT_PLAN.md epic section first.",
        "Autonomous self-merge applies to every issue except AA2's precondition check (see plan Section 0.1).",
        "",
    ]
    INDEX.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {INDEX}")


if __name__ == "__main__":
    main()
