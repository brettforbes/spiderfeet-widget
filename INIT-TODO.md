# INIT-TODO

Durable bootstrap / adoption remediation tracker. Update during bootstrap `update` runs.

## Preflight (2026-05-26 bootstrap init)

- [x] `git` available — `git version 2.40.1.windows.1`
- [x] `gh` available — `gh version 2.89.0`
- [x] GitHub auth — logged in as `brettforbes` (`gh auth status`)
- [x] Repo access — `gh repo view brettforbes/spiderfeet-widget` OK
- [ ] **Project read access** — blocked
  - Error: `authentication token is missing required scopes [read:project]`
  - Next action: `gh auth refresh -s read:project,project`
- [ ] **Project write access** — blocked (same scope remediation)
  - Next action: after refresh, verify with `gh project list --owner @me`
- [x] Branch protection check — **degraded verification**
  - `main` returns HTTP 404 "Branch not protected" (not configured)
  - Next action: apply `.github/branch-protection-checklist.md` when admin access confirmed

## Repository configuration blockers

- [ ] **GitHub Issues disabled** on `brettforbes/spiderfeet-widget`
  - Impact: issue-scoped branches and board import cannot use GitHub Issues until enabled
  - Next action: GitHub → Settings → General → Features → enable Issues
- [ ] **Canonical GitHub Project board** — not created/normalized (blocked on project scope)
  - Next action: after `gh auth refresh`, re-run bootstrap in `update` mode per https://vibegov.io/docs/github-project-bootstrap

## Bootstrap follow-up

- [ ] Push local `develop` branch to `origin` when ready: `git push -u origin develop`
- [ ] Configure branch protection for `main` and `develop` per checklist
- [ ] Replace provisional `PROJECT_INTENT.md` with validated product brief
- [ ] Create `SPEC-002` (or rename SPEC-001) when product scope is defined
- [ ] Re-run bootstrap `update` after GitHub prerequisites complete

## Commit policy (this run)

**Mode:** `allowed` — bootstrap artifacts written locally; commit at operator discretion.
