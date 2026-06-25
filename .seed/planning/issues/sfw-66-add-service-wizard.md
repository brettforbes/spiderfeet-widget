**Epic:** #62 · **Depends:** spiderfeet #798 · **Requires:** #65

## Problem

Operators need a guided flow to define CLI tool path, inputs, and output mappings.

## Desired outcome

**Add Service** tab form (Bootstrap 5):

1. **Identity** — name, summary, optional icon upload/select
2. **Executable** — path, interpreter (none/python/ruby/node), probe button → API `POST /{id}/probe`
3. **Input route** — consumed nugget dropdown (from catalogue), command argv template with `{target}`
4. **Output mapping** — preset: JSON path list, regex lines, or raw → single nugget type
5. **Smoke test** — seed input, run → show produced nuggets (reuse Tests result renderer patterns)
6. **Save** — POST manifest to backend; toast + link to Tests tab

## Acceptance criteria

- [ ] All required fields validated client-side before save
- [ ] Probe shows version or clear error
- [ ] Smoke uses same strict pass semantics as Tests tab
- [ ] Saved service visible on Maps within one bootstrap refresh cycle
- [ ] Error states: missing API, invalid manifest, probe failed

## Verification

- GOV-08 scenario matrix on Add Service route (happy, invalid input, probe fail, save + refresh)
- Manual cross-browser smoke on iframe embed

## Spec

R3-05-08

## Backend

spiderfeet #796 (schema), #797 (runner), #798 (API)
