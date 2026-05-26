# Branch Protection Checklist

Apply on GitHub for governed branches after `develop` exists on the remote.

## `main` (promotion / release)

- [ ] Require pull request before merging
- [ ] Require approvals (≥ 1, or team policy)
- [ ] Require status checks to pass (CI workflow: `.github/workflows/webpack.yml`)
- [ ] Require branches to be up to date before merging
- [ ] Restrict direct pushes (including administrators, per policy)
- [ ] Do not allow force pushes
- [ ] Do not allow deletions

## `develop` (integration)

- [ ] Require pull request before merging
- [ ] Require status checks to pass
- [ ] Restrict direct pushes (agents must not push directly)
- [ ] Allow only merge commits or squash per team preference (document choice)

## Notes

- **Current state (2026-05-26):** `main` is not branch-protected (API 404). Local `develop` created; remote `develop` may not exist until pushed.
- **Private repo limitation:** If branch-protection UI/API is unavailable, record degraded verification in `INIT-TODO.md` with evidence and next action — do not treat as full bootstrap failure for local governance install.

## Verification commands

```bash
gh api repos/brettforbes/spiderfeet-widget/branches/main/protection
gh api repos/brettforbes/spiderfeet-widget/branches/develop/protection
```

## Related

- `.governance/project/GIT_WORKFLOW.md`
- `gov-02-workflow.mdc` (GOV-02-GIT-*)
