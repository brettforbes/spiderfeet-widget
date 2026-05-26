# Bootstrap Analysis (current)

## Repository classification

- **Type:** Existing template codebase (webpack iFrame widget)
- **Product brief:** Not validated — template README only
- **Governance prior:** None (greenfield VibeGov install)
- **Provider rules:** None detected

## Empty-repo / vague-intent handling

Applied **bootstrap setup spec** as SPEC-001 rather than inferring product scope from `spiderfeet-widget` name.

## GitHub analysis

- Public repo, Issues feature off → issue-driven workflow blocked at source.
- `gh` token scopes: `gist`, `read:org`, `repo`, `workflow` — **missing `read:project` and `project`**.
- `main` exists, no `develop` on remote; protection API returns 404 for `main`.
- CI present: `.github/workflows/webpack.yml`

## Risk register (bootstrap)

| Risk | Mitigation |
|------|------------|
| Agents assume product scope from repo name | Provisional intent + SPEC-001 |
| Board setup silently skipped | INIT-TODO + BLOCKERS + explicit STATUS |
| Direct pushes to main | GIT_WORKFLOW + protection checklist (pending apply) |

## Historical evidence

Mid-run observation: project list failed before scope refresh — final state remains **blocked** until operator runs `gh auth refresh`.

See run bundle: `history/20260526T141000Z/analysis.md`
