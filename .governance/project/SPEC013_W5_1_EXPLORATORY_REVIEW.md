# SPEC-013 W5-1 — Projects + Composer GOV-08 review (R13-19)

**Date:** 2026-08-09  
**Mode:** Exploration (operator gate)  
**Review unit:** Projects page + Composer page (widget `:4001` + API `:8001`)  
**Completeness label:** Complete-with-blockers

## Preconditions / confidence limits

- Local TypeDB config must target **`spiderfeet-actual`** (not `spiderfeet-map`).  
  Gate run fixed `.config/typedb.connection.json` → `database: spiderfeet-actual` (gitignored).  
  With `spiderfeet-map`, `GET /projects` returns 500 (`Type label 'project' not found`).
- API restarted after config change; widget webpack-dev on `:4001`; yaml on `:4009`.
- Five seed projects verified earlier (`VERIFIED_OK` via `.seed/scripts/verify_seed_projects.py`).

## Scenario matrix

| Scenario | Classification | Evidence |
|----------|----------------|----------|
| Happy path — list 5 seed projects | Validated | `GET /api/v1/projects` → 200, count=5 |
| Loading / empty (API shape) | Validated | List returns array; complete payload nested `project` + `workflows[]` |
| Unreachable API (UI resilient) | Blocked | Not re-simulated this turn (W3-2 code landed earlier; needs UI kill-switch) |
| Create project (API) | Validated | `POST /projects` with `project_name` → 201 + info-only workflow + `workflow_yaml` |
| Create project (modal UI) | Blocked | Needs operator click-through on Projects New Project modal |
| Double-click → Composer `/complete` | Validated (API) | `GET /projects/{id}/complete` → 200; `workflows[0].workflow_yaml` present |
| Composer project dropdown + Add new | Blocked | Needs operator UI pass |
| Edit → spectacles persist | Blocked | Needs live Composer + yaml iframe interaction |
| Run Workflow persist path | Blocked | Needs UI execute (code path present in `composer.js`) |
| Navbar auto-hide / density | Blocked | Visual only |
| Workflow Bar pencil/gear chrome | Validated (markup) | Host HTML includes `composer-workflow-edit-toggle` + `composer-workflow-settings` |
| Keyboard / a11y | Blocked | Not exercised |

## Follow-ups filed / tracked

| Item | Action |
|------|--------|
| Config defaulting to `spiderfeet-map` breaks Projects | Operator: keep local config on `spiderfeet-actual` for SPEC-013; consider documenting in setup / start script |
| Residual UI scenarios above | Operator visual smoke on `:4001` against live API + seeds |

## Evidence

- `GET /api/v1/projects` → 5 projects  
- `GET /api/v1/projects/project--93d3d13c-…/complete` → workflow YAML for Simple Wireless Scan  
- `POST /api/v1/projects` `{project_name}` → Untitled/named project + workflow  
- Widget `http://localhost:4001/` → 200; markup includes edit/settings controls  
- Yaml `http://localhost:4009/?embed=1` → 200 (Composer dependency)
