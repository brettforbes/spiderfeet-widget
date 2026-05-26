# Bootstrap Blockers (current)

## B-001 — GitHub Project API scope

- **State:** blocked-with-tracked-issue
- **Evidence:** `gh project list` → `missing required scopes [read:project]`
- **Remediation:** `gh auth refresh -s read:project,project`
- **Then:** bootstrap `update` + `.governance/project/GITHUB_PROJECT_STATUS.md`

## B-002 — GitHub Issues disabled

- **State:** blocked-with-tracked-issue
- **Evidence:** `gh issue list` → repository has disabled issues
- **Remediation:** Enable Issues in repository settings
- **Impact:** Default issue pickup flow; board issue import

## B-003 — Branch protection not configured

- **State:** degraded verification (not a full bootstrap failure for local install)
- **Evidence:** `gh api .../branches/main/protection` → 404 Branch not protected
- **Remediation:** `.github/branch-protection-checklist.md`

## B-004 — Remote `develop` missing

- **State:** pending operator action
- **Remediation:** `git push -u origin develop` after review

## Product-code gate

Bootstrap **stopped before product implementation** per contract. Blockers above do not block local governance use but block **full** GitHub-hosted bootstrap completion.
