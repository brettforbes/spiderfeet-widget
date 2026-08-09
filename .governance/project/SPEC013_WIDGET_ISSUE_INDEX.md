# SPEC-013 issue index — widget (`spiderfeet-widget`)

**Spec:** `@spiderfeet/.governance/specs/SPEC-013-projects-composer-refinement.md`
**Repo:** `brettforbes/spiderfeet-widget` · integration branch `develop`
**Builds on:** SPEC-011 (Composer/Projects UI — already delivered). Files below already exist and are being *refined*.

Status legend: `planned` → `open` → `in progress` → `in review` → `done`.

| Code | Issue | Requirement | Depends on | Status |
|------|-------|-------------|------------|--------|
| Epic W1 — UI density pass | [#204](https://github.com/brettforbes/spiderfeet-widget/issues/204) | R13-10 | — | open |
| W1-1 — Reduce navbar logo height + toolbar/content padding across panes | [#209](https://github.com/brettforbes/spiderfeet-widget/issues/209) | R13-10 | — | open |
| Epic W2 — Navbar auto-hide | [#205](https://github.com/brettforbes/spiderfeet-widget/issues/205) | R13-11 | — | open |
| W2-1 — Auto-hide navbar (~3s idle + on-navigate) with top-edge/keyboard reveal | [#210](https://github.com/brettforbes/spiderfeet-widget/issues/210) | R13-11 | — | open |
| Epic W3 — Projects page refinement | [#206](https://github.com/brettforbes/spiderfeet-widget/issues/206) | R13-12..15 | backend B1–B3 | open |
| W3-1 — Projects table columns → Name/Description/Created/Workflows/STIX | [#211](https://github.com/brettforbes/spiderfeet-widget/issues/211) | R13-12 | B1-3 | open |
| W3-2 — Resilient load: backend-unreachable state + retry | [#212](https://github.com/brettforbes/spiderfeet-widget/issues/212) | R13-13 | — | open |
| W3-3 — New Project modal: Name+Description; read-only id+created; create→Composer | [#213](https://github.com/brettforbes/spiderfeet-widget/issues/213) | R13-14 | B2-1 | open |
| W3-4 — Double-click row → open in Composer via `/complete` | [#214](https://github.com/brettforbes/spiderfeet-widget/issues/214) | R13-15 | B2-3 | open |
| Epic W4 — Composer dropdown + Workflow Bar controls | [#207](https://github.com/brettforbes/spiderfeet-widget/issues/207) | R13-16..18 | W3, Y1, B2 | open |
| W4-1 — Composer top-bar project dropdown + "Add new project" checkbox | [#215](https://github.com/brettforbes/spiderfeet-widget/issues/215) | R13-16 | W3-3, B2-3 | open |
| W4-2 — Workflow Bar pencil↔spectacles (edit) + gear (settings) wired to iFrame | [#216](https://github.com/brettforbes/spiderfeet-widget/issues/216) | R13-17 | Y1 (R13-21) | open |
| W4-3 — Persist editor YAML on edit-exit + Run Workflow (`PUT /workflows/{id}`) | [#217](https://github.com/brettforbes/spiderfeet-widget/issues/217) | R13-18 | B2-2, W4-2 | open |
| Epic W5 — Widget acceptance | [#208](https://github.com/brettforbes/spiderfeet-widget/issues/208) | R13-19 | W3, W4 | open |
| W5-1 — GOV-08 exploratory review (OPERATOR GATE) | [#218](https://github.com/brettforbes/spiderfeet-widget/issues/218) | R13-19 | all above | open |

## Execution order

```
W1-1 ∥ W2-1                     (independent, land first)
W3-1 → W3-2 → W3-3 → W3-4        (after backend B1–B3 + R13-06)
W4-1 → W4-2 → W4-3               (after W3 + yaml Y1 + backend B2)
W5-1 [OPERATOR GATE]            (after W3 + W4 + live backend + seeded projects)
```

## Per-issue detail

Key existing files (from SPEC-011): `src/html/content.html`, `src/js/projects.js`, `src/js/composer.js`, `src/js/composer-workflow.js`, `src/js/spiderfeet-api.js`, `src/js/shell.js`, `src/css/custom.css` (+ `src/sass/custom.scss` mirror).

### W1-1 — Density pass (R13-10)
- **Files:** `content.html` (toolbar `px-3 py-2` L241, workflow bar `px-2 py-1` L270, status `px-3 py-2` L467, per-pane `p-3` wrappers), `custom.css` navbar logo `height:4rem` (~L98–103) + scss mirror.
- **Do:** reduce logo height (e.g. 2.5rem), tighten toolbar `py-2→py-1` and content `p-3→p-2` consistently; keep both `custom.css` and `custom.scss` in sync.
- **Verify:** visually check each pane renders tighter with no clipping/overlap; note screenshots.

### W2-1 — Navbar auto-hide (R13-11)
- **Files:** `content.html` `<header>`/`<nav>` (L8–134), `shell.js`, `custom.css`.
- **Do:** add hide/show state (CSS transform slide + transition); hide timer ~3s idle and on tab activate; reveal on `mousemove` within ~48px of top and on `focusin`/Tab; respect `prefers-reduced-motion`. Reuse the fullscreen hide hook if helpful (`custom.css` L663–665).
- **Verify:** on each tab, navbar hides then reveals via top-edge hover and keyboard; no state trap.

### W3-1 — Projects columns (R13-12)
- **Files:** `projects.js` table render (~L151–195).
- **Do:** columns Name, Description, Created, Workflows (count), STIX (if present), Actions; map to new `ProjectOut` fields (R13-03).
- **Verify:** renders seeded 5 projects with names/descriptions.

### W3-2 — Resilient load (R13-13)
- **Files:** `projects.js` (`loadProjects` ~L233–285, `showError` ~L141–148), `spiderfeet-api.js` (`request` catch ~L113–117).
- **Do:** friendly "Backend unreachable — start the API on :8001" panel + Retry button + one auto-retry; distinguish empty vs error; drop the raw NetworkError string. Document the API start command in the panel/help.
- **Verify:** API down → friendly state + working retry; API up → table loads.

### W3-3 — New Project modal (R13-14)
- **Files:** `content.html` modal (L187–230), `projects.js` create path (~L308–378).
- **Do:** fields Name + Description (editable); read-only Project ID (`project--<uuidv4>` generated client-side or shown from response) and Created (now). Submit → backend create (R13-04) → redirect to Composer with the new project loaded.
- **Verify:** create → row appears (refresh proof) → Composer opens with info-only YAML in the iFrame.

### W3-4 — Double-click open (R13-15)
- **Files:** `projects.js` row handlers (~L200–213, `openProjectInComposer` ~L519–563).
- **Do:** add `dblclick` → open via `GET /projects/{id}/complete` → hand YAML to Composer (`setWorkflowYaml`). Keep single-click = select/highlight.
- **Verify:** double-click loads the project's workflow into the iFrame.

### W4-1 — Composer project dropdown (R13-16)
- **Files:** `content.html` composer top bar (L241–255), `composer.js`, `projects.js` (`renderComposerPlaceholder` L483–517).
- **Do:** dropdown next to the project label; top item = "Add new project" checkbox → opens New Project modal (W3-3); other items = projects from `GET /projects`; select → load via `/complete` + update label.
- **Verify:** switching projects reloads the iFrame; add-new opens the modal and, on create, selects the new project.

### W4-2 — Workflow Bar controls (R13-17)
- **Files:** `content.html` workflow bar (L270–309), `composer-workflow.js` (`postToWidget` ~L546–564).
- **Do:** add pencil icon → toggles to spectacles when editing; gear icon opens settings. Send `setEditMode {editing}` / `openSettings` (R13-21) to the iFrame; reflect `editModeChanged`. Do not add YAML/layout-dump buttons.
- **Verify:** pencil enters edit (icon → spectacles); spectacles returns to read-only; gear opens the iFrame settings.

### W4-3 — Persist on save points (R13-18)
- **Files:** `composer-workflow.js` (`yamlChanged` handler, mode-change), `composer.js` (`runWorkflow` ~L523+), `spiderfeet-api.js`.
- **Do:** on leaving edit mode (spectacles) and on Run Workflow, PUT the latest editor YAML to `PUT /workflows/{id}` (R13-05); re-fetch to confirm persisted.
- **Verify:** edit → spectacles → re-fetch shows updated `workflow_yaml` + materialized steps; same on Run Workflow.

### W5-1 — GOV-08 review (R13-19) — OPERATOR GATE
- **Do:** scenario matrix (happy/empty/loading/unreachable/create/double-click/dropdown+add-new/edit→persist/navbar hide-reveal/density) against live backend + 5 seeds; classify + file follow-ups; use the exploratory route report template.

## Governance
Branch from `develop`; PR into `develop`; close each issue with a completion note + evidence; merge before the next. Confirm autonomous self-merge posture with the operator (non-gate issues) before starting.
