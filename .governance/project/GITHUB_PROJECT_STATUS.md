# GitHub Project Status

**Last updated:** 2026-05-26 (bootstrap `init`)

## Preflight summary

| Check | State |
|-------|--------|
| `git` | configured |
| `gh` | configured |
| GitHub auth | configured (`brettforbes`) |
| Repo access | configured |
| Project read | **blocked-with-tracked-issue** |
| Project write | **blocked-with-tracked-issue** |
| Branch protection (`main`) | **degraded verification** — not protected (404) |
| GitHub Issues | **blocked** — disabled on repository |

## Canonical board

**Not configured** — board mutation skipped due to missing `read:project` / `project` token scopes.

### Remediation

```bash
gh auth refresh -s read:project,project
```

Then re-run VibeGov bootstrap in **`update`** mode per https://vibegov.io/docs/github-project-bootstrap

### Expected board shape (when configured)

- Status: Backlog, Ready, In progress, In review, Done, Blocked
- Priority: P0, P1, P2
- Size: XS, S, M, L, XL
- Repo linked to single canonical board
- Issues imported or board reported intentionally empty

## Issues

Repository has **Issues disabled**. No issues to import. Enable Issues before issue-scoped workflow.

## `develop` branch

| Location | Status |
|----------|--------|
| Local | Created during bootstrap init |
| Remote `origin/develop` | Not present until pushed |

## Repo linkage

Pending — requires project write access and board creation/adoption.
