# Git Workflow

Implements `gov-02-workflow.mdc` branch and PR rules for this repository.

## Branches

| Branch | Role |
|--------|------|
| `main` | Promotion / release. Accepts PRs from `develop` or hotfix-from-`main` only. |
| `develop` | Integration branch for normal work. |
| `feature/*`, `fix/*`, `docs/*`, `chore/*` | Issue-scoped work units from `develop`. |

## Rules

1. Create work branches from `develop` only (not from another feature branch).
2. Never commit or push directly to `main` or `develop`.
3. Open PRs into `develop` linking issue + spec + verification evidence.
4. Promote `develop` → `main` via explicit, reviewable promotion PR.
5. Hotfix: branch from `main`, PR to `main`, then reconcile into `develop`.
6. End a work turn on `develop` (or `main` for hotfix/release work), not a stray issue branch.

## Bootstrap state (2026-05-26)

- Local `develop` created from `main` during init.
- Remote: only `origin/main` observed; push `develop` when ready.
- Branch protection: not yet configured — see `.github/branch-protection-checklist.md`.

## PR template

`.github/pull_request_template.md`

## Issue pickup

`.governance/project/ISSUE_PICKUP_FLOW.md`
