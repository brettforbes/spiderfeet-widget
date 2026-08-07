/**
 * CliScanApp — reusable 5-tab CLI/API Scan UI component (SPEC-008).
 *
 * Tabs: Scan | Text | Structured | Graph | Report
 *
 * Mount anywhere (Profiling, Composer, or a future host):
 *
 *   const app = window.Widgets.CliScanApp.create({
 *     container: mountEl,          // required Element
 *     toolId: 'nmap',              // required for options-schema load
 *     mode: 'view' | 'edit-run',   // view = read-only examination; edit-run = live form
 *     scenarioKey: 'capstone_…',   // optional label
 *     detail: scenarioDetail,      // optional examination payload (text/structured/graph/md)
 *                                 // detail.argv (string[]) seeds the form from workflow config.argv
 *     hasRun: false,               // R11-13: false locks Text/Structured/Graph/Report
 *     runEnabled: false,           // R11-13/AU2: false keeps Scan Now disabled in edit-run
 *     executeContext: {            // R11-16 / AV1: Scan Now → SpiderfeetApi.executeStep
 *       workflowId, stepId, projectId?,
 *     },
 *     onOptionsChange: (snap) => {}, // edit-run: fires when options change ({ argv, values, toolId })
 *     onScanComplete: (result) => {}, // after execute (ok / stub / error)
 *     instanceId: 'my-scan',       // optional; unique per concurrent mount
 *     dataSource: {
 *       contentBase: '/content',   // options-schema + markdown docs
 *       corpusBase: '/cli-corpus', // unused by component today; reserved for hosts
 *     },
 *   });
 *   // later: app.reload({ toolId, detail, mode, hasRun, runEnabled, executeContext, onOptionsChange });
 *   //        app.setHasRun(true); app.setRunEnabled(true); app.runScanNow(); app.getArgvTokens(); app.destroy();
 *
 * Host pages own chrome around the mount. Graph fullscreen toggles
 * `.profiling-graph-host-fullscreen` on `container` so any host can style it.
 */
window.Widgets = window.Widgets || {};
window.Widgets.CliScanApp = window.Widgets.CliScanApp || {};

(function ($, CliScanApp, Widgets, Connection, DataViewerHost, document, window) {
  'use strict';

  CliScanApp.ICON_BASE = 'icons/';
  CliScanApp._instances = new Map();

  CliScanApp.META_NUGGET_IDS = new Set([
    'SCAN_RECORD', 'SCAN_CLI', 'SCAN_VERSION', 'SCAN_START', 'SCAN_TARGET',
    'SCAN_TOOL', 'SCAN_SUMMARY', 'SCAN_ELAPSED',
  ]);

  CliScanApp.NUGGET_TYPE_COLOUR = {
    ENTITY: '#3B82F6',
    DESCRIPTOR: '#F59E0B',
    DATA: '#14B8A6',
    SUBENTITY: '#F97316',
    INTERNAL: '#8B5CF6',
    CATEGORY: '#14B8A6',
  };

  CliScanApp.NUGGET_TYPE_LEGEND = [
    { type: 'ENTITY', label: 'Entity', colour: '#3B82F6' },
    { type: 'DESCRIPTOR', label: 'Descriptor', colour: '#F59E0B' },
    { type: 'CATEGORY', label: 'Category', colour: '#14B8A6' },
  ];

  CliScanApp.LINK_LEGEND = [
    { label: 'contains', className: 'legend-line' },
    { label: 'had (dashed)', className: 'legend-line legend-line-had' },
    { label: 'listens-to', className: 'legend-line legend-line-produced' },
  ];

  function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }


  /** True when examination/run detail carries any of the four output forms. */
  CliScanApp._detailHasRun = function (detail) {
    if (!detail || typeof detail !== 'object') return false;
    if (detail.output_text) return true;
    if (detail.narrative_markdown) return true;
    if (detail.graph_proposal && (detail.graph_proposal.nodes?.length || detail.graph_proposal.links?.length)) {
      return true;
    }
    const structured = detail.structured;
    if (structured == null) return false;
    if (typeof structured === 'string') return structured.length > 0;
    if (typeof structured === 'object') {
      if (structured.content != null && structured.content !== '') return true;
      if (Object.keys(structured).length > 0) return true;
    }
    return false;
  };

  CliScanApp._resolveHasRun = function (config, detail) {
    if (config && Object.prototype.hasOwnProperty.call(config, 'hasRun')) {
      return Boolean(config.hasRun);
    }
    return CliScanApp._detailHasRun(detail);
  };

  CliScanApp._resolveRunEnabled = function (config, mode, hasRun) {
    if (config && Object.prototype.hasOwnProperty.call(config, 'runEnabled')) {
      return Boolean(config.runEnabled);
    }
    // Unset edit-run steps keep Scan Now off until a host (AU2) enables it.
    if (mode === 'edit-run' && !hasRun) return false;
    return mode === 'edit-run';
  };

  CliScanApp.create = function (config) {
    const container = config.container;
    if (!container) throw new Error('CliScanApp.create requires container');

    const instanceId = config.instanceId || uid('cli-scan');
    const mode = config.mode === 'edit-run' ? 'edit-run' : 'view';
    const contentBase = config.dataSource?.contentBase || '/content';
    const corpusBase = config.dataSource?.corpusBase || '/cli-corpus';

    const detail = config.detail || null;
    const hasRun = CliScanApp._resolveHasRun(config, detail);
    const runEnabled = CliScanApp._resolveRunEnabled(config, mode, hasRun);

    const state = {
      instanceId,
      mode,
      toolId: config.toolId || '',
      scenarioKey: config.scenarioKey || null,
      detail,
      hasRun,
      runEnabled,
      executeContext: CliScanApp._normalizeExecuteContext(config.executeContext),
      onOptionsChange: typeof config.onOptionsChange === 'function' ? config.onOptionsChange : null,
      onScanComplete: typeof config.onScanComplete === 'function' ? config.onScanComplete : null,
      contentBase,
      corpusBase,
      schema: null,
      manifest: null,
      values: {},
      rows: [],
      graphInstance: null,
      graphRenderGeneration: 0,
      shadowDescriptors: false,
      legendVisible: true,
      graphFullscreen: false,
      priorExamTab: null,
      viewer: null,
      frameId: `data-viewer-${instanceId}`,
      executing: false,
    };

    state.container = container;
    container.innerHTML = CliScanApp._shellHtml(state);
    CliScanApp._instances.set(instanceId, state);
    CliScanApp._wireTabs(container, state);
    CliScanApp._wireRail(container, state);
    CliScanApp._syncOutputTabs(container, state);
    CliScanApp.load(state, config).catch((err) => {
      console.error('CliScanApp.load failed', err);
      CliScanApp._setStatus(container, state, err.message);
    });
    return {
      instanceId,
      reload: (next) => CliScanApp.load(state, next),
      setHasRun: (next) => CliScanApp.setHasRun(state, next),
      setRunEnabled: (next) => CliScanApp.setRunEnabled(state, next),
      setExecuteContext: (ctx) => {
        state.executeContext = CliScanApp._normalizeExecuteContext(ctx);
        CliScanApp._syncRunButton(state.container, state);
      },
      runScanNow: () => CliScanApp.runScanNow(state),
      getArgvTokens: () => CliScanApp.buildArgvTokens(state),
      setOnOptionsChange: (fn) => {
        state.onOptionsChange = typeof fn === 'function' ? fn : null;
      },
      setOnScanComplete: (fn) => {
        state.onScanComplete = typeof fn === 'function' ? fn : null;
      },
      destroy: () => CliScanApp.destroy(state),
    };
  };

  CliScanApp._normalizeExecuteContext = function (ctx) {
    if (!ctx || typeof ctx !== 'object') return null;
    const workflowId = String(ctx.workflowId || ctx.workflow_id || '').trim();
    const stepId = String(ctx.stepId || ctx.step_id || '').trim();
    if (!workflowId || !stepId) return null;
    const projectId = String(ctx.projectId || ctx.project_id || '').trim();
    return {
      workflowId,
      stepId,
      projectId: projectId || null,
    };
  };

  CliScanApp.destroy = function (state) {
    if (state.graphInstance) {
      state.graphInstance.destroy();
      state.graphInstance = null;
    }
    if (state.viewer?.destroy) {
      state.viewer.destroy();
      state.viewer = null;
    }
    if (state._themeChangedListener) {
      window.removeEventListener('shell:theme-changed', state._themeChangedListener);
      state._themeChangedListener = null;
    }
    (state._tabListeners || []).forEach(({ tab, fn, type }) => {
      tab.removeEventListener(type || 'shown.bs.tab', fn);
    });
    state._tabListeners = [];
    state._destroyed = true;
    CliScanApp._instances.delete(state.instanceId);
  };

  CliScanApp.load = async function (state, config) {
    const container = state.container || document.querySelector(`[data-cli-scan-id="${state.instanceId}"]`);
    state.container = container;
    if (config.toolId) state.toolId = config.toolId;
    if (config.scenarioKey !== undefined) state.scenarioKey = config.scenarioKey;
    if (Object.prototype.hasOwnProperty.call(config, 'detail')) state.detail = config.detail || null;
    if (config.mode) state.mode = config.mode === 'edit-run' ? 'edit-run' : 'view';
    state.hasRun = CliScanApp._resolveHasRun(config, state.detail);
    state.runEnabled = CliScanApp._resolveRunEnabled(config, state.mode, state.hasRun);
    if (Object.prototype.hasOwnProperty.call(config, 'executeContext')) {
      state.executeContext = CliScanApp._normalizeExecuteContext(config.executeContext);
    }
    if (Object.prototype.hasOwnProperty.call(config, 'onOptionsChange')) {
      state.onOptionsChange = typeof config.onOptionsChange === 'function' ? config.onOptionsChange : null;
    }
    if (Object.prototype.hasOwnProperty.call(config, 'onScanComplete')) {
      state.onScanComplete = typeof config.onScanComplete === 'function' ? config.onScanComplete : null;
    }

    CliScanApp._setStatus(container, state, `Loading ${state.toolId}…`);

    try {
      const [schema, manifest] = await Promise.all([
        Connection.fetchJson(`${state.contentBase}/tools/${encodeURIComponent(state.toolId)}/options-schema`),
        Connection.fetchJson(`${state.contentBase}/tools/${encodeURIComponent(state.toolId)}`),
      ]);
      // `destroy()` runs synchronously (from Profiling.resetDetailChrome) the
      // instant a new scenario is opened, but this fetch may still be in
      // flight. Without this guard the stale continuation below still runs
      // after destroy, calling ensureViewer() -> DataViewerHost.create() for
      // an instanceId that already has a live binding — leaking a full set of
      // window listeners ('data-viewer:ready' et al.) per switch, which
      // compounds into a runaway postMessage/theme-changed storm.
      if (state._destroyed) return;
      state.schema = schema;
      state.manifest = manifest;
    } catch (err) {
      if (state._destroyed) return;
      console.warn('CliScanApp: content API unavailable, Scan tab limited', err);
      state.schema = { tool_id: state.toolId, groups: ['General'], flags: [] };
      state.manifest = { tool_id: state.toolId, executable: state.toolId };
    }
    const initial = CliScanApp._initialValues(state.schema, state.detail);
    state.values = initial.values;
    state.rows = initial.rows;

    CliScanApp._syncOutputTabs(container, state);
    CliScanApp._syncRunButton(container, state);
    CliScanApp._renderScanForm(container, state);
    CliScanApp._updateCommandPreview(container, state);

    if (state.detail && state.hasRun) {
      CliScanApp._renderOutputs(container, state);
    }

    const unsetHint =
      state.mode === 'edit-run' && !state.hasRun
        ? ' — unset step: options editable; output tabs locked; Scan Now disabled'
        : '';
    CliScanApp._setStatus(
      container,
      state,
      `Ready — ${state.toolId}${state.scenarioKey ? ` / ${state.scenarioKey}` : ''}${unsetHint}`
    );
  };

  /** R11-13 — unlock/lock Text|Structured|Graph|Report after a run exists. */
  CliScanApp.setHasRun = function (state, hasRun) {
    state.hasRun = Boolean(hasRun);
    const container = state.container;
    if (!container) return;
    CliScanApp._syncOutputTabs(container, state);
    if (!state.hasRun && state.mode === 'edit-run' && !state._runEnabledPinned) {
      state.runEnabled = false;
      CliScanApp._syncRunButton(container, state);
    }
  };

  /** Composer AU2 calls this when editor `validationResult.ok` changes (R11-15). */
  CliScanApp.setRunEnabled = function (state, runEnabled) {
    state.runEnabled = Boolean(runEnabled);
    state._runEnabledPinned = true;
    const container = state.container;
    if (!container) return;
    CliScanApp._syncRunButton(container, state);
  };

  /**
   * Map SPEC-010 scan-step / execute payload → CliScanApp detail (R11-16).
   * Prefers Widgets.SpiderfeetApi.scanStepToDetail when available.
   */
  CliScanApp.detailFromScanStep = function (payload) {
    const api = Widgets.SpiderfeetApi;
    if (api && typeof api.scanStepToDetail === 'function') {
      return api.scanStepToDetail(payload);
    }
    return null;
  };

  /**
   * Apply a completed run's four forms into the UI (unlock tabs + render).
   * @param {object} state
   * @param {object} detail
   * @param {{ keepArgv?: boolean }} [opts]
   */
  CliScanApp.applyRunDetail = async function (state, detail, opts) {
    const container = state.container;
    if (!container || !detail) return;
    const next = Object.assign({}, detail);
    if (opts?.keepArgv !== false) {
      const argv = CliScanApp.buildArgvTokens(state);
      if (argv.length && !Array.isArray(next.argv)) next.argv = argv;
      const preview = container.querySelector('[data-cli-scan-command]')?.textContent;
      if (preview && !next.command) next.command = preview;
    }
    state.detail = next;
    state.hasRun = true;
    CliScanApp._syncOutputTabs(container, state);
    CliScanApp._syncRunButton(container, state);
    await CliScanApp._renderOutputs(container, state);
  };

  /**
   * R11-16 / AV1 — Scan Now → SpiderfeetApi.executeStep → four forms (or stub/error message).
   * @returns {Promise<{ ok: boolean, kind: string, message: string, detail?: object|null, result?: object }>}
   */
  CliScanApp.runScanNow = async function (state) {
    const container = state.container;
    if (!container) {
      return { ok: false, kind: 'error', message: 'CliScanApp has no container.' };
    }
    if (state.executing) {
      return { ok: false, kind: 'busy', message: 'Scan already in progress.' };
    }
    if (state.mode !== 'edit-run') {
      const message = 'Scan Now is only available in edit-run mode.';
      CliScanApp._setStatus(container, state, message);
      return { ok: false, kind: 'error', message };
    }

    const ctx = state.executeContext;
    if (!ctx?.workflowId || !ctx?.stepId) {
      const message =
        'Cannot execute: missing workflow/step context. Open a project workflow and select a step.';
      CliScanApp._setStatus(container, state, message);
      CliScanApp._emitScanComplete(state, { ok: false, kind: 'error', message });
      return { ok: false, kind: 'error', message };
    }

    const api = Widgets.SpiderfeetApi;
    if (!api || typeof api.executeStep !== 'function') {
      const message = 'SpiderfeetApi.executeStep is not available.';
      CliScanApp._setStatus(container, state, message);
      CliScanApp._emitScanComplete(state, { ok: false, kind: 'error', message });
      return { ok: false, kind: 'error', message };
    }

    state.executing = true;
    CliScanApp._syncRunButton(container, state);
    CliScanApp._setStatus(
      container,
      state,
      `Executing ${ctx.stepId} via SpiderfeetApi…`
    );

    const body = {};
    if (ctx.projectId) body.project_id = ctx.projectId;
    body.step_id = ctx.stepId;

    let result;
    try {
      result = await api.executeStep(ctx.workflowId, ctx.stepId, body);
    } catch (err) {
      const message = (err && err.message) || String(err);
      state.executing = false;
      CliScanApp._syncRunButton(container, state);
      CliScanApp._setStatus(container, state, `Execute failed — ${message}`);
      const out = { ok: false, kind: 'error', message, result: null };
      CliScanApp._emitScanComplete(state, out);
      return out;
    }

    if (!result || result.ok === false) {
      const message =
        (result && result.message) ||
        `Execute failed (HTTP ${result?.status != null ? result.status : '?'})`;
      state.executing = false;
      CliScanApp._syncRunButton(container, state);
      CliScanApp._setStatus(container, state, message);
      const out = { ok: false, kind: 'error', message, result };
      CliScanApp._emitScanComplete(state, out);
      return out;
    }

    // AN2 stub until Epic AO — surface visibly; do not fake four forms.
    const status = String(result.status || '').toLowerCase();
    if (status === 'stub' || result.orchestrator === 'pending') {
      const message =
        result.message ||
        'Execute accepted as stub — orchestrator pending (SPEC-010 AO). Four forms unavailable until live execute lands.';
      state.executing = false;
      CliScanApp._syncRunButton(container, state);
      CliScanApp._setStatus(container, state, message);
      const out = { ok: true, kind: 'stub', message, result, detail: null };
      CliScanApp._emitScanComplete(state, out);
      return out;
    }

    let detail = CliScanApp.detailFromScanStep(result);
    const scanId =
      result.scan_instance_id ||
      result.scan_step_id ||
      detail?.scan_instance_id ||
      null;

    // Persistence proof: re-fetch scan_step four forms when an id is returned.
    if (scanId && typeof api.getScanStep === 'function') {
      CliScanApp._setStatus(container, state, `Re-fetching scan step ${scanId}…`);
      const refetched = await api.getScanStep(scanId);
      if (refetched && refetched.ok !== false) {
        const fromFetch = CliScanApp.detailFromScanStep(refetched);
        if (fromFetch) detail = Object.assign({}, detail || {}, fromFetch);
      } else if (!CliScanApp._detailHasRun(detail)) {
        const message =
          (refetched && refetched.message) ||
          `Execute returned ${scanId}, but re-fetch failed.`;
        state.executing = false;
        CliScanApp._syncRunButton(container, state);
        CliScanApp._setStatus(container, state, message);
        const out = { ok: false, kind: 'error', message, result: refetched, detail };
        CliScanApp._emitScanComplete(state, out);
        return out;
      }
    }

    if (!CliScanApp._detailHasRun(detail)) {
      const message =
        result.message ||
        'Execute completed but returned no Text/Structured/Graph/Report forms yet.';
      state.executing = false;
      CliScanApp._syncRunButton(container, state);
      CliScanApp._setStatus(container, state, message);
      const out = { ok: true, kind: 'empty', message, result, detail };
      CliScanApp._emitScanComplete(state, out);
      return out;
    }

    await CliScanApp.applyRunDetail(state, detail);
    state.executing = false;
    // Keep Scan Now available for re-run only if host left runEnabled true; still show progress done.
    CliScanApp._syncRunButton(container, state);
    const message = scanId
      ? `Scan complete — four forms loaded (persisted ${scanId}).`
      : 'Scan complete — four forms loaded.';
    CliScanApp._setStatus(container, state, message);
    const out = { ok: true, kind: 'complete', message, result, detail };
    CliScanApp._emitScanComplete(state, out);
    return out;
  };

  CliScanApp._emitScanComplete = function (state, outcome) {
    if (typeof state.onScanComplete !== 'function') return;
    try {
      state.onScanComplete(outcome);
    } catch (err) {
      console.warn('CliScanApp.onScanComplete failed', err);
    }
  };

  /**
   * Lock non-Scan tabs until a run exists (R11-13).
   * Scan tab stays active; option controls remain enabled separately via mode.
   */
  CliScanApp._syncOutputTabs = function (container, state) {
    if (!container) return;
    const tabs = container.querySelectorAll('.cli-scan-tabs [data-bs-toggle="tab"], .cli-scan-tabs .nav-link');
    const locked = !state.hasRun;
    let scanTab = null;
    tabs.forEach((tab) => {
      const target = tab.getAttribute('data-bs-target') || '';
      const isScan = target.endsWith('-pane-scan');
      if (isScan) {
        scanTab = tab;
        tab.classList.remove('disabled');
        tab.removeAttribute('aria-disabled');
        tab.removeAttribute('tabindex');
        tab.title = '';
        return;
      }
      if (locked) {
        tab.classList.add('disabled');
        tab.setAttribute('aria-disabled', 'true');
        tab.setAttribute('tabindex', '-1');
        tab.title = 'Locked until this step has a run';
      } else {
        tab.classList.remove('disabled');
        tab.removeAttribute('aria-disabled');
        tab.removeAttribute('tabindex');
        tab.title = '';
      }
    });
    container.classList.toggle('cli-scan-outputs-locked', locked);

    if (locked && scanTab) {
      const activeNonScan = container.querySelector(
        '.cli-scan-tabs .nav-link.active:not([data-bs-target$="-pane-scan"])'
      );
      if (activeNonScan || !scanTab.classList.contains('active')) {
        try {
          if (window.bootstrap?.Tab) {
            window.bootstrap.Tab.getOrCreateInstance(scanTab).show();
          } else {
            container.querySelectorAll('.cli-scan-tabs .nav-link').forEach((t) => {
              t.classList.toggle('active', t === scanTab);
              t.setAttribute('aria-selected', t === scanTab ? 'true' : 'false');
            });
            container.querySelectorAll('.cli-scan-tab-content > .tab-pane').forEach((pane) => {
              const show = pane.id === `${state.instanceId}-pane-scan`;
              pane.classList.toggle('show', show);
              pane.classList.toggle('active', show);
            });
          }
        } catch (err) {
          console.warn('CliScanApp._syncOutputTabs: could not activate Scan tab', err);
        }
      }
    }
  };

  CliScanApp._shellHtml = function (state) {
    const id = state.instanceId;
    return `
<div class="cli-scan-app d-flex flex-column flex-grow-1 min-h-0" data-cli-scan-id="${id}" data-viewer-fullscreen-root>
  <ul class="nav nav-tabs flex-shrink-0 cli-scan-tabs" role="tablist" aria-label="Scan output tabs">
    <li class="nav-item" role="presentation"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#${id}-pane-scan" type="button" role="tab" aria-controls="${id}-pane-scan" aria-selected="true">Scan</button></li>
    <li class="nav-item" role="presentation"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#${id}-pane-text" type="button" role="tab">Text</button></li>
    <li class="nav-item" role="presentation"><button class="nav-link" id="${id}-tab-structured" data-bs-toggle="tab" data-bs-target="#${id}-pane-structured" type="button" role="tab">Structured</button></li>
    <li class="nav-item" role="presentation"><button class="nav-link" id="${id}-tab-graph" data-bs-toggle="tab" data-bs-target="#${id}-pane-graph" type="button" role="tab">Graph</button></li>
    <li class="nav-item" role="presentation"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#${id}-pane-report" type="button" role="tab">Report</button></li>
  </ul>
  <div class="tab-content flex-grow-1 border border-top-0 rounded-bottom min-h-0 cli-scan-tab-content">
    <div class="tab-pane fade show active h-100 min-h-0" id="${id}-pane-scan" role="tabpanel">
      <div class="row g-0 h-100 min-h-0 cli-scan-scan-layout">
        <div class="col-12 col-lg-10 border-end cli-scan-form-col overflow-auto p-3" data-cli-scan-options-palette></div>
        <div class="col-12 col-lg-2 cli-scan-rail cli-scan-command-palette p-2 d-flex flex-column gap-2 min-h-0">
          <div class="d-grid gap-2 flex-shrink-0" data-cli-scan-rail-actions></div>
          <label class="small fw-semibold mt-2 flex-shrink-0">Command preview</label>
          <pre class="cli-scan-command-preview small bg-body-secondary bg-opacity-25 border rounded p-2 mb-0 flex-grow-1" data-cli-scan-command></pre>
          <button type="button" class="btn btn-success btn-sm mt-auto flex-shrink-0" data-cli-scan-run>Scan Now</button>
        </div>
      </div>
    </div>
    <div class="tab-pane fade cli-scan-pane-scroll" id="${id}-pane-text" role="tabpanel"><pre class="profiling-scroll-pre mb-0 p-3" data-cli-scan-text></pre></div>
    <div class="tab-pane fade cli-scan-pane-fill" id="${id}-pane-structured" role="tabpanel">
      <div class="data-viewer-host h-100" data-data-viewer-host="${id}">
        <iframe id="${state.frameId}" title="Structured data viewer" class="data-viewer-iframe" allow="fullscreen" src="${Widgets.DataViewer?.defaultSrc?.() || 'http://localhost:3000/widget'}"></iframe>
      </div>
    </div>
    <div class="tab-pane fade cli-scan-pane-fill position-relative" id="${id}-pane-graph" role="tabpanel">
      <div class="d-flex flex-column h-100 min-h-0 profiling-graph-wrap">
        <div class="d-flex align-items-center gap-2 px-2 py-1 border-bottom flex-shrink-0">
          <span class="small text-body-secondary" data-cli-scan-graph-stats></span>
          <div class="form-check form-switch small ms-auto mb-0">
            <input class="form-check-input" type="checkbox" role="switch" data-cli-scan-shadow />
            <label class="form-check-label">Shadow descriptors</label>
          </div>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-cli-scan-legend-toggle>Hide legend</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-cli-scan-graph-fullscreen>Full screen</button>
        </div>
        <div class="profiling-graph-stage flex-grow-1 position-relative min-h-0" data-cli-scan-graph-stage>
          <canvas id="${id}-graph-svg" class="profiling-graph-svg viz-layer w-100 h-100" role="img" aria-label="Proposed nugget graph" data-cli-scan-graph-svg></canvas>
          <div id="${id}-graph-tooltip" class="profiling-graph-tooltip viz-tooltip position-absolute border rounded bg-body px-2 py-1 small shadow-sm" hidden data-cli-scan-graph-tooltip></div>
          <div class="position-absolute bottom-0 end-0 m-2 p-2 border rounded bg-body small shadow-sm" data-cli-scan-graph-legend aria-label="Graph legend"></div>
        </div>
      </div>
    </div>
    <div class="tab-pane fade cli-scan-pane-scroll" id="${id}-pane-report" role="tabpanel"><div class="profiling-markdown-doc p-3" data-cli-scan-report></div></div>
  </div>
  <footer class="small text-body-secondary px-2 py-1 border-top" data-cli-scan-status aria-live="polite"></footer>
  <div class="modal fade" tabindex="-1" data-cli-scan-modal><div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title" data-cli-scan-modal-title>Document</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div><div class="modal-body profiling-markdown-doc" data-cli-scan-modal-body></div></div></div></div>
</div>`;
  };

  CliScanApp._setStatus = function (container, state, msg) {
    container?.querySelector('[data-cli-scan-status]')?.replaceChildren(document.createTextNode(msg || ''));
  };

  CliScanApp._wireTabs = function (container, state) {
    container.querySelector('[data-cli-scan-shadow]')?.addEventListener('change', (e) => {
      state.shadowDescriptors = e.target.checked;
      if (state.detail?.graph_proposal) CliScanApp.renderProposalGraph(container, state, state.detail.graph_proposal);
    });
    container.querySelector('[data-cli-scan-legend-toggle]')?.addEventListener('click', () => {
      state.legendVisible = !state.legendVisible;
      CliScanApp.renderLegend(container, state);
    });
    container.querySelector('[data-cli-scan-graph-fullscreen]')?.addEventListener('click', () => {
      state.graphFullscreen = !state.graphFullscreen;
      container.classList.toggle('profiling-graph-host-fullscreen', state.graphFullscreen);
    });
    state._tabListeners = [];
    container.querySelectorAll('.cli-scan-tabs [data-bs-toggle="tab"]').forEach((tab) => {
      const showFn = () => {
        if (tab.id === `${state.instanceId}-tab-graph` && state.detail?.graph_proposal) {
          setTimeout(() => CliScanApp.renderProposalGraph(container, state, state.detail.graph_proposal), 50);
        }
      };
      const guardFn = (event) => {
        const target = tab.getAttribute('data-bs-target') || '';
        const isScan = target.endsWith('-pane-scan');
        if (!state.hasRun && !isScan) {
          event.preventDefault();
          event.stopPropagation();
          CliScanApp._setStatus(
            container,
            state,
            'Output tabs are locked until this step has a run.'
          );
        }
      };
      tab.addEventListener('show.bs.tab', guardFn);
      tab.addEventListener('shown.bs.tab', showFn);
      state._tabListeners.push({ tab, fn: showFn }, { tab, fn: guardFn, type: 'show.bs.tab' });
    });
    // Stored on state (not an inline arrow) so CliScanApp.destroy can remove it —
    // otherwise every reopened scenario leaks another window listener, and
    // DataViewer's `data-viewer-theme-changed` echo (Theme.apply always fires
    // `shell:theme-changed`, even for fromViewer:true) turns N leaked listeners
    // into an ever-growing storm of redundant setData/postMessage round-trips.
    state._themeChangedListener = () => {
      if (state.detail?.structured?.content) CliScanApp.pushStructuredToViewer(container, state);
    };
    window.addEventListener('shell:theme-changed', state._themeChangedListener);
  };

  CliScanApp._wireRail = function (container, state) {
    const actions = container.querySelector('[data-cli-scan-rail-actions]');
    if (actions) {
      actions.innerHTML = `
      <button type="button" class="btn btn-outline-secondary btn-sm" data-cli-scan-modal-btn="options">Options</button>
      <button type="button" class="btn btn-outline-secondary btn-sm" data-cli-scan-modal-btn="graph-structure">Graph Structure</button>
      <button type="button" class="btn btn-outline-secondary btn-sm" data-cli-scan-modal-btn="zero-to-hero">User Guide</button>`;

      actions.querySelectorAll('[data-cli-scan-modal-btn]').forEach((btn) => {
        btn.addEventListener('click', () => CliScanApp._openModal(container, state, btn.dataset.cliScanModalBtn));
      });
    }
    CliScanApp._syncRunButton(container, state);
  };

  /** Keep Scan Now / Scan Complete in sync when hosts reload with a new mode. */
  CliScanApp._syncRunButton = function (container, state) {
    const runBtn = container.querySelector('[data-cli-scan-run]');
    if (!runBtn) return;
    if (runBtn._cliScanRunHandler) {
      runBtn.removeEventListener('click', runBtn._cliScanRunHandler);
      runBtn._cliScanRunHandler = null;
    }
    if (state.mode === 'view') {
      runBtn.classList.add('active');
      runBtn.setAttribute('aria-pressed', 'true');
      runBtn.disabled = true;
      runBtn.title = 'This scan was already executed — Scan tab is read-only.';
      runBtn.textContent = 'Scan Complete';
      return;
    }
    runBtn.classList.remove('active');
    runBtn.removeAttribute('aria-pressed');
    runBtn.textContent = state.executing ? 'Scanning…' : 'Scan Now';
    // R11-13 / R11-15: unset steps stay disabled until host sets runEnabled from validationResult.
    if (state.executing) {
      runBtn.disabled = true;
      runBtn.title = 'Scan in progress…';
      return;
    }
    if (!state.runEnabled) {
      runBtn.disabled = true;
      runBtn.title = state.hasRun
        ? 'Scan Now is disabled for this step.'
        : 'Scan Now disabled until the editor reports this step valid.';
      return;
    }
    runBtn.disabled = false;
    runBtn.title = state.executeContext
      ? 'Run this step via SpiderfeetApi execute (SPEC-010)'
      : 'Submit the command preview for execution';
    runBtn._cliScanRunHandler = () => {
      CliScanApp.runScanNow(state);
    };
    runBtn.addEventListener('click', runBtn._cliScanRunHandler);
  };

  CliScanApp._deriveShortName = function (source) {
    const desc = String(source || '').trim();
    if (!desc) return '';
    let name = desc.split(/\s[-–—]\s/, 1)[0];
    name = name.split(/[.;]\s+/, 1)[0];
    if (name.length > 48) name = name.slice(0, 45).trimEnd() + '…';
    return name;
  };

  // Expand a schema flag into one or more UI row descriptors. Handles:
  //   "-sS/sT/sA/sW/sM"        → 5 mutex rows (valueMode='none')
  //   "-oN/-oX/-oS/-oG <file>" → 4 mutex rows (valueMode='space')
  //   "-T<0-5>"                → 1 row (valueMode='attached')
  //   "--top-ports <number>"   → 1 row (valueMode='space')
  //   "--open" | "-A" | "-sn"  → 1 row (valueMode='none')
  //   flag === null            → 1 positional row (valueMode='space')
  CliScanApp._expandFlag = function (flag) {
    if (flag.flag == null) {
      return [{
        key: flag.id,
        flag,
        displayToken: `<${flag.id}>`,
        valueMode: 'space',
        isPositional: true,
        mutexGroup: flag.mutex_group || null,
        placeholder: flag.placeholder || null,
      }];
    }
    const raw = String(flag.flag).trim();
    const placeholderMatch = raw.match(/<([^>]+)>/);
    const placeholder = placeholderMatch ? placeholderMatch[1] : flag.placeholder || null;

    let valueMode;
    if (/[A-Za-z0-9]<[^>]+>$/.test(raw)) valueMode = 'attached';
    else if (/\s+<[^>]+>$/.test(raw)) valueMode = 'space';
    else if (['select', 'integer', 'float', 'path'].includes(flag.type)) valueMode = 'space';
    else valueMode = 'none';

    const head = raw.replace(/\s+<[^>]+>$/, '').replace(/<[^>]+>$/, '');
    const parts = head.split('/').filter(Boolean);
    if (parts.length <= 1) {
      return [{
        key: flag.id,
        flag,
        displayToken: head,
        valueMode,
        mutexGroup: flag.mutex_group || null,
        placeholder,
      }];
    }
    const firstPrefix = (parts[0].match(/^-{1,2}/) || ['-'])[0];
    const tokens = parts.map((p, i) => (i === 0 ? p : (p.startsWith('-') ? p : firstPrefix + p)));
    const mutexGroup = flag.mutex_group || `mx_${flag.id}`;
    return tokens.map((tok, i) => ({
      key: `${flag.id}__${i}`,
      flag,
      displayToken: tok,
      valueMode,
      mutexGroup,
      placeholder,
    }));
  };

  CliScanApp._buildRows = function (schema) {
    const rows = [];
    (schema?.flags || []).forEach((f) => {
      CliScanApp._expandFlag(f).forEach((r) => rows.push(r));
    });
    return rows;
  };

  CliScanApp._detectRowInCommand = function (row, cmdParts) {
    const tok = row.displayToken;
    if (!tok || row.isPositional) return null;
    for (let i = 0; i < cmdParts.length; i += 1) {
      const p = cmdParts[i];
      if (p === tok) {
        if (row.valueMode === 'none') return { enabled: true, value: '' };
        const next = cmdParts[i + 1];
        const looksLikeFlag = next != null && next !== '-' && next.startsWith('-') && next.length > 1;
        if (next == null || looksLikeFlag) return { enabled: true, value: '' };
        return { enabled: true, value: next };
      }
      if (row.valueMode === 'space' && p.startsWith(tok + '=')) {
        return { enabled: true, value: p.slice(tok.length + 1) };
      }
      if (row.valueMode === 'attached' && p.length > tok.length && p.startsWith(tok)) {
        return { enabled: true, value: p.slice(tok.length) };
      }
    }
    return null;
  };

  CliScanApp._chooseColCount = function (flagCount) {
    if (flagCount <= 3) return 1;
    if (flagCount <= 10) return 2;
    return 3;
  };

  CliScanApp._distributeFlags = function (flags, cols) {
    const perCol = Math.ceil(flags.length / cols) || 1;
    const buckets = Array.from({ length: cols }, () => []);
    flags.forEach((f, i) => {
      const idx = Math.min(cols - 1, Math.floor(i / perCol));
      buckets[idx].push(f);
    });
    return buckets;
  };

  CliScanApp._initialValues = function (schema, detail) {
    const values = {};
    const cmd = String(detail?.command || '').trim();
    const argvParts = Array.isArray(detail?.argv)
      ? detail.argv.map((t) => String(t))
      : null;
    const cmdParts = argvParts || (cmd ? cmd.split(/\s+/) : []);
    const rows = CliScanApp._buildRows(schema);
    rows.forEach((row) => {
      let detected = null;
      if (cmdParts.length) detected = CliScanApp._detectRowInCommand(row, cmdParts);
      if (row.isPositional) {
        let posVal = '';
        for (let i = 0; i < cmdParts.length; i += 1) {
          const p = cmdParts[i];
          if (i === 0 && !argvParts) continue;
          if (p.startsWith('-')) continue;
          if (p.startsWith('$')) continue;
          const prev = i > 0 ? cmdParts[i - 1] : '';
          if (prev && prev.startsWith('-') && prev !== '-') continue;
          posVal = p;
          break;
        }
        values[row.key] = {
          enabled: Boolean(posVal) || Boolean(row.flag.required),
          value: posVal,
        };
        return;
      }
      const defaultEnabled = Boolean(row.flag.default);
      values[row.key] = detected
        ? detected
        : {
          enabled: defaultEnabled,
          value: row.valueMode !== 'none' && typeof row.flag.default === 'string' ? row.flag.default : '',
        };
    });
    // Captured command is for view-mode preview only — not argv-seeded edit-run forms.
    if (cmd && !argvParts) values.__captured_command = cmd;
    return { values, rows };
  };

  /**
   * Build workflow `config.argv` tokens from the current option form (no executable).
   * @param {{ rows?: Array, values?: object }} state
   * @returns {string[]}
   */
  CliScanApp.buildArgvTokens = function (state) {
    const tokens = [];
    (state.rows || []).forEach((row) => {
      const v = state.values?.[row.key];
      if (!v) return;
      if (row.isPositional) {
        if (v.value) tokens.push(String(v.value));
        return;
      }
      if (!v.enabled) return;
      const tok = row.displayToken;
      if (row.valueMode === 'none') {
        tokens.push(tok);
        return;
      }
      if (row.valueMode === 'attached' && v.value !== '' && v.value != null) {
        tokens.push(`${tok}${v.value}`);
        return;
      }
      tokens.push(tok);
      if (v.value !== '' && v.value != null) tokens.push(String(v.value));
    });
    return tokens;
  };

  /** Notify host (Composer) of option edits — R11-14 / AU1. */
  CliScanApp._emitOptionsChange = function (state) {
    if (state.mode !== 'edit-run') return;
    if (typeof state.onOptionsChange !== 'function') return;
    try {
      state.onOptionsChange({
        toolId: state.toolId,
        argv: CliScanApp.buildArgvTokens(state),
        values: state.values,
        scenarioKey: state.scenarioKey,
      });
    } catch (err) {
      console.warn('CliScanApp.onOptionsChange failed', err);
    }
  };

  CliScanApp._renderScanForm = function (container, state) {
    const root = container.querySelector('[data-cli-scan-options-palette]');
    if (!root || !state.schema) return;
    const readOnly = state.mode === 'view';

    const rows = state.rows || [];
    const groupOrder = [];
    const byGroup = new Map();
    rows.forEach((row) => {
      const g = row.flag.group || 'General';
      if (!byGroup.has(g)) {
        byGroup.set(g, []);
        groupOrder.push(g);
      }
      byGroup.get(g).push(row);
    });

    const parts = [];
    if (readOnly && state.values.__captured_command) {
      parts.push(
        `<p class="small text-body-secondary mb-2">Captured examination command (read-only view mode). Boxes and values reflect flags detected in the captured command.</p>`
      );
    }

    const positionalRows = rows.filter((r) => r.isPositional);
    if (positionalRows.length) {
      const html = positionalRows.map((r) => CliScanApp._positionalRowHtml(r, state, readOnly)).join('');
      parts.push(
        `<section class="cli-opt-section cli-opt-section-positional mb-3"><h3 class="cli-opt-section-title h6 mb-2">Target</h3>${html}</section>`
      );
    }

    const sectionHtml = [];
    groupOrder.forEach((groupName) => {
      const groupRows = (byGroup.get(groupName) || []).filter((r) => !r.isPositional);
      if (!groupRows.length) return;
      const cols = CliScanApp._chooseColCount(groupRows.length);
      const buckets = CliScanApp._distributeFlags(groupRows, cols);
      const bucketHtml = buckets
        .map(
          (bucket) =>
            `<div class="cli-opt-col">${bucket
              .map((r) => CliScanApp._optionRowHtml(r, state, readOnly))
              .join('')}</div>`
        )
        .join('');
      sectionHtml.push(
        `<section class="cli-opt-section" data-cli-opt-section="${escHtml(groupName)}">
          <h3 class="cli-opt-section-title h6 mb-2">${escHtml(groupName)}</h3>
          <div class="cli-opt-section-cols cli-opt-section-cols-${cols}">${bucketHtml}</div>
        </section>`
      );
    });
    parts.push(`<div class="cli-opt-palette">${sectionHtml.join('')}</div>`);

    root.innerHTML = parts.join('');
    CliScanApp._wireOptionRows(container, state);
  };

  CliScanApp._optionRowHtml = function (row, state, readOnly) {
    const flag = row.flag;
    const rowId = `${state.instanceId}-f-${row.key.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    const token = row.displayToken;
    const takesValue = row.valueMode !== 'none';
    const current = state.values[row.key] || { enabled: false, value: '' };
    const dis = readOnly ? ' disabled' : '';
    const req = flag.required
      ? ' <span class="cli-opt-required text-danger" aria-hidden="true" title="required">*</span>'
      : '';
    const mutex = row.mutexGroup ? ` name="${escHtml(state.instanceId + '-mx-' + row.mutexGroup)}"` : '';
    const inputType = row.mutexGroup ? 'radio' : 'checkbox';
    const checked = current.enabled ? ' checked' : '';
    const tooltipText = escHtml(flag.description || '');
    const shortName = escHtml(CliScanApp._deriveShortName(flag.description));

    let valueControl = '';
    if (takesValue) {
      const hidden = current.enabled ? '' : ' d-none';
      const placeholder = escHtml(row.placeholder || 'value');
      if (flag.type === 'select' && Array.isArray(flag.choices)) {
        const opts = ['<option value="">—</option>']
          .concat(
            flag.choices.map(
              (c) => `<option value="${escHtml(c)}"${current.value === c ? ' selected' : ''}>${escHtml(c)}</option>`
            )
          )
          .join('');
        valueControl = `<select class="form-select form-select-sm cli-opt-value${hidden}" data-cli-opt-value data-cli-opt-row-key="${escHtml(row.key)}"${dis}>${opts}</select>`;
      } else if (flag.type === 'integer' || flag.type === 'float') {
        valueControl = `<input class="form-control form-control-sm cli-opt-value${hidden}" type="number" data-cli-opt-value data-cli-opt-row-key="${escHtml(row.key)}" value="${escHtml(current.value ?? '')}" placeholder="${placeholder}"${dis} />`;
      } else {
        valueControl = `<input class="form-control form-control-sm cli-opt-value${hidden}" type="text" data-cli-opt-value data-cli-opt-row-key="${escHtml(row.key)}" value="${escHtml(current.value ?? '')}" placeholder="${placeholder}"${dis} />`;
      }
    }

    const nameFragment = shortName ? ` <span class="cli-opt-name text-body-secondary"> — ${shortName}</span>` : '';
    return `
<div class="cli-opt d-flex align-items-baseline gap-1" data-cli-opt-row data-cli-opt-row-key="${escHtml(row.key)}">
  <input class="form-check-input cli-opt-check flex-shrink-0" type="${inputType}"${mutex} id="${rowId}" data-cli-opt-toggle data-cli-opt-row-key="${escHtml(row.key)}" data-cli-opt-takes-value="${takesValue ? '1' : '0'}" data-cli-opt-mutex="${escHtml(row.mutexGroup || '')}"${checked}${dis} title="${tooltipText}" aria-label="${escHtml(token)} — ${tooltipText}" />
  <label class="cli-opt-label mb-0 small flex-grow-1" for="${rowId}" title="${tooltipText}">
    <code class="cli-opt-flag">${escHtml(token)}</code>${nameFragment}${req}
  </label>
  ${valueControl}
</div>`;
  };

  CliScanApp._positionalRowHtml = function (row, state, readOnly) {
    const flag = row.flag;
    const rowId = `${state.instanceId}-f-${row.key.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    const current = state.values[row.key] || { enabled: true, value: '' };
    const dis = readOnly ? ' disabled' : '';
    const placeholder = escHtml(row.placeholder || flag.placeholder || 'target');
    const req = flag.required ? ' <span class="text-danger" aria-hidden="true">*</span>' : '';
    return `
<div class="cli-opt cli-opt-positional d-flex align-items-baseline gap-2 mb-1" data-cli-opt-row data-cli-opt-row-key="${escHtml(row.key)}" data-cli-opt-positional="1">
  <label class="cli-opt-label mb-0 small" for="${rowId}" title="${escHtml(flag.description || '')}">
    <code class="cli-opt-flag">&lt;${escHtml(flag.id)}&gt;</code>${req}
  </label>
  <input class="form-control form-control-sm flex-grow-1" type="text" id="${rowId}" data-cli-opt-value data-cli-opt-row-key="${escHtml(row.key)}" value="${escHtml(current.value ?? '')}" placeholder="${placeholder}"${dis} />
</div>`;
  };

  CliScanApp._wireOptionRows = function (container, state) {
    const root = container.querySelector('[data-cli-scan-options-palette]');
    if (!root) return;

    root.querySelectorAll('[data-cli-opt-toggle]').forEach((toggle) => {
      toggle.addEventListener('change', () => {
        const rowKey = toggle.dataset.cliOptRowKey;
        const takesValue = toggle.dataset.cliOptTakesValue === '1';
        const mutex = toggle.dataset.cliOptMutex;
        const enabled = toggle.checked;
        if (!state.values[rowKey]) state.values[rowKey] = { enabled: false, value: '' };
        state.values[rowKey].enabled = enabled;

        if (mutex && enabled) {
          const mutexSel = typeof CSS?.escape === 'function' ? CSS.escape(mutex) : mutex;
          root
            .querySelectorAll(`[data-cli-opt-toggle][data-cli-opt-mutex="${mutexSel}"]`)
            .forEach((sib) => {
              if (sib === toggle) return;
              const sibKey = sib.dataset.cliOptRowKey;
              if (state.values[sibKey]) state.values[sibKey].enabled = false;
              sib.checked = false;
              const sibRow = sib.closest('[data-cli-opt-row]');
              sibRow?.querySelector('[data-cli-opt-value]')?.classList.add('d-none');
            });
        }

        if (takesValue) {
          const rowEl = toggle.closest('[data-cli-opt-row]');
          const input = rowEl?.querySelector('[data-cli-opt-value]');
          if (input) {
            input.classList.toggle('d-none', !enabled);
            if (enabled) input.focus();
          }
        }
        CliScanApp._updateCommandPreview(container, state);
        CliScanApp._emitOptionsChange(state);
      });
    });

    root.querySelectorAll('[data-cli-opt-value]').forEach((input) => {
      const handler = () => {
        const rowKey = input.dataset.cliOptRowKey;
        if (!state.values[rowKey]) state.values[rowKey] = { enabled: false, value: '' };
        state.values[rowKey].value = input.value;
        const rowEl = input.closest('[data-cli-opt-row]');
        if (rowEl?.dataset.cliOptPositional === '1') {
          state.values[rowKey].enabled = input.value.trim().length > 0;
        }
        CliScanApp._updateCommandPreview(container, state);
        CliScanApp._emitOptionsChange(state);
      };
      input.addEventListener('input', handler);
      input.addEventListener('change', handler);
    });
  };

  CliScanApp._updateCommandPreview = function (container, state) {
    const pre = container.querySelector('[data-cli-scan-command]');
    if (!pre) return;
    if (state.mode === 'view' && state.values.__captured_command) {
      pre.textContent = state.values.__captured_command;
      return;
    }
    const exe = state.manifest?.executable || state.toolId;
    const tokens = [exe];
    (state.rows || []).forEach((row) => {
      const v = state.values[row.key];
      if (!v) return;
      if (row.isPositional) {
        if (v.value) tokens.push(String(v.value));
        return;
      }
      if (!v.enabled) return;
      const tok = row.displayToken;
      if (row.valueMode === 'none') {
        tokens.push(tok);
        return;
      }
      if (row.valueMode === 'attached' && v.value !== '' && v.value != null) {
        tokens.push(`${tok}${v.value}`);
        return;
      }
      tokens.push(tok);
      if (v.value !== '' && v.value != null) tokens.push(String(v.value));
    });
    pre.textContent = tokens.join(' ');
  };

  CliScanApp._openModal = async function (container, state, kind) {
    const paths = {
      options: `${state.contentBase}/tools/${encodeURIComponent(state.toolId)}/options`,
      'graph-structure': `${state.contentBase}/tools/${encodeURIComponent(state.toolId)}/graph-structure`,
      'zero-to-hero': `${state.contentBase}/tools/${encodeURIComponent(state.toolId)}/zero-to-hero`,
    };
    const titles = { options: 'CLI Options', 'graph-structure': 'Graph Structure', 'zero-to-hero': 'Zero to Hero Guide' };
    const doc = await Connection.fetchJson(paths[kind]);
    const modalEl = container.querySelector('[data-cli-scan-modal]');
    container.querySelector('[data-cli-scan-modal-title]').textContent = `${state.toolId} — ${titles[kind]}`;
    await CliScanApp.renderMarkdownDoc(container.querySelector('[data-cli-scan-modal-body]'), doc.markdown, 'No content.');
    window.bootstrap?.Modal.getOrCreateInstance(modalEl).show();
  };

  CliScanApp._renderOutputs = async function (container, state) {
    const d = state.detail;
    container.querySelector('[data-cli-scan-text]').textContent = d.output_text || '(empty text output)';
    await CliScanApp.renderMarkdownDoc(
      container.querySelector('[data-cli-scan-report]'),
      d.graph_description_markdown || d.markdown,
      'No scenario graph description markdown for this scenario yet.'
    );
    CliScanApp.pushStructuredToViewer(container, state);
    CliScanApp.renderProposalGraph(container, state, d.graph_proposal);
  };

  CliScanApp.renderMarkdownDoc = async function (el, markdown, emptyMessage) {
    if (!el) return;
    const renderer = Widgets.Markdown;
    if (markdown && renderer?.renderDocument) {
      await renderer.renderDocument(el, markdown, emptyMessage);
      return;
    }
    if (markdown && renderer) el.innerHTML = renderer.render(markdown);
    else el.innerHTML = `<p class="text-body-secondary">${emptyMessage}</p>`;
  };

  CliScanApp.ensureViewer = function (container, state) {
    if (state.viewer) {
      state.viewer.ensure();
      return state.viewer;
    }
    state.viewer = DataViewerHost.create({
      instanceId: state.frameId,
      iframe: `#${state.frameId}`,
      tabButton: `#${state.instanceId}-tab-structured`,
      importExportRoot: state.corpusBase,
      fullscreenRoot: `[data-cli-scan-id="${state.instanceId}"]`,
      structuredTabButton: `#${state.instanceId}-tab-structured`,
      tabListSelector: `.cli-scan-tabs`,
      onReady: () => CliScanApp.pushStructuredToViewer(container, state),
    });
    return state.viewer;
  };

  CliScanApp.pushStructuredToViewer = function (container, state) {
    const viewer = CliScanApp.ensureViewer(container, state);
    const structured = state.detail?.structured;
    if (!structured?.content) {
      viewer.clear();
      return;
    }
    viewer.setPayload({ content: structured.content, filename: structured.filename, format: structured.format });
  };

  CliScanApp.colourForNode = function (node) {
    const t = String(node.nugget_type || 'ENTITY').toUpperCase();
    return CliScanApp.NUGGET_TYPE_COLOUR[t] || CliScanApp.NUGGET_TYPE_COLOUR.ENTITY;
  };

  CliScanApp.transformProposalGraph = function (proposal) {
    if (!proposal?.nodes?.length) return { nodes: [], links: [] };
    const nodes = proposal.nodes.map((n) => {
      const nuggetId = n.nugget_id || n.id;
      return {
        id: n.id,
        group: 'nugget',
        label: nuggetId,
        shortLabel: nuggetId,
        r: 10,
        iconSize: 28,
        colour: CliScanApp.colourForNode(n),
        iconUrl: `${CliScanApp.ICON_BASE}icon_${String(nuggetId).toLowerCase()}.svg`,
        isShadow: Boolean(n.is_shadow),
        meta: { nugget_type: n.nugget_type, data: n.data || n.nugget_data, kind: 'nugget' },
      };
    });
    const links = (proposal.edges || []).map((e, idx) => ({
      id: `edge-${idx}`,
      source: e.source,
      target: e.target,
      role: e.relation || e.name || 'contains',
    }));
    return { nodes, links };
  };

  CliScanApp.applyShadowOptions = function (proposal, shadowDescriptors) {
    let graph = proposal || { nodes: [], edges: [] };
    const shadows = Widgets.GraphShadows;
    if (shadowDescriptors && shadows) {
      graph = shadows.apply(graph, {
        mode: 'descriptors',
        edgeRoles: ['had', 'has_this'],
        shouldShadowTarget: (node) => String(node.nugget_type || '').toUpperCase() === 'DESCRIPTOR',
      });
    }
    return graph;
  };

  CliScanApp.renderLegend = function (container, state) {
    const root = container.querySelector('[data-cli-scan-graph-legend]');
    const btn = container.querySelector('[data-cli-scan-legend-toggle]');
    if (!root) return;
    root.classList.toggle('profiling-graph-legend-hidden', !state.legendVisible);
    if (btn) btn.textContent = state.legendVisible ? 'Hide legend' : 'Show legend';
    const rows = ['<div class="legend-section-label">Nugget types</div>'];
    CliScanApp.NUGGET_TYPE_LEGEND.forEach((entry) => {
      rows.push(`<div class="d-flex align-items-center gap-2 mb-1"><span class="legend-swatch legend-swatch-rounded" style="background-color:${entry.colour}"></span><span>${entry.label}</span></div>`);
    });
    rows.push('<div class="legend-section-label mt-2">Relations</div>');
    CliScanApp.LINK_LEGEND.forEach((entry) => {
      rows.push(`<div class="d-flex align-items-center gap-2 mb-1"><span class="${entry.className}"></span><span>${entry.label}</span></div>`);
    });
    root.innerHTML = rows.join('');
  };

  CliScanApp.renderProposalGraph = function (container, state, proposal) {
    const generation = ++state.graphRenderGeneration;
    if (state.graphInstance) {
      state.graphInstance.destroy();
      state.graphInstance = null;
    }
    const svgEl = container.querySelector('[data-cli-scan-graph-svg]');
    const stats = container.querySelector('[data-cli-scan-graph-stats]');
    if (!svgEl || !window.Viz?.CanvasGraph) return;

    const displayProposal = CliScanApp.applyShadowOptions(proposal, state.shadowDescriptors);
    const { nodes, links } = CliScanApp.transformProposalGraph(displayProposal);
    if (!nodes.length) {
      const ctx = svgEl.getContext?.('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, svgEl.width || 0, svgEl.height || 0);
      }
      if (stats) stats.textContent = 'No proposed graph';
      CliScanApp.renderLegend(container, state);
      return;
    }

    const stage = container.querySelector('[data-cli-scan-graph-stage]');
    const svgSelector = `#${state.instanceId}-graph-svg`;
    const tooltipSelector = `#${state.instanceId}-graph-tooltip`;
    const tryRender = (attempts) => {
      const rect = stage?.getBoundingClientRect() || { width: 0, height: 0 };
      if ((rect.width <= 20 || rect.height <= 20) && attempts < 60) {
        requestAnimationFrame(() => tryRender(attempts + 1));
        return;
      }
      if (generation !== state.graphRenderGeneration) return;
      try {
        state.graphInstance = window.Viz.CanvasGraph.create({
          canvas: svgSelector,
          tooltip: tooltipSelector,
          nodes,
          links,
          variant: 'default',
          nodeDisplay: 'icons',
          linkLabels: true,
          linkDistance: 80,
        });
        if (stats) stats.textContent = `${nodes.length} nodes · ${links.length} links`;
        CliScanApp.renderLegend(container, state);
      } catch (err) {
        console.error(err);
        if (stats) stats.textContent = `Graph error: ${err.message}`;
      }
    };
    tryRender(0);
  };
})(
  window.jQuery,
  window.Widgets.CliScanApp,
  window.Widgets,
  window.Widgets.Connection,
  window.Widgets.DataViewerHost,
  document,
  window
);
