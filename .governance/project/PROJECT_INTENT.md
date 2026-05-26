# Project Intent

**Status:** Provisional — validated product brief not yet established.

## Purpose

This repository is an **iFrame embeddable widget template** (webpack-based HTML/SASS/JS) intended as a starting point for experiences embedded in parent applications via iFrames. The README describes template mechanics (build, assets, events) rather than a specific product mission for *this* fork.

Until a validated product brief exists, do not infer product scope from the repository name (`spiderfeet-widget`) or template README alone.

## Context

- **Stack:** Node/webpack, SASS, jQuery/Bootstrap/D3 vendor bundle pattern, custom widget namespace (`window.Widgets`).
- **Integration model:** Parent app ↔ widget via `window.Widgets.Events` (raise/listen/emit).
- **Hosting:** Public GitHub repo `brettforbes/spiderfeet-widget`.
- **Governance:** VibeGov bootstrap `init` completed pre-implementation (see `.governance/project/bootstrap/STATUS.md`).

## Constraints

- Widget code must remain embeddable (iFrame-friendly build output).
- Follow existing JS namespacing conventions in `src/js/`.
- Strict Git workflow: `main` (promotion), `develop` (integration), issue-scoped branches (see `.governance/project/GIT_WORKFLOW.md`).

## Risks

- Product intent may be assumed from template docs or repo name without stakeholder confirmation.
- GitHub Issues are **disabled** on the remote repo — issue-driven workflow requires enabling Issues or an alternate tracker.
- GitHub Projects automation blocked until `read:project` / `project` scopes are granted to `gh`.

## Assumptions

- This fork will customize the template for a specific widget experience once intent is confirmed.
- Governance and bootstrap setup precede feature implementation (`SPEC-001` bootstrap spec).

## Key Behaviors

- Build produces distributable widget assets for iFrame embedding.
- Widget communicates with parent via documented event APIs.
- Governed delivery follows Observe → Plan → Implement → Verify → Document.

## Verification Expectations

- `npm run build` succeeds for release artifacts.
- Lint (`npm run lint`) used where applicable before merge.
- Acceptance criteria live in active specs under `.governance/specs/`.

## Next decision needed

Replace provisional intent with a validated brief: problem, users, success metrics, and non-goals for the *spiderfeet* widget specifically.
