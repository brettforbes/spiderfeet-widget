window.Widgets = window.Widgets || {};
window.Widgets.Tests = window.Widgets.Tests || {};

(function ($, Tests, Widgets, Connection, document, window) {
  'use strict';

  Tests.selectorPanel = '[data-widget="tests-panel"]';
  Tests._modulesLoaded = false;
  Tests._moduleList = [];
  Tests._planItems = [];
  Tests._runAllActive = false;
  Tests._runAllCancel = false;
  Tests._runningRoute = null;
  Tests._progress = { global: { done: 0, total: 0 }, modules: {} };
  Tests._runStats = { passed: 0, failed: 0, skipped: 0, keySkipped: 0, pendingSeedSkipped: 0 };

  Tests.getTimeoutSeconds = function () {
    const el = document.getElementById('tests-timeout');
    const value = parseInt(el?.value ?? '120', 10);
    return Number.isFinite(value) ? value : 120;
  };

  Tests.fetchTimeoutMs = function () {
    return Tests.getTimeoutSeconds() * 1000 + 10000;
  };

  Tests.initProgressState = function (modules) {
    const totals = {};
    let globalTotal = 0;
    (modules || []).forEach((mod) => {
      const total = mod.test_count || 0;
      totals[mod.module_id] = { done: 0, total };
      globalTotal += total;
    });
    Tests._progress = {
      global: { done: 0, total: globalTotal },
      modules: totals,
    };
  };

  Tests.setProgressBar = function (barEl, done, total, animate) {
    if (!barEl) return;
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    barEl.style.width = `${pct}%`;
    barEl.setAttribute('aria-valuenow', String(pct));
    barEl.classList.toggle('progress-bar-animated', Boolean(animate));
    barEl.classList.toggle('progress-bar-striped', Boolean(animate));
  };

  Tests.updateGlobalProgressUI = function (animate) {
    const wrap = document.getElementById('tests-global-progress-wrap');
    const bar = document.getElementById('tests-global-progress-bar');
    const count = document.getElementById('tests-global-progress-count');
    const { done, total } = Tests._progress.global;
    if (wrap) wrap.classList.toggle('d-none', total === 0 && !Tests._runAllActive);
    if (count) count.textContent = `${done} / ${total}`;
    Tests.setProgressBar(bar, done, total, animate);
  };

  Tests.updateModuleProgressUI = function (moduleId, animate) {
    const state = Tests._progress.modules[moduleId] || { done: 0, total: 0 };
    const sidebar = document.querySelector(`[data-sidebar-progress="${moduleId}"]`);
    if (sidebar) {
      const bar = sidebar.querySelector('[data-sidebar-progress-bar]');
      const label = sidebar.querySelector('[data-sidebar-progress-count]');
      if (label) label.textContent = `${state.done} / ${state.total}`;
      Tests.setProgressBar(bar, state.done, state.total, animate && Tests._runAllActive);
    }
    const accordionBar = document.querySelector(
      `[data-module-toolbar="${moduleId}"] [data-module-progress-bar]`
    );
    const accordionLabel = document.querySelector(
      `[data-module-toolbar="${moduleId}"] [data-module-progress-label]`
    );
    if (accordionLabel) {
      accordionLabel.textContent =
        state.total > 0 ? `${state.done} / ${state.total} tests` : '';
    }
    Tests.setProgressBar(accordionBar, state.done, state.total, animate);
  };

  Tests.renderSidebarProgressList = function (modules) {
    const root = document.getElementById('tests-module-progress-list');
    if (!root) return;
    root.innerHTML = (modules || [])
      .map(
        (mod) => `
      <div class="tests-sidebar-module-progress mb-2" data-sidebar-progress="${mod.module_id}">
        <div class="d-flex justify-content-between small text-body-secondary mb-1">
          <span class="text-truncate me-2" title="${Tests.escapeHtml(mod.name || mod.module_id)}">${mod.module_id}</span>
          <span data-sidebar-progress-count>0 / ${mod.test_count ?? 0}</span>
        </div>
        <div class="progress tests-progress-module" role="progressbar" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-bar" data-sidebar-progress-bar style="width:0%"></div>
        </div>
      </div>`
      )
      .join('');
  };

  Tests.moduleToolbarHtml = function (moduleId) {
    return `
      <div class="tests-module-toolbar px-3 pt-3 pb-2 border-bottom" data-module-toolbar="${moduleId}">
        <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
          <button type="button" class="btn btn-sm btn-outline-primary"
            data-action="run-module-all" data-module-id="${moduleId}">
            Run all tests
          </button>
          <span class="small text-body-secondary" data-module-progress-label></span>
        </div>
        <div class="progress tests-progress-accordion" role="progressbar" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-bar" data-module-progress-bar style="width:0%"></div>
        </div>
      </div>`;
  };

  Tests.setStatus = function (message) {
    const el = document.getElementById('tests-status-text');
    if (el) el.textContent = message;
  };

  Tests.stateBadgeClass = function (state) {
    const map = {
      'not-started': 'text-bg-secondary',
      'in-test': 'text-bg-primary',
      favourite: 'text-bg-success',
      unique: 'text-bg-info',
      error: 'text-bg-danger',
      dominated: 'text-bg-warning',
    };
    return map[state] || 'text-bg-secondary';
  };

  Tests.formatDuration = function (seconds) {
    if (seconds == null || Number.isNaN(seconds)) return '—';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  };

  Tests.setSummaryField = function (root, name, value, fallbackName) {
    const el =
      root.querySelector(`[data-count="${name}"]`) ||
      (fallbackName ? root.querySelector(`[data-count="${fallbackName}"]`) : null);
    if (el) {
      el.textContent = value;
    }
  };

  Tests.renderSummary = function (summary) {
    const root = document.getElementById('tests-summary');
    if (!root || !summary) return;
    const states = summary.test_states || summary.route_states || {};
    Tests.setSummaryField(root, 'modules', summary.module_count);
    Tests.setSummaryField(root, 'tests', summary.test_count ?? '—', 'routes');
    Tests.setSummaryField(root, 'groups', summary.consumption_group_count);
    Tests.setSummaryField(root, 'not-started', states.not_started ?? '—');
    Tests.setSummaryField(root, 'in-test', states.in_test ?? '—');
    Tests.setSummaryField(
      root,
      'tested',
      (states.favourite ?? 0) + (states.unique ?? 0) + (states.error ?? 0)
    );
    Tests.setSummaryField(root, 'passed', Tests._runStats.passed);
    Tests.setSummaryField(root, 'failed', Tests._runStats.failed);
    Tests.setSummaryField(root, 'skipped', Tests._runStats.skipped);
    Tests.setSummaryField(root, 'needs-key', summary.missing_api_key_count ?? '—');
    Tests.setSummaryField(root, 'seed-validated', summary.seed_validated_count ?? '—');
    Tests.setSummaryField(root, 'pending-seed', summary.pending_seed_count ?? '—');
    Tests.setSummaryField(root, 'runnable', summary.runnable_count ?? '—');
  };

  Tests.resetRunStats = function () {
    Tests._runStats = { passed: 0, failed: 0, skipped: 0, keySkipped: 0, pendingSeedSkipped: 0 };
    Tests.renderSummary({ test_states: {}, route_states: {} });
  };

  Tests.updateRunStatsUI = function () {
    const root = document.getElementById('tests-summary');
    if (!root) return;
    Tests.setSummaryField(root, 'passed', Tests._runStats.passed);
    Tests.setSummaryField(root, 'failed', Tests._runStats.failed);
    Tests.setSummaryField(root, 'skipped', Tests._runStats.skipped);
  };

  Tests.moduleSubscriptionMeta = function (mod) {
    const metaItems = Tests._planItems.filter((row) => row.module_id === mod.module_id);
    const row = metaItems[0];
    const tier = row?.subscription_tier || mod.subscription_tier || 'none';
    const requiresKey = row ? Boolean(row.requires_api_key) : Boolean(mod.requires_api_key);
    const hasKey = row ? row.has_api_key !== false : mod.has_api_key !== false;
    return { tier, requiresKey, hasKey, missingKey: requiresKey && !hasKey };
  };

  Tests.isModuleVisible = function (mod) {
    const meta = Tests.moduleSubscriptionMeta(mod);
    return !meta.requiresKey || meta.hasKey;
  };

  Tests.moduleSeedValidated = function (mod) {
    const rows = Tests._planItems.filter((row) => row.module_id === mod.module_id);
    return rows.some((row) => Boolean(row.seed_validated));
  };

  Tests.visibleModules = function (modules) {
    return (modules || []).filter((mod) => Tests.isModuleVisible(mod));
  };

  Tests.subscriptionTierBadgeHtml = function (tier, missingKey) {
    if (tier === 'none') {
      return '<span class="badge text-bg-success me-2" title="No API key required">open</span>';
    }
    if (tier === 'paid_auth') {
      const cls = missingKey ? 'text-bg-warning' : 'text-bg-info';
      return `<span class="badge ${cls} me-2" title="Paid subscription">paid</span>`;
    }
    if (tier === 'free_auth') {
      const cls = missingKey ? 'text-bg-warning' : 'text-bg-secondary';
      return `<span class="badge ${cls} me-2" title="Free signup / API key">free</span>`;
    }
    return '';
  };

  Tests.renderModuleAccordion = function (modules) {
    const root = document.getElementById('tests-module-accordion');
    if (!root) return;
    root.innerHTML = '';

    const visible = Tests.visibleModules(modules);
    visible.forEach((mod) => {
      const { tier, missingKey } = Tests.moduleSubscriptionMeta(mod);
      const itemId = `tests-mod-${mod.module_id.replace(/[^a-z0-9_-]/gi, '-')}`;
      const item = document.createElement('div');
      item.className = 'accordion-item';
      item.innerHTML = `
        <h2 class="accordion-header" id="${itemId}-head">
          <button class="accordion-button collapsed" type="button"
            data-bs-toggle="collapse" data-bs-target="#${itemId}-body"
            aria-expanded="false" aria-controls="${itemId}-body"
            data-module-id="${mod.module_id}">
            ${Tests.fixtureCategoryIconHtml(mod.fixture_category || 'positive')}
            <span class="me-2 fw-semibold">${mod.module_id}</span>
            <span class="text-body-secondary small me-2">${mod.name}</span>
            ${Tests.subscriptionTierBadgeHtml(tier, missingKey)}
            ${
              Tests.moduleSeedValidated(mod)
                ? ''
                : '<span class="badge text-bg-warning me-2" title="Seed not validated — excluded from Run validated tests">pending seed</span>'
            }
            <span class="badge text-bg-light border ms-auto me-2">${mod.test_count ?? '—'} tests</span>
            ${
              (mod.tests_run ?? mod.routes_tested)
                ? `<span class="badge text-bg-success">${mod.tests_run ?? mod.routes_tested} run</span>`
                : ''
            }
          </button>
        </h2>
        <div id="${itemId}-body" class="accordion-collapse collapse"
          aria-labelledby="${itemId}-head" data-bs-parent="#tests-module-accordion">
          <div class="accordion-body p-0" data-module-body="${mod.module_id}">
            ${Tests.moduleToolbarHtml(mod.module_id)}
            <div data-module-content="${mod.module_id}">
              <div class="p-3 text-body-secondary small">Expand to load tests…</div>
            </div>
          </div>
        </div>`;
      root.appendChild(item);

      item.querySelector('[data-action="run-module-all"]')?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        Tests.runModuleAll(mod.module_id);
      });

      item.querySelector('.accordion-collapse').addEventListener('show.bs.collapse', () => {
        Tests.loadModuleTests(mod.module_id);
      });
    });

    Tests.initProgressState(visible);
    Tests.renderSidebarProgressList(visible);
    Tests.updateGlobalProgressUI(false);
    visible.forEach((mod) => Tests.updateModuleProgressUI(mod.module_id, false));

    Tests.scheduleScrollSync();
  };

  Tests.testRowId = function (moduleId, consumedId) {
    return `${moduleId}::${consumedId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  };

  Tests.isStrictPass = function (status, producedCount, fixtureKind, moduleExecution) {
    if (status !== 'FINISHED') return false;
    if (fixtureKind === 'negative') {
      if (moduleExecution?.verdict) {
        return moduleExecution.verdict === 'clean_miss';
      }
      return producedCount === 0;
    }
    return producedCount > 0;
  };

  Tests.fixtureCategoryIconHtml = function (fixtureCategory) {
    if (fixtureCategory === 'negative') {
      return '<i class="fa-solid fa-filter-circle-xmark text-secondary me-2" title="Negative fixture — clean input expects clean_miss"></i>';
    }
    return '<i class="fa-solid fa-bullseye text-success me-2" title="Positive fixture — expects discovered objects"></i>';
  };

  Tests.fixtureKindLabel = function (fixtureKind) {
    if (fixtureKind === 'negative') {
      return '<span class="badge text-bg-secondary ms-1" title="Expect FINISHED + clean_miss on clean input">negative</span>';
    }
    return '';
  };

  Tests.renderTestsTable = function (container, detail) {
    const connected = Connection.isConnected();
    const rows = (detail.tests || [])
      .map((test) => {
        const rowId = Tests.testRowId(detail.module_id, test.consumed_nugget_id);
        const inputValue = test.input_value || '';
        const hasInput = Boolean(inputValue);
        const runTitle = hasInput
          ? `Run with input ${inputValue}`
          : 'No default input — enter value when prompted';
        const fixtureKind = test.fixture_kind || 'positive';
        return `
      <tr data-test-row="${rowId}">
        <td class="small font-monospace">${test.consumed_nugget_id}${Tests.fixtureKindLabel(fixtureKind)}</td>
        <td class="small font-monospace">${hasInput ? Tests.escapeHtml(inputValue) : '<span class="text-body-secondary">—</span>'}</td>
        <td>
          <span class="badge ${Tests.stateBadgeClass(test.test_state)}" data-test-state>${test.test_state}</span>
        </td>
        <td class="text-end">
          <button type="button" class="btn btn-sm btn-outline-primary"
            data-action="run-test"
            data-module-id="${detail.module_id}"
            data-consumed="${test.consumed_nugget_id}"
            data-input="${Tests.escapeHtml(inputValue)}"
            data-fixture-kind="${Tests.escapeHtml(fixtureKind)}"
            title="${runTitle}"
            ${connected ? '' : 'disabled'}>
            Run
          </button>
        </td>
      </tr>
      <tr class="d-none" data-test-result="${rowId}">
        <td colspan="4" class="small bg-body-tertiary border-top-0 pt-0 pb-2 px-3"></td>
      </tr>`;
      })
      .join('');

    container.innerHTML = `
      <p class="small text-body-secondary px-3 pt-3 mb-2">${detail.summary}</p>
      <div class="table-responsive">
        <table class="table table-sm table-striped mb-0">
          <thead class="table-light">
            <tr>
              <th>Consumed</th>
              <th>Input value</th>
              <th>State</th>
              <th class="text-end">Action</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    container.querySelectorAll('[data-action="run-test"]').forEach((btn) => {
      btn.addEventListener('click', () => Tests.runTest(btn));
    });
  };

  Tests.resolveTarget = function (consumedId, sampleFromRoute, options) {
    const opts = options || {};
    if (sampleFromRoute) return sampleFromRoute;
    const fallback = Tests._nuggetSamples?.[consumedId];
    if (fallback) return fallback;
    if (opts.skipPrompt) return null;
    const manual = window.prompt(
      `Enter a SpiderFeet target value for consumed nugget ${consumedId}:`
    );
    return manual ? manual.trim() : null;
  };

  Tests.renderScanResultHtml = function (body, options) {
    const opts = options || {};
    const fixtureKind = opts.fixtureKind || 'positive';
    const record = body.scan_record || {};
    const produced = body.produced || [];
    const moduleExecution = body.module_execution || null;
    const producedTypes = [...new Set(produced.map((n) => n.nugget_id))];
    const status = record.status || record.scan_status || 'UNKNOWN';
    const duration = Tests.formatDuration(record.scan_duration);
    const eventCount = record.scan_event_count ?? record.scan_results?.event_count ?? 0;
    const passed = Tests.isStrictPass(status, produced.length, fixtureKind, moduleExecution);
    const verdict = moduleExecution?.verdict || null;
    const discovered =
      producedTypes.length > 0
        ? `Discovered: ${producedTypes.join(', ')}`
        : fixtureKind === 'negative' && passed
          ? 'Verdict: clean_miss (negative fixture)'
          : verdict
            ? `Verdict: ${verdict}`
            : 'No produced nuggets yet';
    let reason = '';
    if (status !== 'FINISHED') {
      reason = `status-${String(status).toLowerCase()}`;
    } else if (!passed && fixtureKind !== 'negative' && produced.length === 0) {
      reason = 'no-produced-objects';
    } else if (!passed && fixtureKind === 'negative' && verdict === 'absent_violation') {
      reason = 'absent-violation';
    } else if (!passed && fixtureKind === 'negative' && verdict && verdict !== 'clean_miss') {
      reason = `verdict-${verdict}`;
    } else if (!passed && fixtureKind === 'negative' && produced.length > 0) {
      reason = 'unexpected-produced-objects';
    }
    const noOutputReasonLabel =
      reason === 'no-produced-objects'
        ? 'No output objects returned'
        : reason === 'unexpected-produced-objects'
          ? 'Negative fixture expected clean_miss'
          : reason === 'absent-violation'
            ? `Absent types violated: ${(moduleExecution?.absent_violations || []).join(', ')}`
            : reason.startsWith('verdict-')
              ? `Module verdict ${verdict}`
              : reason.startsWith('status-')
                ? `Scan status ${status}`
                : '';
    const tone = passed ? 'success-subtle' : 'danger-subtle';

    return {
      status,
      producedCount: produced.length,
      discoveredLabel: discovered,
      reason,
      passed,
      html: `<div class="d-flex flex-wrap gap-2 align-items-center mb-1">
          <span class="badge text-bg-${passed ? 'success' : 'danger'}">${status}</span>
          ${
            verdict
              ? `<span class="badge text-bg-${verdict === 'clean_miss' ? 'secondary' : 'info'}">${Tests.escapeHtml(verdict)}</span>`
              : ''
          }
          <span class="text-body-secondary">${duration} · ${eventCount} events · ${produced.length} produced</span>
          <span class="badge text-bg-info">${Tests.escapeHtml(discovered)}</span>
          ${
            noOutputReasonLabel
              ? `<span class="badge text-bg-danger">${Tests.escapeHtml(noOutputReasonLabel)}</span>`
              : ''
          }
        </div>
        <details class="mb-0">
          <summary class="text-primary" style="cursor:pointer">Scan record</summary>
          <pre class="small mb-0 mt-1 p-2 bg-body border rounded" style="max-height:12rem;overflow:auto">${Tests.escapeHtml(JSON.stringify(body, null, 2))}</pre>
        </details>`,
      tone,
    };
  };

  Tests.executeTest = async function ({ moduleId, consumedId, inputValue, fixtureKind }) {
    const rowId = Tests.testRowId(moduleId, consumedId);

    const nuggetData = Tests.resolveTarget(consumedId, inputValue || '', { skipPrompt: true });
    if (!nuggetData) {
      return { ok: false, skipped: true, rowId, reason: 'no input value' };
    }

    Tests._runningRoute = rowId;
    const resultRow = document.querySelector(`[data-test-result="${rowId}"]`);
    resultRow?.classList.add('d-none');

    const runButton = document.querySelector(
      `[data-test-row="${rowId}"] [data-action="run-test"]`
    );
    const originalLabel = runButton?.textContent;
    if (runButton) {
      runButton.disabled = true;
      runButton.textContent = 'Running…';
    }

    try {
      // scan_ui (/api/v1/scan_ui) returns produced nuggets + scan record when wait=true.
      // Do not use POST /scans — that only starts a scan and does not return results.
      const body = await Connection.fetchJson('/scan_ui', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module_id: moduleId,
          consumed: {
            nugget_id: consumedId,
            nugget_data: nuggetData,
          },
          wait: true,
          timeout_seconds: Tests.getTimeoutSeconds(),
        }),
        timeoutMs: Tests.fetchTimeoutMs(),
      });

      const parsed = Tests.renderScanResultHtml(body, {
        fixtureKind: fixtureKind || 'positive',
      });
      if (parsed.passed) {
        Tests.updateTestStateBadge(rowId, 'in-test');
      } else {
        Tests.updateTestStateBadge(rowId, 'error');
      }
      Tests.showTestResult(rowId, parsed.html, parsed.tone);

      return {
        ok: parsed.passed,
        rowId,
        status: parsed.status,
        producedCount: parsed.producedCount,
        discoveredLabel: parsed.discoveredLabel,
        reason: parsed.reason,
      };
    } catch (err) {
      Tests.showTestResult(
        rowId,
        `<span class="text-danger">Run failed: ${Tests.escapeHtml(err.message)}</span>`,
        'danger-subtle'
      );
      return { ok: false, rowId, error: err.message };
    } finally {
      Tests._runningRoute = null;
      if (runButton) {
        runButton.disabled = !Connection.isConnected() || Tests._runAllActive;
        runButton.textContent = originalLabel || 'Run';
      }
    }
  };

  Tests.runTest = async function (button) {
    if (Tests._runningRoute || Tests._runAllActive) return;

    const moduleId = button.dataset.moduleId;
    const consumedId = button.dataset.consumed;
    const inputValue = button.dataset.input || '';
    const fixtureKind = button.dataset.fixtureKind || 'positive';

    const nuggetData = Tests.resolveTarget(consumedId, inputValue);
    if (!nuggetData) return;

    Tests.setStatus(`Running ${moduleId} · ${consumedId} with ${nuggetData}…`);

    const outcome = await Tests.executeTest({
      moduleId,
      consumedId,
      inputValue: nuggetData,
      fixtureKind,
    });

    if (outcome.skipped) return;
    if (outcome.ok) {
      Tests.setStatus(
        `${moduleId} · ${consumedId}: ${outcome.status} — ${outcome.discoveredLabel}`
      );
    } else {
      const reason = outcome.error || outcome.reason || outcome.status;
      Tests.setStatus(`Run failed: ${reason}`);
    }
  };

  Tests.setBatchControls = function (running, options) {
    const showGlobal = Boolean((options || {}).showGlobalProgress);
    Tests._runAllActive = running;
    document.getElementById('tests-run-all')?.classList.toggle('d-none', running);
    document.getElementById('tests-run-all-stop')?.classList.toggle('d-none', !running);
    document.getElementById('tests-global-progress-wrap')?.classList.toggle(
      'd-none',
      !running || !showGlobal
    );
    Tests.setActionButtonsEnabled(Connection.isConnected());
  };

  Tests.planPath = function (query) {
    return query
      ? `/tests/plan?search=${encodeURIComponent(query)}&limit=200`
      : '/tests/plan?limit=200&offset=0';
  };

  Tests.fetchTestPlan = async function (query) {
    const plan = await Connection.fetchJson(Tests.planPath(query));
    Tests._planItems = plan.items || [];
    return plan;
  };

  Tests.planToQueue = function (moduleId) {
    const items = moduleId
      ? Tests._planItems.filter((row) => row.module_id === moduleId)
      : Tests._planItems;
    return items.map((row) => ({
      moduleId: row.module_id,
      consumedId: row.consumed_nugget_id,
      inputValue: row.input_value || Tests._nuggetSamples?.[row.consumed_nugget_id] || '',
      requiresApiKey: Boolean(row.requires_api_key),
      hasApiKey: row.has_api_key !== false,
      skipReason: row.skip_reason || null,
      fixtureKind: row.fixture_kind || 'positive',
      seedValidated: Boolean(row.seed_validated),
    }));
  };

  Tests.runnablePlanSummary = function (moduleId) {
    const filterOpts = { validatedOnly: Tests.runValidatedOnly() };
    const { runnable, skipped, skippedMissingKey, skippedNoInput, skippedPendingSeed } =
      Tests.filterRunnable(Tests.planToQueue(moduleId), filterOpts);
    return {
      runnable,
      skipped,
      skippedMissingKey,
      skippedNoInput,
      skippedPendingSeed,
      total: runnable.length + skipped,
    };
  };

  Tests.setRunningModuleHighlight = function (moduleId) {
    document.querySelectorAll('#tests-module-accordion .accordion-item').forEach((item) => {
      const btn = item.querySelector('.accordion-button[data-module-id]');
      const active = moduleId && btn?.dataset.moduleId === moduleId;
      item.classList.toggle('tests-module-running', Boolean(active));
    });
  };

  Tests.finishBatchEarly = function (message) {
    Tests.setRunningModuleHighlight(null);
    Tests.setBatchControls(false);
    if (message) Tests.setStatus(message);
  };

  Tests.filterRunnable = function (queue, options) {
    const opts = options || {};
    const validatedOnly = opts.validatedOnly !== false;
    let skippedNoInput = 0;
    let skippedMissingKey = 0;
    let skippedPendingSeed = 0;
    const runnable = queue.filter((item) => {
      if (item.skipReason === 'missing-api-key') {
        skippedMissingKey += 1;
        return false;
      }
      if (!Boolean(item.inputValue || Tests._nuggetSamples?.[item.consumedId])) {
        skippedNoInput += 1;
        return false;
      }
      if (validatedOnly && !item.seedValidated) {
        skippedPendingSeed += 1;
        return false;
      }
      return true;
    });
    return {
      runnable,
      skipped: skippedNoInput + skippedMissingKey + skippedPendingSeed,
      skippedNoInput,
      skippedMissingKey,
      skippedPendingSeed,
    };
  };

  Tests.runValidatedOnly = function () {
    const checkbox = document.getElementById('tests-run-unvalidated');
    return !checkbox?.checked;
  };

  Tests.resetBatchProgress = function (runnable, resetGlobal) {
    const touched = new Set(runnable.map((item) => item.moduleId));
    touched.forEach((moduleId) => {
      const total = runnable.filter((item) => item.moduleId === moduleId).length;
      Tests._progress.modules[moduleId] = { done: 0, total };
      Tests.updateModuleProgressUI(moduleId, true);
    });
    if (resetGlobal) {
      Tests._progress.global = { done: 0, total: runnable.length };
      Tests.updateGlobalProgressUI(true);
    }
  };

  Tests.recordBatchOutcome = function (item, outcome, trackGlobal) {
    if (outcome.skipped) {
      Tests._runStats.skipped += 1;
      if (outcome.reason === 'missing-api-key') {
        Tests._runStats.keySkipped += 1;
      }
      Tests.updateRunStatsUI();
      return { passed: 0, failed: 0, skipped: 1 };
    }
    const mod = Tests._progress.modules[item.moduleId];
    if (mod) {
      mod.done += 1;
      Tests.updateModuleProgressUI(item.moduleId, true);
    }
    if (trackGlobal) {
      Tests._progress.global.done += 1;
      Tests.updateGlobalProgressUI(true);
    }
    if (outcome.ok) {
      Tests._runStats.passed += 1;
    } else {
      Tests._runStats.failed += 1;
    }
    Tests.updateRunStatsUI();
    return outcome.ok ? { passed: 1, failed: 0, skipped: 0 } : { passed: 0, failed: 1, skipped: 0 };
  };

  Tests.runBatch = async function (runnable, options) {
    const trackGlobal = Boolean(options.trackGlobal);
    const label = options.label || 'Batch';
    const skipped = options.skipped || 0;
    const controlsActive = Boolean(options.controlsAlreadyActive);
    const preSkipped = options.preSkipped || 0;
    const preKeySkipped = options.preKeySkipped || 0;
    const prePendingSeedSkipped = options.prePendingSeedSkipped || 0;

    if (!controlsActive) {
      Tests._runAllCancel = false;
      Tests.setBatchControls(true, { showGlobalProgress: trackGlobal });
    }
    Tests._runStats = {
      passed: 0,
      failed: 0,
      skipped: preSkipped,
      keySkipped: preKeySkipped,
      pendingSeedSkipped: prePendingSeedSkipped,
    };
    Tests.updateRunStatsUI();
    Tests.resetBatchProgress(runnable, trackGlobal);

    let done = 0;
    let passed = 0;
    let failed = 0;

    for (const item of runnable) {
      if (Tests._runAllCancel) break;

      done += 1;
      Tests.setStatus(`${label} ${done}/${runnable.length}: ${item.moduleId} · ${item.consumedId}…`);

      await Tests.loadModuleTests(item.moduleId);
      Tests.setRunningModuleHighlight(item.moduleId);

      const outcome = await Tests.executeTest(item);
      const tallies = Tests.recordBatchOutcome(item, outcome, trackGlobal);
      passed += tallies.passed;
      failed += tallies.failed;
    }

    Tests.setRunningModuleHighlight(null);
    Tests.setBatchControls(false);
    Tests.updateGlobalProgressUI(false);
    Object.keys(Tests._progress.modules).forEach((moduleId) => {
      Tests.updateModuleProgressUI(moduleId, false);
    });

    if (Tests._runAllCancel) {
      Tests.setStatus(
        `${label} stopped at ${done}/${runnable.length} — ${passed} finished, ${failed} failed`
      );
    } else {
      Tests.setStatus(
        `${label} complete — ${passed} passed, ${failed} failed` +
          (skipped ? `, ${skipped} skipped` : '')
      );
    }
  };

  Tests.runAllTests = async function () {
    if (Tests._runAllActive || Tests._runningRoute || !Tests._moduleList.length) return;

    if (!Tests._planItems.length) {
      Tests.setStatus('Loading test plan…');
      try {
        await Tests.fetchTestPlan();
      } catch (err) {
        Tests.setStatus(`Could not load test plan: ${err.message}`);
        return;
      }
    }

    const { runnable, skipped, skippedMissingKey, skippedNoInput, skippedPendingSeed } =
      Tests.runnablePlanSummary();
    if (!runnable.length) {
      Tests.setStatus(
        skippedPendingSeed && Tests.runValidatedOnly()
          ? 'No seed-validated tests to run. Enable “Include pending-seed tests” or tune seeds in the backend.'
          : 'No tests with input values to run.'
      );
      return;
    }

    const timeout = Tests.getTimeoutSeconds();
    const modeLabel = Tests.runValidatedOnly() ? 'validated' : 'all runnable';
    const label =
      skipped > 0
        ? `${runnable.length} ${modeLabel} tests (${skipped} skipped)`
        : `${runnable.length} ${modeLabel} tests`;
    if (
      !window.confirm(
        `Run ${label} sequentially?\n\n` +
          `Uses scan_ui API. Timeout: ${timeout}s per test.\n` +
          `${skippedMissingKey ? `Needs API key (not run): ${skippedMissingKey}\n` : ''}` +
          `${skippedPendingSeed ? `Pending seed (not run): ${skippedPendingSeed}\n` : ''}` +
          `${skippedNoInput ? `No input sample: ${skippedNoInput}` : ''}`
      )
    ) {
      return;
    }

    Tests._runAllCancel = false;
    Tests.setBatchControls(true, { showGlobalProgress: true });

    await Tests.runBatch(runnable, {
      trackGlobal: true,
      label: Tests.runValidatedOnly() ? 'Validated batch' : 'Full batch',
      skipped,
      preSkipped: skipped,
      preKeySkipped: skippedMissingKey,
      prePendingSeedSkipped: skippedPendingSeed,
      controlsAlreadyActive: true,
    });
  };

  Tests.runModuleAll = async function (moduleId) {
    if (Tests._runAllActive || Tests._runningRoute) return;

    if (!Tests._planItems.length) {
      try {
        await Tests.fetchTestPlan();
      } catch (err) {
        Tests.setStatus(`Could not load test plan: ${err.message}`);
        return;
      }
    }

    const { runnable, skipped, skippedMissingKey, skippedNoInput, skippedPendingSeed } =
      Tests.runnablePlanSummary(moduleId);
    if (!runnable.length) {
      Tests.setStatus(`No runnable tests for ${moduleId}.`);
      return;
    }

    const timeout = Tests.getTimeoutSeconds();
    const label =
      skipped > 0
        ? `${runnable.length} tests in ${moduleId} (${skipped} skipped)`
        : `${runnable.length} tests in ${moduleId}`;
    if (
      !window.confirm(
        `Run ${label}?\n\nUses scan_ui API. Timeout: ${timeout}s per test.\n` +
          `${skippedMissingKey ? `Needs API key (not run): ${skippedMissingKey}\n` : ''}` +
          `${skippedPendingSeed ? `Pending seed (not run): ${skippedPendingSeed}\n` : ''}` +
          `${skippedNoInput ? `No input sample: ${skippedNoInput}` : ''}`
      )
    ) {
      return;
    }
    if (skippedMissingKey || skippedNoInput) {
      Tests.setStatus(
        `${moduleId}: ${runnable.length} runnable, ${skippedMissingKey} missing key, ${skippedNoInput} missing input`
      );
    }

    Tests._runAllCancel = false;
    Tests.setBatchControls(true, { showGlobalProgress: false });

    await Tests.loadModuleTests(moduleId);

    await Tests.runBatch(runnable, {
      trackGlobal: false,
      label: moduleId,
      skipped,
      preSkipped: skipped,
      preKeySkipped: skippedMissingKey,
      controlsAlreadyActive: true,
    });
  };

  Tests.stopRunAll = function () {
    Tests._runAllCancel = true;
    if (Tests._runningRoute) {
      Tests.setStatus('Stopping batch after current test…');
    } else {
      Tests.finishBatchEarly('Batch stopped.');
    }
  };

  Tests.showTestResult = function (rowId, html, tone) {
    const row = document.querySelector(`[data-test-result="${rowId}"]`);
    if (!row) return;
    const cell = row.querySelector('td');
    cell.innerHTML = html;
    cell.className = `small border-top-0 pt-0 pb-2 px-3 bg-${tone || 'body-tertiary'}`;
    row.classList.remove('d-none');
  };

  Tests.updateTestStateBadge = function (rowId, state) {
    const mainRow = document.querySelector(`[data-test-row="${rowId}"]`);
    const badge = mainRow?.querySelector('[data-test-state]');
    if (!badge) return;
    badge.textContent = state;
    badge.className = `badge ${Tests.stateBadgeClass(state)}`;
  };

  Tests.escapeHtml = function (value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  Tests.setRunButtonsEnabled = function (enabled) {
    document.querySelectorAll('[data-action="run-test"]').forEach((btn) => {
      btn.disabled = !enabled || Boolean(Tests._runningRoute) || Tests._runAllActive;
    });
    document.querySelectorAll('[data-action="run-module-all"]').forEach((btn) => {
      btn.disabled = !enabled || Boolean(Tests._runningRoute) || Tests._runAllActive;
    });
  };

  Tests.setActionButtonsEnabled = function (connected) {
    const batchRunning = Tests._runAllActive;
    document.getElementById('tests-search')?.toggleAttribute('disabled', !connected || batchRunning);
    document.getElementById('tests-refresh')?.toggleAttribute('disabled', !connected || batchRunning);
    document.getElementById('tests-timeout')?.toggleAttribute('disabled', !connected || batchRunning);
    document.getElementById('tests-run-all')?.toggleAttribute(
      'disabled',
      !connected || batchRunning || !Tests._moduleList.length
    );
    document.getElementById('tests-run-unvalidated')?.toggleAttribute('disabled', !connected || batchRunning);
    Tests.setRunButtonsEnabled(connected && !batchRunning);
  };

  Tests.loadModuleTests = async function (moduleId) {
    const content = document.querySelector(`[data-module-content="${moduleId}"]`);
    if (!content || content.dataset.loaded === 'true') return;

    content.innerHTML = '<div class="p-3 text-body-secondary small">Loading tests…</div>';

    try {
      const detail = await Connection.fetchJson(`/tests/modules/${moduleId}`);
      Tests.renderTestsTable(content, detail);
      content.dataset.loaded = 'true';
      const total = (detail.tests || []).length;
      if (Tests._progress.modules[moduleId]) {
        Tests._progress.modules[moduleId].total = total;
      }
      Tests.updateModuleProgressUI(moduleId, false);
      const sidebar = document.querySelector(`[data-sidebar-progress="${moduleId}"]`);
      const label = sidebar?.querySelector('[data-sidebar-progress-count]');
      if (label && Tests._progress.modules[moduleId]) {
        label.textContent = `${Tests._progress.modules[moduleId].done} / ${total}`;
      }
    } catch (err) {
      content.innerHTML = `<div class="p-3 text-danger small">Failed to load tests: ${err.message}</div>`;
    }
  };

  Tests.loadCatalog = async function () {
    Tests.setStatus('Loading test catalog…');
    const spinner = document.getElementById('tests-spinner');
    spinner?.classList.remove('d-none');

    try {
      const [summary, modules, samples, plan] = await Promise.all([
        Connection.fetchJson('/tests/summary'),
        Connection.fetchJson('/tests/modules?limit=200&offset=0'),
        Connection.fetchJson('/tests/nugget-samples'),
        Connection.fetchJson('/tests/plan?limit=200&offset=0'),
      ]);
      Tests._nuggetSamples = samples.samples || {};
      Tests._moduleList = modules;
      Tests._planItems = plan.items || [];
      Tests._runStats = { passed: 0, failed: 0, skipped: 0, keySkipped: 0, pendingSeedSkipped: 0 };
      Tests.renderSummary(summary);
      Tests.renderModuleAccordion(modules);
      Tests._modulesLoaded = true;
      Tests.setActionButtonsEnabled(Connection.isConnected());
      const { runnable, skipped, skippedMissingKey, skippedPendingSeed } = Tests.runnablePlanSummary();
      Tests.setStatus(
        `${summary.module_count} modules · ${summary.seed_validated_count ?? '—'} seed-validated · ` +
          `${summary.missing_api_key_count ?? '—'} need API keys · ` +
          `${summary.pending_seed_count ?? '—'} pending seed · ` +
          `Run validated = ${runnable.length} tests` +
          (skipped ? ` (${skipped} excluded)` : '')
      );
      Tests.scheduleScrollSync();
    } catch (err) {
      Tests.setStatus(`Catalog load failed: ${err.message}`);
    } finally {
      spinner?.classList.add('d-none');
    }
  };

  Tests.scheduleScrollSync = function () {
    window.requestAnimationFrame(() => {
      Tests.syncScrollLayout();
    });
  };

  Tests.syncScrollLayout = function () {
    const pane = document.getElementById('pane-tests');
    const main = pane?.querySelector('.tests-main');
    const region = document.getElementById('tests-scroll-region');
    if (!pane || !main || !region || pane.classList.contains('d-none')) return;

    const summary = main.querySelector('.border-bottom');
    const footer = document.getElementById('tests-status');
    const mainHeight = main.getBoundingClientRect().height;
    const reserved = (summary?.offsetHeight ?? 0) + (footer?.offsetHeight ?? 0);
    const height = Math.max(160, Math.floor(mainHeight - reserved));
    region.style.height = `${height}px`;
    region.style.maxHeight = `${height}px`;
    region.style.overflowY = 'auto';
  };

  Tests.onConnectionChange = function (connected) {
    Tests.setActionButtonsEnabled(connected);
    if (connected && !Tests._modulesLoaded) {
      Tests.loadCatalog();
    }
  };

  Tests.bindFilters = function (root) {
    root.querySelector('#tests-refresh')?.addEventListener('click', () => {
      Tests._modulesLoaded = false;
      document.querySelectorAll('[data-module-content]').forEach((el) => {
        el.dataset.loaded = 'false';
      });
      Tests.loadCatalog();
    });

    root.querySelector('#tests-run-all')?.addEventListener('click', () => {
      Tests.runAllTests();
    });

    root.querySelector('#tests-run-all-stop')?.addEventListener('click', () => {
      Tests.stopRunAll();
    });

    root.querySelector('#tests-search')?.addEventListener('input', (event) => {
      clearTimeout(Tests._searchTimer);
      const query = event.target.value.trim();
      Tests._searchTimer = setTimeout(async () => {
        try {
          const modulesPath = query
            ? `/tests/modules?search=${encodeURIComponent(query)}&limit=200`
            : '/tests/modules?limit=200&offset=0';
          const [modules, plan] = await Promise.all([
            Connection.fetchJson(modulesPath),
            Connection.fetchJson(Tests.planPath(query)),
          ]);
          Tests._moduleList = modules;
          Tests._planItems = plan.items || [];
          Tests._runStats = { passed: 0, failed: 0, skipped: 0, keySkipped: 0, pendingSeedSkipped: 0 };
          Tests.renderModuleAccordion(modules);
          Tests.updateRunStatsUI();
          Tests.setActionButtonsEnabled(Connection.isConnected());
          const { runnable, skipped } = Tests.runnablePlanSummary();
          Tests.setStatus(
            `${modules.length} modules · plan ready (${runnable.length} runnable` +
              (skipped ? `, ${skipped} need input` : '') +
              ')'
          );
          Tests.scheduleScrollSync();
        } catch (err) {
          Tests.setStatus(`Search failed: ${err.message}`);
        }
      }, 300);
    });
  };

  Tests.initPanel = function ($root) {
    const el = $root[0];
    if (el.dataset.initialized) return;
    el.dataset.initialized = 'true';

    Tests.bindFilters(el);
    Connection.onStatusChange(Tests.onConnectionChange);
    if (Connection.isConnected()) {
      Tests.onConnectionChange(true);
    }

    window.addEventListener('resize', Tests.scheduleScrollSync);

    window.addEventListener('shell:tab-changed', (event) => {
      if (event.detail?.tabId === 'tests') {
        Tests.scheduleScrollSync();
        if (Connection.isConnected() && !Tests._modulesLoaded) {
          Tests.loadCatalog();
        }
      }
    });

    window.addEventListener('subscriptions:updated', () => {
      if (!Tests._modulesLoaded) return;
      Tests._modulesLoaded = false;
      document.querySelectorAll('[data-module-content]').forEach((el) => {
        el.dataset.loaded = 'false';
      });
      if (Connection.isConnected()) {
        Tests.loadCatalog();
      }
    });

    Tests.scheduleScrollSync();
  };

  Widgets.watchDOMForComponent(Tests.selectorPanel, Tests.initPanel);
})(
  window.jQuery,
  window.Widgets.Tests,
  window.Widgets,
  window.Widgets.Connection,
  document,
  window
);
