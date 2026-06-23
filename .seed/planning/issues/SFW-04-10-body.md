## Problem statement

Operators need a dedicated **Subscriptions** page to view OSINT services, understand subscription tier, and enter API keys. Without this, Tests tab runs hundreds of doomed scans (missing keys).

## Desired outcome

- New navbar tab: **Subscriptions** (same shell as Maps/Tests)
- Layout mirrors Tests tab: left filter panel + main accordion list
- Accordion header: service id, name, **icon for key present/missing**, subscription tier icon (none / free / paid)
- Accordion body: title, description, website URL, consumed nuggets, produced nuggets, masked API key field + Save

## Epic

Parent: #32 [Epic] Stage 4d — Tests tab UI

## Spec binding

- SPEC-002: **R2-04-05** (SPEC_GAP)

## Acceptance criteria

- [ ] Tab registered in navbar; placeholder removed when implemented
- [ ] Loads module list from `GET /subscriptions/modules`
- [ ] Accordion expand loads detail from `GET /subscriptions/modules/{id}`
- [ ] Bootstrap 5 layout consistent with Tests tab (filters left, scroll region right)

## Verification

- Manual exploratory: open tab, expand module, see metadata
- Webpack build passes

## Dependencies

- Backend #SF-04C-11 (can scaffold with mock until API lands)
