window.Widgets = window.Widgets || {};
window.Widgets.Composer = window.Widgets.Composer || {};

/**
 * SPEC-011 AR1–AR3 / AS1–AS3 / AT1–AT2 / AU1–AU2 / AV1–AV3 / AW1–AW3 / R11-06–R20, R11-23 —
 * Composer shell, expand/revert, CanvasGraph viewers, left YAML iframe,
 * stepSelected → CliScanApp, unset-step gating, option-change → YAML setYaml,
 * validation → Scan Now / Run Workflow enable, live execute (step + full workflow),
 * read-only replay, temp-graph import.
 */
(function ($, Composer, Widgets, document, window) {
  'use strict';

  Composer.selectorPanel = '[data-widget="composer-panel"]';

  /** Left column Bootstrap width states (AS1 embeds yaml-workflow-widget here). */
  Composer.LEFT_STATES = {
    collapsed: { label: 'collapsed' },
    partial: { label: 'partial', leftCols: 3, centerCols: 9 },
    full: { label: 'full', leftCols: 12, centerCols: 0 },
  };

  /** @type {{ instanceId: string, reload: Function, destroy: Function, setOnOptionsChange?: Function, setRunEnabled?: Function }|null} */
  Composer._cliScanApp = null;
  /** @type {string|null} */
  Composer._selectedStepId = null;
  /** @type {string|null} */
  Composer._selectedToolId = null;
  /** Whether the mounted CliScanApp step already has a persisted run (AV2). */
  Composer._cliScanHasRun = false;
  /** Monotonic token so async prior-run fetches ignore stale step selections. */
  Composer._stepSelectSeq = 0;
  /** @type {ReturnType<typeof setTimeout>|null} */
  Composer._optionYamlTimer = null;
  /** Debounce for CliScanApp → setYaml (R11-14). */
  Composer.OPTION_YAML_DEBOUNCE_MS = 200;
  /** True while AO2 full-workflow execute is in flight (R11-23). */
  Composer._workflowRunBusy = false;
  /** SPEC-017 R17-10 — after a terminal run, Run stays off until Reset succeeds. */
  Composer._runBlockedUntilReset = false;
  /** True while Reset Workflow is in flight (SPEC-015 R15-16). */
  Composer._workflowResetBusy = false;
  /** SPEC-015 — single active status poller handle. */
  Composer._statusPoller = null;
  /** SPEC-017 B2 — step ids that already triggered a temp list re-GET this run. */
  Composer._reloadedTempStepIds = new Set();
  /** In-flight guard for coalesced temporary-context reloads. */
  Composer._tempListReloadPromise = null;
  /** Poll interval for live DAG status (R15-14). */
  Composer.STATUS_POLL_MS = 1000;
  Composer.STATUS_POLL_MAX_BACKOFF_MS = 8000;
  /** Terminal run_registry states from execute-async. */
  Composer.TERMINAL_RUN_STATES = {
    success: true,
    error: true,
    cancelled: true,
  };

  /** yaml-workflow-widget chrome node ids (mapper.js). */
  Composer.WORKFLOW_START_ID = '__workflow_start__';
  Composer.WORKFLOW_TARGET_ID = '__workflow_target__';
  /** @type {Record<string, 'waiting'|'running'|'complete'|'failed'>} */
  Composer._lastStatusMap = {};
  /** @type {Record<string, string[]>} */
  Composer._workflowNeedsByStep = {};

  /**
   * SPEC-015 §0.1 — backend scan_status → DAG UI state.
   * @param {string|null|undefined} scanStatus
   * @returns {'waiting'|'running'|'complete'|'failed'}
   */
  Composer.mapScanStatusToUi = function (scanStatus) {
    const s = String(scanStatus || 'UNKNOWN').toUpperCase();
    if (s === 'FINISHED') return 'complete';
    if (s === 'ERROR-FAILED') return 'failed';
    if (s === 'STARTING' || s === 'RUNNING') return 'running';
    return 'waiting';
  };

  /**
   * Refresh step→needs map from the current editor YAML (for DAG promotion).
   * @param {string} [yaml]
   * @returns {Record<string, string[]>}
   */
  Composer.refreshWorkflowNeeds = function (yaml) {
    const text =
      yaml != null
        ? String(yaml)
        : Widgets.ComposerWorkflow?.getWorkflowYaml?.() || '';
    const steps = Widgets.ComposerWorkflow?.parseWorkflowSteps?.(text) || [];
    const needsByStep = {};
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      if (!step?.id) continue;
      needsByStep[String(step.id)] = Array.isArray(step.needs)
        ? step.needs.map(String)
        : [];
    }
    Composer._workflowNeedsByStep = needsByStep;
    return needsByStep;
  };

  /**
   * Map GET /workflows/{id}/status → DAG UI statuses with Start/Target chrome,
   * ready-descendant promotion, and no complete/failed→waiting downgrade.
   * @param {{
   *   steps?: Array<{step_id?: string, stepId?: string, scan_status?: string}>,
   *   run_state?: string
   * }|null|undefined} statusPayload
   * @param {{
   *   previousMap?: Record<string, string>,
   *   needsByStep?: Record<string, string[]>,
   *   yaml?: string
   * }|null} [options]
   * @returns {Record<string, 'waiting'|'running'|'complete'|'failed'>}
   */
  Composer.statusPayloadToMap = function (statusPayload, options) {
    const opts = options || {};
    const steps = Array.isArray(statusPayload?.steps) ? statusPayload.steps : [];
    const runState = String(statusPayload?.run_state || '').toLowerCase();
    const active = runState === 'starting' || runState === 'running';
    const terminal = !!Composer.TERMINAL_RUN_STATES[runState];
    const prev =
      opts.previousMap && typeof opts.previousMap === 'object'
        ? opts.previousMap
        : Composer._lastStatusMap || {};
    let needsByStep =
      opts.needsByStep && typeof opts.needsByStep === 'object'
        ? opts.needsByStep
        : Composer._workflowNeedsByStep;
    if (
      (!needsByStep || !Object.keys(needsByStep).length) &&
      (opts.yaml != null || Widgets.ComposerWorkflow?.getWorkflowYaml)
    ) {
      needsByStep = Composer.refreshWorkflowNeeds(opts.yaml);
    }

    /** @type {Record<string, 'waiting'|'running'|'complete'|'failed'>} */
    const map = {};
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      const stepId = step?.step_id || step?.stepId;
      if (!stepId) continue;
      map[String(stepId)] = Composer.mapScanStatusToUi(step.scan_status);
    }

    // Ensure YAML-known steps appear even before the backend lists them.
    const knownIds = Object.keys(needsByStep || {});
    for (let i = 0; i < knownIds.length; i += 1) {
      const id = knownIds[i];
      if (map[id] == null) map[id] = 'waiting';
    }

    // Never downgrade terminal chrome during an active run (httpx flicker fix).
    if (active) {
      const prevIds = Object.keys(prev);
      for (let i = 0; i < prevIds.length; i += 1) {
        const id = prevIds[i];
        const was = prev[id];
        if (
          (was === 'complete' || was === 'failed') &&
          (map[id] == null || map[id] === 'waiting')
        ) {
          map[id] = was;
        }
      }
    }

    // While running: ready waiting steps (all needs complete, or roots) → running.
    if (active) {
      const promoteIds = new Set([
        ...Object.keys(map),
        ...Object.keys(needsByStep || {}),
      ]);
      promoteIds.forEach((stepId) => {
        if (
          stepId === Composer.WORKFLOW_START_ID ||
          stepId === Composer.WORKFLOW_TARGET_ID
        ) {
          return;
        }
        const cur = map[stepId] || 'waiting';
        if (cur !== 'waiting') return;
        const needs = (needsByStep && needsByStep[stepId]) || [];
        const ready =
          needs.length === 0
            ? true
            : needs.every((needId) => map[String(needId)] === 'complete');
        if (ready) map[stepId] = 'running';
      });
    }

    if (active || terminal) {
      map[Composer.WORKFLOW_START_ID] = 'complete';
      map[Composer.WORKFLOW_TARGET_ID] = 'complete';
    }

    Composer._lastStatusMap = Object.assign({}, map);
    return map;
  };

  /** Stop the active status poller (R15-14 / R15-17). */
  Composer.stopStatusPoller = function () {
    const poller = Composer._statusPoller;
    Composer._statusPoller = null;
    if (!poller) return;
    poller.stopped = true;
    if (poller.timer) {
      clearTimeout(poller.timer);
      poller.timer = null;
    }
  };

  /**
   * Poll GET /workflows/{id}/status and forward setStepStatuses until terminal.
   * @param {string} workflowId
   * @param {{ onUpdate?: Function, onTerminal?: Function, onError?: Function }|null} [hooks]
   * @returns {{ stop: Function }}
   */
  Composer.startStatusPoller = function (workflowId, hooks) {
    Composer.stopStatusPoller();
    const api = Widgets.SpiderfeetApi;
    const wf = Widgets.ComposerWorkflow;
    const poller = {
      workflowId: String(workflowId),
      stopped: false,
      timer: null,
      backoffMs: Composer.STATUS_POLL_MS,
      hooks: hooks || {},
    };
    Composer._statusPoller = poller;
    Composer.refreshWorkflowNeeds();

    const schedule = (delay) => {
      if (poller.stopped || Composer._statusPoller !== poller) return;
      poller.timer = setTimeout(tick, delay);
    };

    const tick = async () => {
      if (poller.stopped || Composer._statusPoller !== poller) return;
      if (!api?.getWorkflowStatus) {
        poller.hooks.onError?.(new Error('getWorkflowStatus unavailable'));
        Composer.stopStatusPoller();
        return;
      }
      try {
        const payload = await api.getWorkflowStatus(poller.workflowId);
        if (poller.stopped || Composer._statusPoller !== poller) return;
        poller.backoffMs = Composer.STATUS_POLL_MS;
        const map = Composer.statusPayloadToMap(payload, {
          previousMap: Composer._lastStatusMap,
          needsByStep: Composer._workflowNeedsByStep,
        });
        wf?.setStepStatuses?.(map);
        poller.hooks.onUpdate?.(payload, map);
        const runState = payload?.run_state ? String(payload.run_state) : '';
        if (runState && Composer.TERMINAL_RUN_STATES[runState]) {
          const terminalHooks = poller.hooks;
          Composer.stopStatusPoller();
          Composer.applyRunLockFromStatus(payload);
          terminalHooks.onTerminal?.(payload, map);
          return;
        }
        schedule(Composer.STATUS_POLL_MS);
      } catch (err) {
        if (poller.stopped || Composer._statusPoller !== poller) return;
        poller.hooks.onError?.(err);
        poller.backoffMs = Math.min(
          (poller.backoffMs || Composer.STATUS_POLL_MS) * 2,
          Composer.STATUS_POLL_MAX_BACKOFF_MS
        );
        schedule(poller.backoffMs);
      }
    };

    schedule(0);
    return {
      stop() {
        if (Composer._statusPoller === poller) Composer.stopStatusPoller();
      },
    };
  };

  /**
   * Build a temp-import-friendly result from a status payload after async completion.
   * @param {string} workflowId
   * @param {object} statusPayload
   * @returns {object}
   */
  Composer._statusToExecuteResult = function (workflowId, statusPayload) {
    const steps = Array.isArray(statusPayload?.steps) ? statusPayload.steps : [];
    let succeeded = 0;
    let failed = 0;
    const mapped = steps.map((step) => {
      const scanStatus = String(step.scan_status || 'UNKNOWN').toUpperCase();
      const ok = scanStatus === 'FINISHED';
      const err = scanStatus === 'ERROR-FAILED';
      if (ok) succeeded += 1;
      if (err) failed += 1;
      return {
        step_id: step.step_id,
        scan_instance_id: step.scan_instance_id,
        status: err ? 'error' : ok ? 'ok' : 'pending',
        skipped: false,
      };
    });
    return {
      ok: failed === 0,
      workflow_id: workflowId,
      status: statusPayload?.run_state || 'done',
      succeeded,
      failed,
      step_count: mapped.length,
      steps: mapped,
      message: `Workflow ${workflowId} ${statusPayload?.run_state || 'finished'}`,
    };
  };

  /**
   * R11-15 / AU2 — Scan Now enablement from editor validation only (no client guess).
   * Completed steps stay disabled regardless of YAML validity.
   * @param {{ ok?: boolean }|null|undefined} validation
   * @param {boolean} hasRun
   * @returns {boolean}
   */
  Composer.runEnabledFromValidation = function (validation, hasRun) {
    if (hasRun) return false;
    return !!(validation && validation.ok);
  };

  /**
   * R11-23 / AV3 / SPEC-017 R17-10 — Run Workflow enablement.
   * Disabled while a full-workflow run is in flight, or after a terminal run
   * until Reset Workflow succeeds.
   * @param {{ ok?: boolean }|null|undefined} validation
   * @returns {boolean}
   */
  Composer.workflowRunEnabledFromValidation = function (validation) {
    if (Composer._workflowRunBusy) return false;
    if (Composer._runBlockedUntilReset) return false;
    return !!(validation && validation.ok);
  };

  /**
   * SPEC-017 R17-10 — derive Run lock from workflow status / reset response.
   * @param {{ run_state?: string, run_ready?: boolean, status?: string }|null|undefined} statusPayload
   */
  Composer.applyRunLockFromStatus = function (statusPayload) {
    if (!statusPayload || typeof statusPayload !== 'object') return;
    if (
      statusPayload.run_ready === true ||
      String(statusPayload.status || '').toUpperCase() === 'RESET'
    ) {
      Composer._runBlockedUntilReset = false;
      return;
    }
    const runState = String(statusPayload.run_state || '').toLowerCase();
    if (runState && Composer.TERMINAL_RUN_STATES[runState]) {
      Composer._runBlockedUntilReset = true;
    }
  };

  /** Central viewer panes that support full-screen expand (R11-07) + CanvasGraph (R11-08). */
  Composer.EXPANDABLE_PANES = {
    'project-context': {
      sectionId: 'composer-project-context',
      buttonId: 'composer-context-expand',
      stageId: 'composer-project-context-stage',
      canvasId: 'composer-project-context-canvas',
      tooltipId: 'composer-project-context-tooltip',
      label: 'Project Context Viewer',
      /** Empty by design this spec (future project content). */
      initialGraph: { nodes: [], links: [] },
    },
    'temp-subgraph': {
      sectionId: 'composer-temp-subgraph',
      buttonId: 'composer-temp-expand',
      stageId: 'composer-temp-subgraph-stage',
      canvasId: 'composer-temp-subgraph-canvas',
      tooltipId: 'composer-temp-subgraph-tooltip',
      label: 'Temporary Subgraph Viewer',
      /** AW1–AW3 temporary_id imports, discrete remove, strip-on-send. */
      initialGraph: { nodes: [], links: [] },
    },
  };

  Composer._leftState = 'partial';
  Composer._rightOpen = false;
  /** @type {null|'project-context'|'temp-subgraph'} */
  Composer._expandedPane = null;
  /** @type {Record<string, object|null>} */
  Composer._graphs = {
    'project-context': null,
    'temp-subgraph': null,
  };
  /** @type {Record<string, number>} */
  Composer._graphMountGeneration = {
    'project-context': 0,
    'temp-subgraph': 0,
  };

  Composer.setStatus = function (message) {
    const el = document.getElementById('composer-status-text');
    if (el) el.textContent = message;
  };

  Composer._stripColClasses = function (el) {
    if (!el) return;
    Array.from(el.classList).forEach((cls) => {
      if (/^col(-\d+)?$/.test(cls)) el.classList.remove(cls);
    });
  };

  Composer._applyColumnClasses = function (el, cols) {
    if (!el) return;
    Composer._stripColClasses(el);
    if (cols == null) {
      el.classList.add('col');
      return;
    }
    if (cols > 0) el.classList.add(`col-${cols}`);
  };

  /**
   * Set left-column width: collapsed (0) | partial (≈3) | full (12).
   * @param {'collapsed'|'partial'|'full'} state
   */
  Composer.setLeftState = function (state) {
    const cfg = Composer.LEFT_STATES[state];
    if (!cfg) return;

    Composer._leftState = state;
    const workspace = document.getElementById('composer-workspace');
    const left = document.getElementById('composer-left');
    const rail = document.getElementById('composer-left-rail');
    const center = document.getElementById('composer-center');

    if (workspace) workspace.dataset.composerLeftState = state;

    const collapsed = state === 'collapsed';
    const full = state === 'full';

    if (left) {
      left.classList.toggle('d-none', collapsed);
      left.classList.toggle('d-flex', !collapsed);
      if (collapsed) {
        Composer._stripColClasses(left);
      } else {
        Composer._applyColumnClasses(left, cfg.leftCols);
      }
    }

    if (rail) {
      rail.classList.toggle('d-none', !collapsed);
      rail.classList.toggle('d-flex', collapsed);
    }

    if (center) {
      center.classList.toggle('d-none', full);
      center.classList.toggle('d-flex', !full);
      if (full) {
        Composer._stripColClasses(center);
      } else if (collapsed) {
        // Rail is fixed-width; center fills remainder of the 12-col row.
        Composer._applyColumnClasses(center, null);
      } else {
        Composer._applyColumnClasses(center, cfg.centerCols);
      }
    }

    document.querySelectorAll('button[data-composer-left-state]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.composerLeftState === state);
    });

    // AS1–AS2 / R11-09–R11-10 — keep iframe mounted; sync URL; handshake survives collapse.
    if (Widgets.ComposerWorkflow?.syncWidthState) {
      Widgets.ComposerWorkflow.syncWidthState(state);
    }

    Composer.setStatus(`Workflow column: ${cfg.label}.`);
  };

  /**
   * Open/close the right CliScanApp slide-in (covers columns 4–12 when open).
   * @param {boolean} open
   */
  Composer.setRightOpen = function (open) {
    Composer._rightOpen = !!open;
    const workspace = document.getElementById('composer-workspace');
    const right = document.getElementById('composer-right');
    if (workspace) workspace.dataset.composerRightOpen = open ? 'true' : 'false';
    if (right) {
      if (open) {
        right.removeAttribute('hidden');
        right.classList.add('composer-right-open');
      } else {
        right.setAttribute('hidden', '');
        right.classList.remove('composer-right-open');
      }
    }
    if (!open) {
      Composer.destroyCliScanApp();
      Composer._selectedStepId = null;
      Composer._selectedToolId = null;
      Composer._setRightTitle('CLI App');
      Composer._showSlotPlaceholder('Select a workflow step to open its CLI app.');
    }
    Composer.setStatus(open ? 'CLI app panel open.' : 'CLI app panel closed.');
  };

  Composer._setRightTitle = function (title) {
    const el = document.getElementById('composer-right-title');
    if (el) el.textContent = title || 'CLI App';
  };

  Composer._getCliScanSlot = function () {
    return document.getElementById('composer-cliscan-slot');
  };

  /**
   * Destroy the mounted Composer CliScanApp instance if any.
   */
  Composer.destroyCliScanApp = function () {
    if (Composer._optionYamlTimer) {
      clearTimeout(Composer._optionYamlTimer);
      Composer._optionYamlTimer = null;
    }
    if (Composer._cliScanApp?.destroy) {
      try {
        Composer._cliScanApp.destroy();
      } catch (err) {
        console.warn('Composer.destroyCliScanApp', err);
      }
    }
    Composer._cliScanApp = null;
    Composer._cliScanHasRun = false;
  };

  /**
   * Empty / summary content for the right slot (no CliScanApp).
   * @param {string} message
   * @param {{ title?: string, detail?: string }} [options]
   */
  Composer._showSlotPlaceholder = function (message, options) {
    const slot = Composer._getCliScanSlot();
    if (!slot) return;
    Composer.destroyCliScanApp();
    const title = options?.title || '';
    const detail = options?.detail || '';
    slot.className =
      'composer-cliscan-slot flex-grow-1 d-flex flex-column align-items-center justify-content-center text-body-secondary p-2 overflow-auto min-h-0';
    slot.innerHTML = [
      title ? `<p class="fw-semibold text-body mb-2 text-center">${escHtml(title)}</p>` : '',
      `<p class="small mb-0 text-center">${escHtml(message || '')}</p>`,
      detail ? `<p class="small text-body-secondary mt-2 mb-0 text-center">${escHtml(detail)}</p>` : '',
    ].join('');
  };

  /**
   * Seed CliScanApp detail from the step's current workflow `config.argv`.
   * @param {string} stepId
   * @returns {{ argv: string[], command?: string }|null}
   */
  Composer._detailFromStepArgv = function (stepId) {
    const wf = Widgets.ComposerWorkflow;
    if (!wf?.parseStepArgv) return null;
    const ownerId = wf.argvOwnerStepId?.(stepId) || stepId;
    if (!ownerId) return null;
    const argv = wf.parseStepArgv(wf.getWorkflowYaml?.() || '', ownerId);
    if (!Array.isArray(argv) || !argv.length) return null;
    return { argv, command: argv.join(' ') };
  };

  /**
   * Re-seed the open CliScanApp Scan form from current workflow YAML argv
   * (iframe edit → Scan tab). Skips while we are pushing options → YAML.
   */
  Composer.syncCliScanAppFromWorkflowYaml = function () {
    if (!Composer._cliScanApp || !Composer._selectedStepId) return;
    if (Composer._optionYamlTimer || Composer._suppressArgvReload) return;
    if (Composer._cliScanHasRun) return;
    const detail = Composer._detailFromStepArgv(Composer._selectedStepId);
    if (!detail) return;
    let current = [];
    try {
      current = Composer._cliScanApp.getArgvTokens?.() || [];
    } catch (_err) {
      current = [];
    }
    if (JSON.stringify(current) === JSON.stringify(detail.argv)) return;
    try {
      Composer._cliScanApp.reload({
        detail,
        hasRun: false,
        mode: 'edit-run',
        runEnabled: Composer.runEnabledFromValidation(
          Widgets.ComposerWorkflow?.getLastValidation?.() || null,
          false
        ),
        executeContext: Composer.resolveExecuteContext(Composer._selectedStepId),
        onOptionsChange: Composer._onCliScanOptionsChange,
        onScanComplete: Composer._onCliScanComplete,
      });
      Composer.setStatus(
        `Scan options refreshed from workflow YAML (${detail.argv.length} argv tokens).`
      );
    } catch (err) {
      console.warn('Composer.syncCliScanAppFromWorkflowYaml', err);
    }
  };

  /**
   * Resolve workflow id for SPEC-010 execute (project selection → YAML `id:`).
   * @returns {string|null}
   */
  Composer.resolveWorkflowId = function () {
    const selected =
      Composer.selectedWorkflow || Composer.currentWorkflow || null;
    if (selected && typeof selected === 'object') {
      const fromObj = selected.workflow_id || selected.id || selected.workflowId;
      if (fromObj) return String(fromObj).trim();
    }

    const project = Composer.selectedProject;
    if (project && typeof project === 'object') {
      if (project.workflow_id) return String(project.workflow_id).trim();
      const workflows = Array.isArray(project.workflows) ? project.workflows : [];
      for (let i = 0; i < workflows.length; i += 1) {
        const wf = workflows[i];
        if (typeof wf === 'string' && wf.trim()) return wf.trim();
        if (wf && typeof wf === 'object') {
          const id = wf.workflow_id || wf.id;
          if (id) return String(id).trim();
        }
      }
    }

    const yaml = Widgets.ComposerWorkflow?.getWorkflowYaml?.() || '';
    const match = String(yaml).match(/^\s*id:\s*['"]?([^\s'"#]+)/m);
    if (match && match[1]) return match[1].trim();
    return null;
  };

  /**
   * Build CliScanApp executeContext for the selected step (R11-16 / AV1).
   * @param {string} [stepId]
   * @returns {{ workflowId: string, stepId: string, projectId: string|null }|null}
   */
  Composer.resolveExecuteContext = function (stepId) {
    const sid = String(stepId || Composer._selectedStepId || '').trim();
    if (!sid) return null;
    const ownerId =
      Widgets.ComposerWorkflow?.argvOwnerStepId?.(sid) || sid;
    const workflowId = Composer.resolveWorkflowId();
    if (!workflowId || !ownerId) return null;
    const projectId = Composer.selectedProjectId
      ? String(Composer.selectedProjectId)
      : Composer.selectedProject?.project_id ||
        Composer.selectedProject?.id ||
        null;
    return {
      workflowId,
      stepId: ownerId,
      projectId: projectId ? String(projectId) : null,
    };
  };

  /**
   * Surface execute outcomes on Composer status (stub/errors stay visible).
   * On complete, re-GET temporary subgraph list (SPEC-017 B2).
   * @param {{ ok?: boolean, kind?: string, message?: string, detail?: object }} outcome
   */
  Composer._onCliScanComplete = function (outcome) {
    let message = outcome?.message || 'Scan finished.';
    if (outcome?.kind === 'complete') {
      Composer._cliScanHasRun = true;
      if (Composer._cliScanApp?.setHasRun) {
        Composer._cliScanApp.setHasRun(true);
      }
      if (Composer._cliScanApp?.setRunEnabled) {
        Composer._cliScanApp.setRunEnabled(false);
      }
      const pid = Composer.resolveProjectId();
      if (pid && Widgets.ComposerTempGraph?.loadFromServer) {
        Widgets.ComposerTempGraph.loadFromServer(pid).catch((err) => {
          console.warn('Composer._onCliScanComplete temp reload', err);
        });
      }
    }
    Composer.setStatus(message);
  };

  /**
   * Programmatic Scan Now (console / verification).
   * @returns {Promise<object|null>}
   */
  Composer.executeSelectedStep = async function () {
    const app = Composer._cliScanApp;
    if (!app?.runScanNow) {
      Composer.setStatus('No CliScanApp mounted — select a tool step first.');
      return null;
    }
    if (typeof app.setExecuteContext === 'function') {
      app.setExecuteContext(Composer.resolveExecuteContext(Composer._selectedStepId));
    }
    return app.runScanNow();
  };

  /**
   * Resolve project id for execute / workflow sync.
   * @returns {string|null}
   */
  Composer.resolveProjectId = function () {
    if (Composer.selectedProjectId) return String(Composer.selectedProjectId);
    const project = Composer.selectedProject;
    if (project && typeof project === 'object') {
      const id = project.project_id || project.id;
      if (id) return String(id);
    }
    return null;
  };

  /**
   * Apply editor validation to the Composer **Run Workflow** button (R11-23 / AV3).
   * @param {{ ok?: boolean }|null|undefined} validation
   */
  Composer.applyValidationToRunWorkflow = function (validation) {
    const btn = document.getElementById('composer-run-workflow');
    if (!btn) return;
    const enabled = Composer.workflowRunEnabledFromValidation(validation);
    btn.disabled = !enabled;
    btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    if (Composer._workflowRunBusy) {
      btn.textContent = 'Running…';
      btn.title = 'Full workflow execute in progress';
    } else if (Composer._runBlockedUntilReset) {
      btn.textContent = 'Run Workflow';
      btn.title = 'Disabled until Reset Workflow clears scan results';
    } else {
      btn.textContent = 'Run Workflow';
      btn.title = enabled
        ? 'Run the full multi-step workflow (editor validated)'
        : 'Disabled until the YAML DSL Workflow editor reports validationResult.ok';
    }
  };

  /**
   * Persist current editor YAML to TypeDB so AO2 runs the validated document (R11-23 / R13-18).
   * After PUT/create, re-fetches GET /workflows/{id} to confirm `workflow_yaml`.
   * @param {string} workflowId
   * @param {string} yaml
   * @param {string|null} projectId
   * @returns {Promise<{ ok: boolean, created?: boolean, workflow?: object, error?: string }>}
   */
  Composer.syncWorkflowYaml = async function (workflowId, yaml, projectId) {
    const api = Widgets.SpiderfeetApi;
    if (!api?.updateWorkflow) {
      return { ok: false, error: 'SpiderfeetApi.updateWorkflow unavailable' };
    }
    const body = { workflow_yaml: yaml };
    const want = String(yaml || '').trim();

    const confirmPersisted = async () => {
      if (!api.getWorkflow) {
        return { ok: false, error: 'SpiderfeetApi.getWorkflow unavailable for re-fetch' };
      }
      let confirmed = null;
      try {
        confirmed = await api.getWorkflow(workflowId);
      } catch (err) {
        return {
          ok: false,
          error: `re-fetch after persist failed: ${(err && err.message) || String(err)}`,
        };
      }
      if (!confirmed || confirmed.ok === false) {
        return {
          ok: false,
          error:
            confirmed?.message ||
            confirmed?.detail ||
            're-fetch after persist failed',
        };
      }
      const persisted = String(
        confirmed.workflow_yaml || confirmed.yaml || ''
      ).trim();
      // Backend stores canonical YAML (may differ whitespace/key order from editor).
      if (!persisted) {
        return {
          ok: false,
          error: 're-fetch returned empty workflow_yaml',
          workflow: confirmed,
        };
      }
      const idOf = (text) => {
        const m = String(text).match(/^\s*id:\s*['"]?([^\s'"#]+)/m);
        return m && m[1] ? m[1].trim() : null;
      };
      const wantId = idOf(want) || workflowId;
      const gotId = idOf(persisted);
      if (wantId && gotId && wantId !== gotId) {
        return {
          ok: false,
          error: `re-fetch workflow id mismatch (${gotId} vs ${wantId})`,
          workflow: confirmed,
        };
      }
      Composer.selectedWorkflow = Object.assign(
        {},
        Composer.selectedWorkflow || { workflow_id: workflowId },
        confirmed,
        { workflow_id: confirmed.workflow_id || confirmed.id || workflowId }
      );
      if (Composer.selectedProject && typeof Composer.selectedProject === 'object') {
        Composer.selectedProject.workflow_yaml = confirmed.workflow_yaml;
      }
      return { ok: true, workflow: confirmed };
    };

    try {
      let existing = null;
      if (api.getWorkflow) {
        try {
          existing = await api.getWorkflow(workflowId);
        } catch (_err) {
          existing = null;
        }
      }
      const exists = !!(existing && existing.ok === true);

      if (exists) {
        const updated = await api.updateWorkflow(workflowId, body);
        if (updated && updated.ok === false) {
          return {
            ok: false,
            error: updated.message || updated.detail || 'updateWorkflow failed',
          };
        }
        const confirmed = await confirmPersisted();
        if (!confirmed.ok) return confirmed;
        return { ok: true, created: false, workflow: confirmed.workflow };
      }

      if (!projectId || !api.createWorkflow) {
        return {
          ok: false,
          error: 'Workflow not found and no project_id to create it',
        };
      }
      const created = await api.createWorkflow(projectId, {
        workflow_id: workflowId,
        name: workflowId,
        workflow_yaml: yaml,
      });
      if (created && created.ok === false) {
        return {
          ok: false,
          error: created.message || created.detail || 'createWorkflow failed',
        };
      }
      Composer.selectedWorkflow = created || { workflow_id: workflowId };
      const confirmed = await confirmPersisted();
      if (!confirmed.ok) return confirmed;
      return { ok: true, created: true, workflow: confirmed.workflow };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err) };
    }
  };

  /**
   * R13-18 — persist editor YAML when leaving edit mode (spectacles) or before Run Workflow.
   * @param {{ reason?: string }} [options]
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  Composer.persistEditorWorkflowYaml = async function (options) {
    const reason = (options && options.reason) || 'persist';
    if (Composer._yamlPersistBusy) {
      return { ok: false, error: 'persist already in progress' };
    }
    const yaml = Widgets.ComposerWorkflow?.getWorkflowYaml?.() || '';
    if (!String(yaml).trim()) {
      Composer.setStatus(`Workflow YAML ${reason}: editor YAML is empty.`);
      return { ok: false, error: 'empty yaml' };
    }
    const workflowId = Composer.resolveWorkflowId();
    if (!workflowId) {
      Composer.setStatus(
        `Workflow YAML ${reason}: cannot resolve workflow id.`
      );
      return { ok: false, error: 'no workflow id' };
    }
    const projectId = Composer.resolveProjectId
      ? Composer.resolveProjectId()
      : Composer.selectedProjectId
        ? String(Composer.selectedProjectId)
        : null;

    Composer._yamlPersistBusy = true;
    Composer.setStatus(`Persisting workflow YAML for ${workflowId}…`);
    try {
      const sync = await Composer.syncWorkflowYaml(workflowId, yaml, projectId);
      if (!sync.ok) {
        Composer.setStatus(
          `Workflow YAML ${reason} failed — ${sync.error || 'unknown'}`
        );
        return sync;
      }
      const stepHint =
        Array.isArray(sync.workflow?.steps) && sync.workflow.steps.length
          ? ` · ${sync.workflow.steps.length} materialized step(s)`
          : '';
      Composer.setStatus(
        `Workflow YAML ${reason} confirmed for ${workflowId}${stepHint}.`
      );
      return sync;
    } finally {
      Composer._yamlPersistBusy = false;
    }
  };

  /**
   * SPEC-017 B2 — re-GET project temporary list from the server (read-only viewer).
   * @param {string} [projectId]
   * @param {{ reason?: string }} [opts]
   * @returns {Promise<{ ok: boolean, subgraphCount?: number }|null>}
   */
  Composer.reloadTemporaryContextFromServer = async function (projectId, opts) {
    const pid = projectId || Composer.resolveProjectId();
    if (!pid) return null;
    const temp = Widgets.ComposerTempGraph;
    if (!temp?.loadFromServer) return null;

    if (Composer._tempListReloadPromise) {
      return Composer._tempListReloadPromise;
    }

    Composer._tempListReloadPromise = temp
      .loadFromServer(pid)
      .then((result) => {
        if (result?.ok) {
          const n = result.subgraphCount != null ? result.subgraphCount : '?';
          const reason = opts?.reason ? ` (${opts.reason})` : '';
          Composer.setStatus?.(
            `Temporary subgraphs reloaded${reason}: ${n} subgraph${n === 1 ? '' : 's'}.`
          );
        }
        return result;
      })
      .catch((err) => {
        console.warn('Composer.reloadTemporaryContextFromServer', err);
        return { ok: false, message: (err && err.message) || String(err) };
      })
      .finally(() => {
        Composer._tempListReloadPromise = null;
      });

    return Composer._tempListReloadPromise;
  };

  /**
   * SPEC-017 B2 — on newly FINISHED steps during poll, re-GET temp list (no client-merge).
   * @param {object} payload GET /workflows/{id}/status body
   * @returns {Promise<boolean>}
   */
  Composer._reloadTemporaryContextIfNewFinished = async function (payload) {
    const steps = Array.isArray(payload?.steps) ? payload.steps : [];
    const fresh = steps.filter((step) => {
      const stepId = step?.step_id || step?.stepId;
      if (!stepId || Composer._reloadedTempStepIds.has(stepId)) return false;
      return String(step.scan_status || '').toUpperCase() === 'FINISHED';
    });
    if (!fresh.length) return false;
    fresh.forEach((step) => {
      const stepId = step.step_id || step.stepId;
      if (stepId) Composer._reloadedTempStepIds.add(String(stepId));
    });
    await Composer.reloadTemporaryContextFromServer(null, { reason: 'step FINISHED' });
    return true;
  };

  /**
   * Run the full validated multi-step workflow (R11-23 / AV3 + SPEC-015 R15-14).
   * Starts execute-async, polls status into the DAG, then imports temp graphs.
   * @returns {Promise<object|null>}
   */
  Composer.runWorkflow = async function () {
    if (Composer._workflowRunBusy) return null;
    if (Composer._runBlockedUntilReset) {
      Composer.setStatus(
        'Run Workflow disabled — press Reset Workflow before starting another run.'
      );
      return null;
    }

    const validation =
      Widgets.ComposerWorkflow?.getLastValidation?.() ||
      Widgets.ComposerWorkflow?._lastValidation ||
      null;
    if (!Composer.workflowRunEnabledFromValidation(validation)) {
      Composer.setStatus(
        'Run Workflow disabled — wait for the YAML editor to report validationResult.ok.'
      );
      Composer.applyValidationToRunWorkflow(validation);
      return null;
    }

    const yaml = Widgets.ComposerWorkflow?.getWorkflowYaml?.() || '';
    if (!String(yaml).trim()) {
      Composer.setStatus('Run Workflow: editor YAML is empty.');
      return null;
    }

    const workflowId = Composer.resolveWorkflowId();
    if (!workflowId) {
      Composer.setStatus(
        'Run Workflow: cannot resolve workflow id (set YAML `id:` or select a project workflow).'
      );
      return null;
    }

    const projectId = Composer.resolveProjectId();
    const api = Widgets.SpiderfeetApi;
    if (!api?.executeWorkflowAsync || !api?.getWorkflowStatus) {
      Composer.setStatus(
        'Run Workflow: async status client unavailable (need executeWorkflowAsync + getWorkflowStatus).'
      );
      return null;
    }

    Composer.stopStatusPoller();
    Composer._workflowRunBusy = true;
    Composer.applyValidationToRunWorkflow(validation);
    Composer.setStatus(`Syncing workflow YAML for ${workflowId}…`);

    /** @type {object|null} */
    let terminalPayload = null;
    try {
      const sync = await Composer.persistEditorWorkflowYaml({
        reason: 'Run Workflow',
      });
      if (!sync.ok) {
        Composer.setStatus(`Run Workflow: YAML sync failed — ${sync.error || 'unknown'}`);
        return null;
      }

      const body = {};
      if (projectId) body.project_id = projectId;
      Composer.setStatus(
        sync.created
          ? `Created workflow ${workflowId}; starting live run…`
          : `Starting live workflow ${workflowId}…`
      );

      const accepted = await api.executeWorkflowAsync(workflowId, body);
      if (!accepted || accepted.ok === false) {
        const msg =
          accepted?.message ||
          accepted?.detail ||
          accepted?.error ||
          'executeWorkflowAsync failed';
        Composer.setStatus(`Run Workflow failed: ${msg}`);
        return accepted || null;
      }

      const runId = accepted.run_id || accepted.runId || '?';
      Composer._reloadedTempStepIds = new Set();
      // SPEC-017 R17-03 — target temp is created as Run starts / Target colour changes.
      Composer.reloadTemporaryContextFromServer(projectId, {
        reason: 'Run Workflow start',
      }).catch((err) => {
        console.warn('Composer.runWorkflow start temp reload', err);
      });
      Composer.setStatus(
        `Workflow ${workflowId} running (run ${runId}) — live DAG status updating…`
      );

      terminalPayload = await new Promise((resolve, reject) => {
        let settled = false;
        Composer.startStatusPoller(workflowId, {
          onUpdate(payload) {
            const runErr = payload?.error ? String(payload.error) : '';
            const running = (payload?.steps || []).find((s) => {
              const st = String(s.scan_status || '').toUpperCase();
              return st === 'STARTING' || st === 'RUNNING';
            });
            if (running?.step_id) {
              Composer.setStatus(
                `Workflow ${workflowId}: ${running.step_id} running…`
              );
            } else if (runErr && String(payload?.run_state || '') === 'error') {
              Composer.setStatus(`Workflow ${workflowId} error: ${runErr}`);
            }
            // SPEC-017 B2 — re-GET temp list as each step finishes.
            Composer._reloadTemporaryContextIfNewFinished(payload).catch((err) => {
              console.warn('Composer.runWorkflow incremental temp reload', err);
            });
          },
          onTerminal(payload) {
            if (settled) return;
            settled = true;
            resolve(payload || {});
          },
          onError(err) {
            console.warn('Composer.runWorkflow status poll', err);
          },
        });
        // If startStatusPoller could not attach (no API), fail fast.
        if (!Composer._statusPoller) {
          settled = true;
          reject(new Error('Failed to start status poller'));
        }
      });

      const result = Composer._statusToExecuteResult(workflowId, terminalPayload);
      let subgraphCount = null;
      try {
        const reload = await Composer.reloadTemporaryContextFromServer(projectId, {
          reason: 'workflow terminal',
        });
        if (reload?.ok && reload.subgraphCount != null) {
          subgraphCount = reload.subgraphCount;
        }
      } catch (err) {
        console.warn('Composer.runWorkflow terminal temp reload', err);
      }

      const runErr = terminalPayload?.error ? String(terminalPayload.error) : '';
      const parts = [
        result.message || `Workflow ${workflowId} finished (${result.status || 'done'})`,
      ];
      if (runErr) {
        parts.push(`error: ${runErr}`);
      }
      parts.push(
        `steps ${result.succeeded ?? '?'}/${result.step_count ?? '?'}` +
          (result.failed != null ? `, failed ${result.failed}` : '')
      );
      if (subgraphCount != null && subgraphCount > 0) {
        parts.push(
          `Temporary viewer: ${subgraphCount} subgraph${subgraphCount === 1 ? '' : 's'}`
        );
      }
      Composer.setStatus(parts.join(' · '));
      Composer.applyRunLockFromStatus(terminalPayload);
      return result;
    } catch (err) {
      Composer.stopStatusPoller();
      Composer.setStatus(
        `Run Workflow error: ${(err && err.message) || String(err)}`
      );
      Composer._runBlockedUntilReset = true;
      return null;
    } finally {
      Composer._workflowRunBusy = false;
      if (terminalPayload) {
        Composer.applyRunLockFromStatus(terminalPayload);
      }
      const last =
        Widgets.ComposerWorkflow?.getLastValidation?.() ||
        Widgets.ComposerWorkflow?._lastValidation ||
        validation;
      Composer.applyValidationToRunWorkflow(last);
    }
  };

  /** Bind Run Workflow toolbar button (R11-23). */
  Composer._bindRunWorkflowButton = function () {
    if (Composer._runWorkflowBound) return;
    const btn = document.getElementById('composer-run-workflow');
    if (!btn) return;
    Composer._runWorkflowBound = true;
    btn.addEventListener('click', () => {
      Composer.runWorkflow();
    });
    const last =
      Widgets.ComposerWorkflow?.getLastValidation?.() ||
      Widgets.ComposerWorkflow?._lastValidation ||
      null;
    Composer.applyValidationToRunWorkflow(last);
  };

  /**
   * SPEC-015 R15-16 — clear DAG status chrome (all waiting / empty map).
   * @param {Record<string, string>|null} [statuses] optional explicit map; default clear
   */
  Composer.clearWorkflowStatuses = function (statuses) {
    Composer.stopStatusPoller();
    const wf = Widgets.ComposerWorkflow;
    if (!statuses || typeof statuses !== 'object') {
      Composer._lastStatusMap = {};
    }
    if (!wf?.setStepStatuses) return false;
    if (statuses && typeof statuses === 'object') {
      Composer._lastStatusMap = Object.assign({}, statuses);
      return wf.setStepStatuses(statuses);
    }
    return wf.setStepStatuses({});
  };

  /**
   * SPEC-015 R15-16 — one-shot paint of persisted step statuses (project open / restore).
   * @param {string} [workflowId]
   * @returns {Promise<Record<string, string>|null>}
   */
  Composer.paintWorkflowStatuses = async function (workflowId) {
    const id = String(workflowId || Composer.resolveWorkflowId() || '').trim();
    if (!id) return null;
    const api = Widgets.SpiderfeetApi;
    if (!api?.getWorkflowStatus) return null;
    try {
      const payload = await api.getWorkflowStatus(id);
      Composer.refreshWorkflowNeeds();
      const map = Composer.statusPayloadToMap(payload, {
        previousMap: Composer._lastStatusMap,
        needsByStep: Composer._workflowNeedsByStep,
      });
      Widgets.ComposerWorkflow?.setStepStatuses?.(map);
      Composer.applyRunLockFromStatus(payload);
      const lastVal =
        Widgets.ComposerWorkflow?.getLastValidation?.() ||
        Widgets.ComposerWorkflow?._lastValidation ||
        null;
      Composer.applyValidationToRunWorkflow(lastVal);
      return map;
    } catch (err) {
      console.warn('Composer.paintWorkflowStatuses', err);
      return null;
    }
  };

  /**
   * Clear CliScanApp when the selected project changes so prior-run UI cannot
   * leak across projects (YAML + contexts already swapped).
   */
  Composer.resetCliScanForProjectSwitch = function () {
    Composer._stepSelectSeq = (Composer._stepSelectSeq || 0) + 1;
    Composer._runBlockedUntilReset = false;
    Composer._selectedToolId = null;
    Composer._selectedStepId = null;
    Composer._cliScanHasRun = false;
    Composer._showSlotPlaceholder(
      'Select a workflow step to open its CLI app.',
      { title: 'Workflow' }
    );
    Composer._setRightTitle('Workflow');
  };

  /**
   * SPEC-016 B1 — clear then reload temporary (+ optional project) context for a project.
   * @param {string} projectId
   * @returns {Promise<{ ok: boolean, message?: string }>}
   */
  Composer.loadProjectContexts = async function (projectId) {
    const pid = projectId != null ? String(projectId).trim() : '';
    if (!pid) return { ok: false, message: 'No project id' };
    const temp = Widgets.ComposerTempGraph;
    if (!temp?.loadFromServer) {
      temp?.clear?.();
      return { ok: false, message: 'ComposerTempGraph.loadFromServer unavailable' };
    }
    Composer._reloadedTempStepIds = new Set();
    const result = await temp.loadFromServer(pid);
    if (result?.ok) {
      const parts = [`Loaded temporary context for ${pid}`];
      if (result.subgraphCount != null) {
        parts.push(`${result.subgraphCount} subgraph${result.subgraphCount === 1 ? '' : 's'}`);
      }
      if (result.nodeCount != null) {
        parts.push(`${result.nodeCount} nodes`);
      }
      Composer.setStatus(parts.join(' · '));
    } else if (result?.message) {
      console.warn('Composer.loadProjectContexts', result.message);
    }
    return result || { ok: false };
  };

  /**
   * Reset all scan steps to unscanned + clear temporary context; keep YAML.
   * Cancels in-flight status polling and unwinds DAG chrome (SPEC-015 R15-16).
   * @returns {Promise<object|null>}
   */
  Composer.resetWorkflow = async function () {
    if (Composer._workflowResetBusy || Composer._workflowRunBusy) return null;

    const workflowId = Composer.resolveWorkflowId();
    if (!workflowId) {
      Composer.setStatus(
        'Reset Workflow: cannot resolve workflow id (set YAML `id:` or select a project workflow).'
      );
      return null;
    }

    const projectId = Composer.resolveProjectId();
    const api = Widgets.SpiderfeetApi;
    if (!api?.resetWorkflow) {
      Composer.setStatus('Reset Workflow: SpiderfeetApi.resetWorkflow unavailable.');
      return null;
    }

    const btn = document.getElementById('composer-reset-workflow');
    Composer._workflowResetBusy = true;
    // Stop poller first — in-flight FINISHED reloads were repainting temps after clear.
    Composer.stopStatusPoller();
    Composer._tempListReloadPromise = null;
    Composer._reloadedTempStepIds = new Set();
    Composer.clearWorkflowStatuses({});
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Resetting…';
    }
    Composer.setStatus(`Resetting workflow ${workflowId}…`);

    try {
      const body = {};
      if (projectId) body.project_id = projectId;
      const result = await api.resetWorkflow(workflowId, body);

      if (!result || result.ok === false) {
        const msg =
          result?.message ||
          result?.detail ||
          result?.error ||
          'resetWorkflow failed';
        Composer.setStatus(`Reset Workflow failed: ${msg}`);
        return result || null;
      }

      // Backend wiped temps; leave the viewer empty until next Run / Scan Now.
      // Do not loadProjectContexts here — that re-GET raced with stale poll reloads
      // and put the previous temporary graphs straight back on the canvas.
      const temp = Widgets.ComposerTempGraph;
      if (temp?.clear) temp.clear();
      else Composer.mountCanvasGraph('temp-subgraph', { nodes: [], links: [] });

      const stepId = Composer._selectedStepId;
      if (stepId && Composer.handleStepSelected) {
        await Composer.handleStepSelected(stepId);
      } else {
        Composer.resetCliScanForProjectSwitch();
      }

      // Backend rematerialized UNKNOWN shells — paint waiting for all steps.
      await Composer.paintWorkflowStatuses(workflowId);

      // SPEC-017 R17-10 — Reset re-enables Run when backend returns run_ready.
      Composer.applyRunLockFromStatus(result);
      const lastVal =
        Widgets.ComposerWorkflow?.getLastValidation?.() ||
        Widgets.ComposerWorkflow?._lastValidation ||
        null;
      Composer.applyValidationToRunWorkflow(lastVal);

      const steps = result.steps_reset != null ? result.steps_reset : '?';
      Composer.setStatus(
        result.message ||
          `Workflow ${workflowId} reset — ${steps} step(s) unscanned; temporary subgraphs cleared (target reappears on next Run / Scan Now).`
      );
      return result;
    } catch (err) {
      Composer.setStatus(
        `Reset Workflow error: ${(err && err.message) || String(err)}`
      );
      return null;
    } finally {
      Composer._workflowResetBusy = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Reset Workflow';
      }
    }
  };

  /** Bind Reset Workflow toolbar button (SPEC-015 R15-16). */
  Composer._bindResetWorkflowButton = function () {
    if (Composer._resetWorkflowBound) return;
    const btn = document.getElementById('composer-reset-workflow');
    if (!btn) return;
    Composer._resetWorkflowBound = true;
    btn.addEventListener('click', () => {
      Composer.resetWorkflow();
    });
  };

  /**
   * SPEC-015 R15-17 — tear down the status poller when leaving Composer / unloading.
   * New runs already call stop via startStatusPoller; this covers tab switch + page hide.
   */
  Composer._bindStatusPollerLifecycle = function () {
    if (Composer._statusPollerLifecycleBound) return;
    Composer._statusPollerLifecycleBound = true;

    const onTabChanged = (event) => {
      const tabId = event?.detail?.tabId;
      if (tabId && tabId !== 'composer') {
        Composer.stopStatusPoller();
      }
    };
    const onPageHide = () => {
      Composer.stopStatusPoller();
    };

    window.addEventListener('shell:tab-changed', onTabChanged);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);
  };

  /**
   * Debounced CliScanApp option → editor YAML update (R11-14 / AU1).
   * @param {{ argv?: string[] }} snapshot
   */
  Composer._onCliScanOptionsChange = function (snapshot) {
    if (Composer._optionYamlTimer) {
      clearTimeout(Composer._optionYamlTimer);
      Composer._optionYamlTimer = null;
    }
    Composer._optionYamlTimer = setTimeout(() => {
      Composer._optionYamlTimer = null;
      Composer._applyCliScanOptionsToYaml(snapshot);
    }, Composer.OPTION_YAML_DEBOUNCE_MS);
  };

  /**
   * Recompute step argv from CliScanApp options and push setYaml.
   * @param {{ argv?: string[] }} snapshot
   */
  Composer._applyCliScanOptionsToYaml = function (snapshot) {
    const wf = Widgets.ComposerWorkflow;
    const stepId = Composer._selectedStepId;
    if (!wf?.applyStepOptionArgv || !stepId) return;
    Composer._suppressArgvReload = true;
    const result = wf.applyStepOptionArgv(stepId, snapshot?.argv || []);
    window.setTimeout(() => {
      Composer._suppressArgvReload = false;
    }, 400);
    if (!result?.ok) {
      if (result?.reason === 'argv-block-missing') {
        Composer.setStatus(
          `Step ${result.stepId || stepId}: no config.argv block to update.`
        );
      }
      return;
    }
    if (result.unchanged) return;
    Composer.setStatus(
      `Updated ${result.stepId} argv from CliScanApp options (${(result.argv || []).length} tokens).`
    );
  };

  /**
   * Apply editor `validationResult` to the mounted CliScanApp Scan Now button (R11-15 / AU2).
   * Driven solely by iframe messages forwarded as `composer-workflow:validation-result`.
   * @param {{ ok?: boolean, diagnostics?: unknown[] }|null|undefined} validation
   */
  Composer.applyValidationToScanNow = function (validation) {
    const app = Composer._cliScanApp;
    if (!app?.setRunEnabled || !Composer._selectedToolId) return;

    const enabled = Composer.runEnabledFromValidation(validation, Composer._cliScanHasRun);
    app.setRunEnabled(enabled);

    const stepLabel = Composer._selectedStepId || Composer._selectedToolId;
    if (Composer._cliScanHasRun) {
      Composer.setStatus(`Step ${stepLabel}: prior run — Scan Now remains disabled.`);
      return;
    }
    Composer.setStatus(
      enabled
        ? `Step ${stepLabel}: workflow valid — Scan Now enabled.`
        : `Step ${stepLabel}: workflow invalid — Scan Now disabled.`
    );
  };

  /**
   * Fetch persisted four forms for the selected workflow step (R11-17 / AV2).
   * @param {string} stepId
   * @returns {Promise<{ scanInstanceId: string, payload: object, detail: object }|null>}
   */
  Composer.fetchPriorRunForStep = async function (stepId) {
    const ctx = Composer.resolveExecuteContext(stepId);
    if (!ctx?.workflowId || !ctx?.stepId) return null;
    const api = Widgets.SpiderfeetApi;
    if (!api?.fetchPriorScanStep) return null;
    try {
      return await api.fetchPriorScanStep(ctx.workflowId, ctx.stepId);
    } catch (err) {
      console.warn('Composer.fetchPriorRunForStep', err);
      return null;
    }
  };

  /**
   * Mount CliScanApp for a resolved workflow tool step.
   * Unset steps (no prior run): edit-run, Scan tab only; Scan Now follows validation (R11-13/15).
   * Prior runs (AV2): view mode, four forms loaded, Scan Complete / disabled (R11-17).
   * Seeds options from workflow argv and pushes option edits back via setYaml (R11-14 / AU1).
   * @param {{ toolId: string, stepId: string, title?: string, mode?: 'view'|'edit-run', hasRun?: boolean, runEnabled?: boolean, detail?: object|null }} opts
   */
  Composer.mountCliScanApp = function (opts) {
    const toolId = opts?.toolId;
    const stepId = opts?.stepId || '';
    const slot = Composer._getCliScanSlot();
    if (!slot || !toolId) return null;

    if (!window.Widgets?.CliScanApp?.create) {
      Composer._showSlotPlaceholder('CliScanApp component not loaded. Rebuild/restart the widget.', {
        title: toolId,
      });
      Composer.setStatus('CliScanApp component not loaded.');
      return null;
    }

    const hasRun = opts?.hasRun === true;
    const mode = opts?.mode === 'view' || hasRun ? 'view' : 'edit-run';
    Composer._cliScanHasRun = hasRun;
    // R11-15: prefer explicit opts, else last editor validationResult (never client-side guess).
    // Prior runs stay disabled regardless of YAML validity (R11-17).
    let runEnabled;
    if (hasRun || mode === 'view') {
      runEnabled = false;
    } else if (opts && Object.prototype.hasOwnProperty.call(opts, 'runEnabled')) {
      runEnabled = opts.runEnabled === true;
    } else {
      const last = Widgets.ComposerWorkflow?.getLastValidation?.() || null;
      runEnabled = Composer.runEnabledFromValidation(last, hasRun);
    }
    const detail = opts?.detail ?? Composer._detailFromStepArgv(stepId);
    const executeContext =
      opts?.executeContext || Composer.resolveExecuteContext(stepId);
    const onOptionsChange = mode === 'edit-run' ? Composer._onCliScanOptionsChange : null;
    const onScanComplete = Composer._onCliScanComplete;

    // Same tool + already mounted → reload detail only (avoid destroy storm).
    if (
      Composer._cliScanApp &&
      Composer._selectedToolId === toolId &&
      slot.querySelector('[data-cli-scan-id]')
    ) {
      Composer._selectedStepId = stepId;
      Composer._setRightTitle(opts.title || `${toolId} · ${stepId}`);
      try {
        Composer._cliScanApp.reload({
          toolId,
          mode,
          scenarioKey: stepId || null,
          detail,
          hasRun,
          runEnabled,
          executeContext,
          onOptionsChange,
          onScanComplete,
        });
      } catch (err) {
        console.warn('Composer.mountCliScanApp reload failed', err);
      }
      return Composer._cliScanApp;
    }

    Composer.destroyCliScanApp();
    slot.className = 'composer-cliscan-slot flex-grow-1 d-flex flex-column min-h-0 overflow-hidden p-0';
    slot.replaceChildren();
    Composer._selectedToolId = toolId;
    Composer._selectedStepId = stepId;
    Composer._cliScanHasRun = hasRun;
    Composer._setRightTitle(opts.title || `${toolId} · ${stepId}`);

    try {
      Composer._cliScanApp = window.Widgets.CliScanApp.create({
        container: slot,
        toolId,
        mode,
        layout: 'composer',
        scenarioKey: stepId || null,
        detail,
        hasRun,
        runEnabled,
        executeContext,
        onOptionsChange,
        onScanComplete,
        instanceId: 'composer-cli-scan',
        dataSource: { contentBase: '/content', corpusBase: '/cli-corpus' },
      });
    } catch (err) {
      console.error('Composer.mountCliScanApp failed', err);
      Composer._cliScanApp = null;
      Composer._cliScanHasRun = false;
      Composer._showSlotPlaceholder(err.message || 'Failed to open CliScanApp.', {
        title: toolId,
      });
      Composer.setStatus(`CliScanApp failed — ${err.message}`);
      return null;
    }
    return Composer._cliScanApp;
  };

  /**
   * Handle yaml-workflow-widget `stepSelected` (R11-12 / AT1 / R11-17).
   * Async: looks up persisted scan_step and mounts read-only replay when present.
   * @param {string} stepId
   * @param {object} [resolved] precomputed ComposerWorkflow.resolveStepSelection result
   * @returns {Promise<void>}
   */
  Composer.handleStepSelected = async function (stepId, resolved) {
    const seq = ++Composer._stepSelectSeq;
    const wf = Widgets.ComposerWorkflow;
    const info =
      resolved ||
      (wf?.resolveStepSelection
        ? wf.resolveStepSelection(stepId)
        : { classified: { kind: 'empty', stepId: '', label: 'No step' }, openTool: false });

    const classified = info.classified || { kind: 'empty', stepId: stepId || '', label: stepId || '' };
    Composer._selectedStepId = classified.stepId || stepId || null;

    if (classified.kind === 'special' || classified.kind === 'empty') {
      Composer._selectedToolId = null;
      Composer._showSlotPlaceholder(
        classified.kind === 'special'
          ? 'This diagram node is workflow chrome, not a CLI tool step. Select a step with a `uses: tool.*` binding to open CliScanApp.'
          : 'Select a workflow step to open its CLI app.',
        {
          title: classified.label || classified.stepId || 'Workflow',
          detail: classified.stepId ? `id: ${classified.stepId}` : '',
        }
      );
      Composer._setRightTitle(classified.label || 'Workflow');
      Composer._openRightPanel();
      Composer.setStatus(
        classified.kind === 'special'
          ? `${classified.label} selected — no CLI tool.`
          : 'No step selected.'
      );
      return;
    }

    if (!info.openTool || !info.toolId) {
      Composer._selectedToolId = null;
      const label = classified.label || classified.stepId;
      Composer._showSlotPlaceholder(
        'No `uses: tool.*` binding found for this step in the current workflow YAML.',
        {
          title: label,
          detail: classified.stepId ? `id: ${classified.stepId}` : '',
        }
      );
      Composer._setRightTitle(label);
      Composer._openRightPanel();
      Composer.setStatus(`Step ${label}: no tool binding.`);
      return;
    }

    const title =
      classified.kind === 'subtask'
        ? `${info.toolId} · ${classified.subtask}`
        : `${info.toolId} · ${classified.stepId}`;

    // Open panel first so layout sizes CliScanApp; avoid setRightOpen(false) destroy.
    Composer._openRightPanel();
    Composer.setStatus(
      `Checking for prior run of ${info.toolId} / ${classified.stepId}…`
    );

    const prior = await Composer.fetchPriorRunForStep(classified.stepId);
    if (seq !== Composer._stepSelectSeq) return;

    if (prior?.detail) {
      const argvDetail = Composer._detailFromStepArgv(classified.stepId);
      const detail = Object.assign({}, argvDetail || {}, prior.detail);
      Composer.mountCliScanApp({
        toolId: info.toolId,
        stepId: classified.stepId,
        title,
        mode: 'view',
        hasRun: true,
        runEnabled: false,
        detail,
      });
      Composer.setStatus(
        `Opened ${info.toolId} for step ${classified.stepId} — prior run replay (read-only; Scan Complete).`
      );
      return;
    }

    const lastValidation = Widgets.ComposerWorkflow?.getLastValidation?.() || null;
    const runEnabled = Composer.runEnabledFromValidation(lastValidation, false);
    Composer.mountCliScanApp({
      toolId: info.toolId,
      stepId: classified.stepId,
      title,
      mode: 'edit-run',
      hasRun: false,
      runEnabled,
    });
    Composer.setStatus(
      runEnabled
        ? `Opened ${info.toolId} for step ${classified.stepId} (unset — Scan Now enabled; workflow valid).`
        : `Opened ${info.toolId} for step ${classified.stepId} (unset — Scan tab only; Scan Now disabled until editor validates).`
    );
  };

  /** Open right slide-in without clearing mount state. */
  Composer._openRightPanel = function () {
    Composer._rightOpen = true;
    const workspace = document.getElementById('composer-workspace');
    const right = document.getElementById('composer-right');
    if (workspace) workspace.dataset.composerRightOpen = 'true';
    if (right) {
      right.removeAttribute('hidden');
      right.classList.add('composer-right-open');
    }
  };

  function escHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  Composer._expandIconClass = 'fa-up-right-and-down-left-from-center';
  Composer._revertIconClass = 'fa-down-left-and-up-right-to-center';

  /**
   * Sync expand/revert button chrome for one pane.
   * @param {string} paneKey
   * @param {boolean} expanded
   */
  Composer._syncExpandButton = function (paneKey, expanded) {
    const meta = Composer.EXPANDABLE_PANES[paneKey];
    if (!meta) return;
    const btn = document.getElementById(meta.buttonId);
    if (!btn) return;
    const icon = btn.querySelector('[data-composer-expand-icon]') || btn.querySelector('i');
    const action = expanded ? 'Revert' : 'Expand';
    const label = `${action} ${meta.label}`;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.setAttribute('aria-pressed', expanded ? 'true' : 'false');
    btn.classList.toggle('active', expanded);
    if (icon) {
      icon.classList.remove(Composer._expandIconClass, Composer._revertIconClass);
      icon.classList.add(expanded ? Composer._revertIconClass : Composer._expandIconClass);
    }
  };

  /**
   * Expand one central pane to fill the center column, or revert to the split.
   * @param {null|'project-context'|'temp-subgraph'} paneKey
   */
  Composer.setExpandedPane = function (paneKey) {
    if (paneKey != null && !Composer.EXPANDABLE_PANES[paneKey]) return;

    const center = document.getElementById('composer-center');
    const next = paneKey || null;
    Composer._expandedPane = next;

    if (center) {
      center.dataset.composerExpanded = next || '';
      center.classList.toggle('composer-center-expanded', !!next);
    }

    Object.keys(Composer.EXPANDABLE_PANES).forEach((key) => {
      const meta = Composer.EXPANDABLE_PANES[key];
      const section = document.getElementById(meta.sectionId);
      const isExpanded = next === key;
      const isHiddenSibling = !!next && !isExpanded;
      if (section) {
        section.classList.toggle('composer-viewer-expanded', isExpanded);
        section.classList.toggle('composer-viewer-collapsed-by-expand', isHiddenSibling);
        section.toggleAttribute('hidden', isHiddenSibling);
        if (isHiddenSibling) {
          section.setAttribute('aria-hidden', 'true');
        } else {
          section.removeAttribute('aria-hidden');
        }
      }
      Composer._syncExpandButton(key, isExpanded);
    });

    if (next) {
      Composer.setStatus(`${Composer.EXPANDABLE_PANES[next].label} expanded. Press Escape or Revert to restore split.`);
      const btn = document.getElementById(Composer.EXPANDABLE_PANES[next].buttonId);
      btn?.focus({ preventScroll: true });
    } else {
      Composer.setStatus('Split view restored.');
    }
  };

  /**
   * Toggle expand for a pane; expanding another pane switches focus to it.
   * @param {'project-context'|'temp-subgraph'} paneKey
   */
  Composer.toggleExpandedPane = function (paneKey) {
    if (!Composer.EXPANDABLE_PANES[paneKey]) return;
    Composer.setExpandedPane(Composer._expandedPane === paneKey ? null : paneKey);
  };

  /**
   * Return the live CanvasGraph API for a central pane (null if not mounted).
   * @param {'project-context'|'temp-subgraph'} paneKey
   */
  Composer.getCanvasGraph = function (paneKey) {
    return Composer._graphs[paneKey] || null;
  };

  /**
   * Destroy a pane's CanvasGraph instance if present.
   * @param {'project-context'|'temp-subgraph'} paneKey
   */
  Composer.destroyCanvasGraph = function (paneKey) {
    const api = Composer._graphs[paneKey];
    if (api?.destroy) {
      try {
        api.destroy();
      } catch (err) {
        console.warn('Composer.destroyCanvasGraph', paneKey, err);
      }
    }
    Composer._graphs[paneKey] = null;
  };

  /**
   * Mount (or remount) Viz.CanvasGraph in a central pane.
   * Empty `{nodes:[],links:[]}` is valid and must not throw (R11-08).
   * @param {'project-context'|'temp-subgraph'} paneKey
   * @param {{nodes?: Array, links?: Array}} [graph]
   */
  Composer.mountCanvasGraph = function (paneKey, graph) {
    const meta = Composer.EXPANDABLE_PANES[paneKey];
    if (!meta) return null;
    if (!window.Viz?.CanvasGraph?.create) {
      console.error('Composer.mountCanvasGraph: Viz.CanvasGraph unavailable');
      Composer.setStatus('CanvasGraph unavailable.');
      return null;
    }

    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    const links = Array.isArray(graph?.links) ? graph.links : [];
    const generation = ++Composer._graphMountGeneration[paneKey];
    Composer.destroyCanvasGraph(paneKey);

    const stage = document.getElementById(meta.stageId);
    const canvasEl = document.getElementById(meta.canvasId);
    if (!stage || !canvasEl) {
      console.error('Composer.mountCanvasGraph: missing stage/canvas for', paneKey);
      return null;
    }

    const tryMount = (attempts) => {
      if (generation !== Composer._graphMountGeneration[paneKey]) return;
      const rect = stage.getBoundingClientRect();
      // Wait for layout when Composer tab / expand has not sized the stage yet.
      if ((rect.width <= 20 || rect.height <= 20) && attempts < 60) {
        requestAnimationFrame(() => tryMount(attempts + 1));
        return;
      }
      try {
        Composer._graphs[paneKey] = window.Viz.CanvasGraph.create({
          canvas: `#${meta.canvasId}`,
          tooltip: `#${meta.tooltipId}`,
          nodes,
          links,
          // SPEC-016 B3 — cluster each import group in the temp viewer.
          variant: paneKey === 'temp-subgraph' ? 'grouped' : 'default',
          nodeDisplay: 'icons',
          linkLabels: false,
          linkDistance: 80,
        });
      } catch (err) {
        console.error('Composer.mountCanvasGraph failed', paneKey, err);
        Composer._graphs[paneKey] = null;
        Composer.setStatus(`${meta.label}: graph mount failed — ${err.message}`);
      }
    };
    tryMount(0);
    return Composer._graphs[paneKey];
  };

  /**
   * Mount both central CanvasGraph viewers (R11-08).
   * Project Context starts empty; Temporary viewer is ready for AW data later.
   */
  Composer.mountCanvasViewers = function () {
    Object.keys(Composer.EXPANDABLE_PANES).forEach((paneKey) => {
      const meta = Composer.EXPANDABLE_PANES[paneKey];
      Composer.mountCanvasGraph(paneKey, meta.initialGraph || { nodes: [], links: [] });
    });
  };

  Composer.bindLayoutControls = function (root) {
    root.querySelectorAll('button[data-composer-left-state]').forEach((btn) => {
      btn.addEventListener('click', () => {
        Composer.setLeftState(btn.dataset.composerLeftState);
      });
    });

    root.querySelector('#composer-right-close')?.addEventListener('click', () => {
      Composer.setRightOpen(false);
    });

    root.querySelectorAll('button[data-composer-expand]').forEach((btn) => {
      btn.addEventListener('click', () => {
        Composer.toggleExpandedPane(btn.dataset.composerExpand);
      });
    });

    if (!Composer._expandEscapeBound) {
      Composer._expandEscapeBound = true;
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !Composer._expandedPane) return;
        const target = event.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        const pane = document.getElementById('pane-composer');
        if (!pane || pane.classList.contains('d-none')) return;
        event.preventDefault();
        Composer.setExpandedPane(null);
      });
    }
  };

  Composer._bindStepSelectedListener = function () {
    if (Composer._stepSelectedBound) return;
    Composer._stepSelectedBound = true;
    window.addEventListener('composer-workflow:step-selected', (event) => {
      // Direct call from ComposerWorkflow already handled; this covers external dispatch.
      if (event?.detail?._handledByComposer) return;
      Composer.handleStepSelected(event?.detail?.stepId, event?.detail);
    });
  };

  /** R11-15 / AU2 / R11-23 — editor validationResult drives Scan Now + Run Workflow. */
  Composer._bindValidationResultListener = function () {
    if (Composer._validationResultBound) return;
    Composer._validationResultBound = true;
    window.addEventListener('composer-workflow:validation-result', (event) => {
      const detail = event?.detail || null;
      Composer.applyValidationToScanNow(detail);
      Composer.applyValidationToRunWorkflow(detail);
    });
  };

  /** Workflow YAML changed in iframe → keep Scan tab options in sync. */
  Composer._bindYamlChangedListener = function () {
    if (Composer._yamlChangedBound) return;
    Composer._yamlChangedBound = true;
    window.addEventListener('composer-workflow:yaml-changed', () => {
      Composer.syncCliScanAppFromWorkflowYaml();
    });
  };

  /** R13-18 — leaving edit mode (spectacles) persists editor YAML via PUT + re-fetch. */
  Composer._bindEditModePersistListener = function () {
    if (Composer._editModePersistBound) return;
    Composer._editModePersistBound = true;
    Composer._editSessionActive = false;
    window.addEventListener('composer-workflow:edit-mode-changed', (event) => {
      const editing = !!event?.detail?.editing;
      if (editing) {
        Composer._editSessionActive = true;
        return;
      }
      if (!Composer._editSessionActive) return;
      Composer._editSessionActive = false;
      Composer.persistEditorWorkflowYaml({ reason: 'edit-exit' });
    });
  };

  Composer.initPanel = function ($root) {
    const el = $root[0];
    if (el.dataset.initialized) return;
    el.dataset.initialized = 'true';

    Composer.bindLayoutControls(el);
    Composer._bindStepSelectedListener();
    Composer._bindValidationResultListener();
    Composer._bindYamlChangedListener();
    Composer._bindEditModePersistListener();
    Composer._bindRunWorkflowButton();
    Composer._bindResetWorkflowButton();
    Composer._bindStatusPollerLifecycle();
    Composer.setLeftState('partial');
    Composer.setRightOpen(false);
    Composer.setExpandedPane(null);
    Composer.mountCanvasViewers();
    if (Widgets.ComposerWorkflow?.initFromComposer) {
      Widgets.ComposerWorkflow.initFromComposer();
    }
    if (Widgets.ComposerTempGraph?.initFromComposer) {
      Widgets.ComposerTempGraph.initFromComposer();
    }
    // First Composer open: restore session default or first Projects-table row.
    if (Widgets.Projects?.restoreComposerFromStorage) {
      Widgets.Projects.restoreComposerFromStorage().catch((err) => {
        console.warn('Composer.initPanel restoreComposerFromStorage', err);
      });
    }
    Composer.setStatus(
      'Composer layout ready — select a YAML step for Scan Now, or Run Workflow when valid.'
    );
  };

  Widgets.watchDOMForComponent(Composer.selectorPanel, Composer.initPanel);
})(window.jQuery, window.Widgets.Composer, window.Widgets, document, window);
