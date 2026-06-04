# Project Intent

**Status:** Active — first-four-stages program (2026-06-03)  
**Spec:** SPEC-002 (canonical copy in spiderfeet repo)  
**Plan:** `@spiderfeet/.seed/02_stage_by_stage_reengineer.md`

## Summary

**spiderfeet-widget** is the iFrame embeddable front-end for the Spiderfeet v2 platform. It renders Bootstrap 5 layouts and D3 force graphs, calling the **spiderfeet** FastAPI backend for TypeDB map data and module testing.

## Goals (widget, stages 0–4)

1. **Governed delivery** — project rules + VibeGov; GitHub issues per epic/story
2. **Rebrand** — template → Spiderfeet; Apache 2.0; logo in navbar (stage 1)
3. **Maps UI** — connection widget, force graph of `spiderfeet-map`, filters, layouts (stage 3)
4. **Tests UI** — module/route test accordions, summary metrics, scan-record mini graphs (stage 4)
5. **Embed contract** — remain iFrame-friendly; `Widgets.Events` for parent apps

## Non-goals (stages 0–4)

- Full Enrichments / Composer / Logs tabs (empty placeholders only)
- Direct TypeDB access from the browser
- Mobile layout optimisation
- Investigation workspace (stage 8)

## Stack

- webpack, SASS, `window.Widgets` IIFEs, Bootstrap 5.3 + D3 in vendor bundle
- Dev: `npm start` (port 4001); release: `npm run build` → `dist/`

## Stakeholders

- **Operator:** Brett Forbes
- **Backend repo:** `brettforbes/spiderfeet`

## Success signals

- Maps and Tests tabs meet SPEC-002 and pass GOV-08 exploratory review
- Build and lint green on PR
- Cross-repo issues linked to backend epics

## References

| Resource | Path |
|----------|------|
| SPEC-002 | `@spiderfeet/.governance/specs/SPEC-002-first-four-stages.md` |
| Bootstrap skill | `.cursor/skills/bootstrap/SKILL.md` (install from spiderfeet if missing) |
| D3 skill | `@spiderfeet/.cursor/skills/d3js/SKILL.md` |
| Issue manifest | `@spiderfeet/.seed/planning/github_issues_manifest.json` |
