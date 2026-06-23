## Problem statement

Subscriptions page must allow creating/editing API keys per service. When a key is saved, Tests for that module become available immediately.

## Desired outcome

- Accordion body form: secret field(s) per module `module_opts` (e.g. `api_key`), masked display, Save/Clear
- `PUT /subscriptions/modules/{module_id}` on save
- On success: toast/status + header icon updates to "key present"
- Cross-tab signal: Tests tab refreshes plan/catalog or listens for `subscriptions:updated` event so accordion items appear without full page reload

## Epic

Parent: #32 [Epic] Stage 4d — Tests tab UI

## Spec binding

- SPEC-002: **R2-04-05**

## Acceptance criteria

- [ ] Save persists key; masked value shown on reload
- [ ] Clear key removes opt and Tests tab hides module again (if key required)
- [ ] Validation error from API surfaced in UI
- [ ] Never log or display full secret after initial entry

## Verification

- Enter key for `sfp_threatjammer` → Tests tab shows module → Run produces events or explicit API error (not "missing key")

## Dependencies

- spiderfeet #SF-04C-11 Subscriptions API
