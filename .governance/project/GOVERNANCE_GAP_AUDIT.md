# Governance Gap Audit — spiderfeet-widget (Stage 0)

**Date:** 2026-06-03  
**Epic:** GitHub [#1](https://github.com/brettforbes/spiderfeet-widget/issues/1)  
**Spec:** SPEC-002 R2-00-01 (shared with spiderfeet)

## Summary

Generic VibeGov rules exist under `.governance/rules/` but were **not mirrored** to `.cursor/rules/` until this epic. Project-specific rules for the Spiderfeet iFrame UI program were missing. Product intent was still provisional template wording.

## Matrix

| Area | Generic (`.governance/rules/`) | Project (`.governance/project/`) | Cursor mirror | Gap / action |
|------|----------------------------------|-----------------------------------|---------------|--------------|
| GOV-01–09 | ✅ | — | **was missing** → mirrored | SF-00-03 |
| Project intent | — | PROJECT_INTENT.md ⚠️ provisional | — | **SF-00-04** |
| Backlog / stages | — | BACKLOG.md ⚠️ SPEC-001 only | — | **SF-00-05** |
| JS/webpack stack | — | **missing** | **missing** | **proj-01** |
| Bootstrap / D3 UI | — | **missing** | **missing** | **proj-04** + bootstrap/d3js skills |
| Multi-repo | skill only | **missing** | **missing** | **proj-02** |
| Stage program | — | **missing** | **missing** | **proj-03** |
| SPEC-002 | — | **missing** | — | Copy/reference from spiderfeet program |
| GitHub Issues | enabled 2026-06-03 | — | — | ✅ |

## Verification

- [x] Audit documented (this file)
- [x] Generic gov + project rules mirrored to `.cursor/rules/`
- [x] PROJECT_INTENT and BACKLOG updated
