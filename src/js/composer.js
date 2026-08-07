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
   * R11-23 / AV3 — Run Workflow enablement from editor validation only.
   * Disabled while a full-workflow run is in flight.
   * @param {{ ok?: boolean }|null|undefined} validation
   * @returns {boolean}
   */
  Composer.workflowRunEnabledFromValidation = function (validation) {
    if (Composer._workflowRunBusy) return false;
    return !!(validation && validation.ok);
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
      'composer-cliscan-slot flex-grow-1 d-flex flex-column align-items-center justify-content-center text-body-secondary p-3 overflow-auto min-h-0';
    slot.innerHTML = [
      title ? `<p class="fw-semibold text-body mb-2 text-center">${escHtml(title)}</p>` : '',
      `<p class="small mb-0 text-center">${escHtml(message || '')}</p>`,
      detail ? `<p class="small text-body-secondary mt-2 mb-0 text-center">${escHtml(detail)}</p>` : '',
    ].join('');
  };

  /**
   * Seed CliScanApp detail from the step's current workflow `config.argv`.
   * @param {string} stepId
   * @returns {{ argv: string[] }|null}
   */
  Composer._detailFromStepArgv = function (stepId) {
    const wf = Widgets.ComposerWorkflow;
    if (!wf?.parseStepArgv) return null;
    const ownerId = wf.argvOwnerStepId?.(stepId) || stepId;
    if (!ownerId) return null;
    const argv = wf.parseStepArgv(wf.getWorkflowYaml?.() || '', ownerId);
    if (!argv.length) return null;
    return { argv };
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
   * On complete + context.export scan_graph, AW1 imports into Temporary Subgraph Viewer.
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
      if (Widgets.ComposerTempGraph?.handleScanComplete) {
        try {
          const imported = Widgets.ComposerTempGraph.handleScanComplete(outcome, {
            stepId: Composer._selectedStepId,
          });
          if (imported?.subgraphId) {
            const n = Widgets.ComposerTempGraph.getSubgraphs?.()?.length || 0;
            message = `${message} Temporary viewer: +1 discrete subgraph (${n} total).`;
          }
        } catch (err) {
          console.warn('ComposerTempGraph.handleScanComplete failed', err);
        }
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
    } else {
      btn.textContent = 'Run Workflow';
      btn.title = enabled
        ? 'Run the full multi-step workflow (editor validated)'
        : 'Disabled until the YAML DSL Workflow editor reports validationResult.ok';
    }
  };

  /**
   * Persist current editor YAML to TypeDB so AO2 runs the validated document (R11-23).
   * @param {string} workflowId
   * @param {string} yaml
   * @param {string|null} projectId
   * @returns {Promise<{ ok: boolean, created?: boolean, error?: string }>}
   */
  Composer.syncWorkflowYaml = async function (workflowId, yaml, projectId) {
    const api = Widgets.SpiderfeetApi;
    if (!api?.updateWorkflow) {
      return { ok: false, error: 'SpiderfeetApi.updateWorkflow unavailable' };
    }
    const body = { workflow_yaml: yaml };
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
        return { ok: true, created: false };
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
      return { ok: true, created: true };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err) };
    }
  };

  /**
   * After AO2 completes, import scan_graph exports into Temporary Subgraph Viewer.
   * @param {object} result executeWorkflow response
   * @returns {Promise<number>} number of discrete imports
   */
  Composer._importWorkflowTempGraphs = async function (result) {
    const steps = Array.isArray(result?.steps) ? result.steps : [];
    const api = Widgets.SpiderfeetApi;
    const temp = Widgets.ComposerTempGraph;
    if (!temp?.handleScanComplete || !api) return 0;

    let imported = 0;
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      if (!step || step.status === 'error' || step.skipped) continue;
      const stepId = step.step_id || step.stepId;
      if (!stepId) continue;

      let detail = null;
      const scanInstanceId = step.scan_instance_id || step.scanInstanceId;
      if (scanInstanceId && api.getScanStep) {
        try {
          const payload = await api.getScanStep(scanInstanceId);
          if (payload && payload.ok !== false && api.scanStepToDetail) {
            detail = api.scanStepToDetail(payload);
          }
        } catch (err) {
          console.warn('Composer._importWorkflowTempGraphs getScanStep', err);
        }
      }

      const outcome = {
        ok: true,
        kind: 'complete',
        detail: detail || null,
        result: detail || step,
      };
      try {
        const hit = temp.handleScanComplete(outcome, { stepId });
        if (hit?.subgraphId) imported += 1;
      } catch (err) {
        console.warn('Composer._importWorkflowTempGraphs import', err);
      }
    }
    return imported;
  };

  /**
   * Run the full validated multi-step workflow (R11-23 / AV3).
   * @returns {Promise<object|null>}
   */
  Composer.runWorkflow = async function () {
    if (Composer._workflowRunBusy) return null;

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
    if (!api?.executeWorkflow) {
      Composer.setStatus('Run Workflow: SpiderfeetApi.executeWorkflow unavailable.');
      return null;
    }

    Composer._workflowRunBusy = true;
    Composer.applyValidationToRunWorkflow(validation);
    Composer.setStatus(`Syncing workflow YAML for ${workflowId}…`);

    try {
      const sync = await Composer.syncWorkflowYaml(workflowId, yaml, projectId);
      if (!sync.ok) {
        Composer.setStatus(`Run Workflow: YAML sync failed — ${sync.error || 'unknown'}`);
        return null;
      }

      Composer.setStatus(
        sync.created
          ? `Created workflow ${workflowId}; executing multi-step run…`
          : `Executing multi-step workflow ${workflowId}…`
      );

      const body = {};
      if (projectId) body.project_id = projectId;
      const result = await api.executeWorkflow(workflowId, body);

      if (!result || result.ok === false) {
        const msg =
          result?.message ||
          result?.detail ||
          result?.error ||
          'executeWorkflow failed';
        Composer.setStatus(`Run Workflow failed: ${msg}`);
        return result || null;
      }

      const succeeded = result.succeeded != null ? result.succeeded : null;
      const failed = result.failed != null ? result.failed : null;
      const skipped = result.skipped != null ? result.skipped : null;
      const stepCount =
        result.step_count != null
          ? result.step_count
          : Array.isArray(result.steps)
            ? result.steps.length
            : null;

      let imported = 0;
      try {
        imported = await Composer._importWorkflowTempGraphs(result);
      } catch (err) {
        console.warn('Composer.runWorkflow temp import', err);
      }

      const parts = [
        result.message || `Workflow ${workflowId} finished (${result.status || 'done'})`,
      ];
      if (stepCount != null) {
        parts.push(
          `steps ${succeeded ?? '?'}/${stepCount}` +
            (failed != null ? `, failed ${failed}` : '') +
            (skipped != null ? `, skipped ${skipped}` : '')
        );
      }
      if (imported > 0) {
        parts.push(
          `Temporary viewer: +${imported} discrete subgraph${imported === 1 ? '' : 's'}`
        );
      }
      Composer.setStatus(parts.join(' · '));
      return result;
    } catch (err) {
      Composer.setStatus(
        `Run Workflow error: ${(err && err.message) || String(err)}`
      );
      return null;
    } finally {
      Composer._workflowRunBusy = false;
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
    const result = wf.applyStepOptionArgv(stepId, snapshot?.argv || []);
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
          variant: 'default',
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

  Composer.initPanel = function ($root) {
    const el = $root[0];
    if (el.dataset.initialized) return;
    el.dataset.initialized = 'true';

    Composer.bindLayoutControls(el);
    Composer._bindStepSelectedListener();
    Composer._bindValidationResultListener();
    Composer._bindRunWorkflowButton();
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
    Composer.setStatus(
      'Composer layout ready — select a YAML step for Scan Now, or Run Workflow when valid.'
    );
  };

  Widgets.watchDOMForComponent(Composer.selectorPanel, Composer.initPanel);
})(window.jQuery, window.Widgets.Composer, window.Widgets, document, window);
