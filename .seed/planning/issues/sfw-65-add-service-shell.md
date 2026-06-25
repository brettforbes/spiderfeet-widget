**Epic:** #723 · **Program:** spiderfeet [Custom CLI registration](https://github.com/brettforbes/spiderfeet/issues/723)

## Problem

Operators need a UI to register CLI tools as OSINT services without editing JSON or Python. Today there is no navbar entry for this.

## Desired outcome

New navbar tab **Add Service** in `content.html` shell:

- Tab label: **Add Service** (exact string)
- Route key: `add-service` (or `add_service` — pick one in implementation)
- Placed after **Subscriptions**, before **Tests** (adjust if UX review says otherwise)
- Phase 3 deliverable: full wizard (#67); this issue delivers shell + placeholder

## Acceptance criteria

- [ ] Navbar button enabled (not disabled placeholder)
- [ ] Tab panel region with `data-widget="add-service-panel"`
- [ ] Shell tab switching works (same pattern as Maps / Tests / Subscriptions)
- [ ] Empty state copy: "Register a CLI tool as an OSINT service" + link to epic #723
- [ ] Webpack entry: stub `add-service.js` module registered

## Verification

- Manual: click Add Service tab, panel visible, other tabs still work
- Build: `npm run build` passes

## Spec

R3-05-08 (widget scope)

## Depends

Backend #798 for functional form (#67)

## Blocks

#66 (wizard UI)
