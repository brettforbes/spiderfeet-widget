window.Widgets = window.Widgets || {};
window.Widgets.Tests = window.Widgets.Tests || {};

(function ($, Tests, Widgets, Connection, document, window) {
  'use strict';

  Tests.selectorPanel = '[data-widget="tests-panel"]';
  Tests._modulesLoaded = false;
  Tests._expandedModule = null;

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

  Tests.renderSummary = function (summary) {
    const root = document.getElementById('tests-summary');
    if (!root || !summary) return;
    root.querySelector('[data-count="modules"]').textContent = summary.module_count;
    root.querySelector('[data-count="routes"]').textContent = summary.route_count;
    root.querySelector('[data-count="groups"]').textContent = summary.consumption_group_count;
    root.querySelector('[data-count="not-started"]').textContent =
      summary.route_states?.not_started ?? '—';
    root.querySelector('[data-count="in-test"]').textContent =
      summary.route_states?.in_test ?? '—';
    root.querySelector('[data-count="tested"]').textContent =
      (summary.route_states?.favourite ?? 0) +
      (summary.route_states?.unique ?? 0) +
      (summary.route_states?.error ?? 0);
  };

  Tests.renderModuleAccordion = function (modules) {
    const root = document.getElementById('tests-module-accordion');
    if (!root) return;
    root.innerHTML = '';

    modules.forEach((mod, index) => {
      const itemId = `tests-mod-${mod.module_id.replace(/[^a-z0-9_-]/gi, '-')}`;
      const item = document.createElement('div');
      item.className = 'accordion-item';
      item.innerHTML = `
        <h2 class="accordion-header" id="${itemId}-head">
          <button class="accordion-button collapsed" type="button"
            data-bs-toggle="collapse" data-bs-target="#${itemId}-body"
            aria-expanded="false" aria-controls="${itemId}-body"
            data-module-id="${mod.module_id}">
            <span class="me-2 fw-semibold">${mod.module_id}</span>
            <span class="text-body-secondary small me-2">${mod.name}</span>
            <span class="badge text-bg-light border ms-auto me-2">${mod.route_count} routes</span>
            ${
              mod.routes_tested
                ? `<span class="badge text-bg-success">${mod.routes_tested} tested</span>`
                : ''
            }
          </button>
        </h2>
        <div id="${itemId}-body" class="accordion-collapse collapse"
          aria-labelledby="${itemId}-head" data-bs-parent="#tests-module-accordion">
          <div class="accordion-body p-0" data-module-body="${mod.module_id}">
            <div class="p-3 text-body-secondary small">Loading routes…</div>
          </div>
        </div>`;
      root.appendChild(item);

      item.querySelector('.accordion-collapse').addEventListener('show.bs.collapse', () => {
        Tests.loadModuleRoutes(mod.module_id);
      });
    });
  };

  Tests.renderRoutesTable = function (container, detail) {
    const rows = (detail.routes || [])
      .map(
        (route) => `
      <tr>
        <td class="small font-monospace">${route.consumed_nugget_id}</td>
        <td class="small font-monospace">${route.produced_nugget_id}</td>
        <td><span class="badge ${Tests.stateBadgeClass(route.route_state)}">${route.route_state}</span></td>
        <td class="text-end">
          <button type="button" class="btn btn-sm btn-outline-primary" disabled
            title="Route execution — Stage 4c">Run</button>
        </td>
      </tr>`
      )
      .join('');

    container.innerHTML = `
      <p class="small text-body-secondary px-3 pt-3 mb-2">${detail.summary}</p>
      <div class="table-responsive">
        <table class="table table-sm table-striped mb-0">
          <thead class="table-light">
            <tr>
              <th>Consumed</th>
              <th>Produced</th>
              <th>State</th>
              <th class="text-end">Action</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  };

  Tests.loadModuleRoutes = async function (moduleId) {
    const body = document.querySelector(`[data-module-body="${moduleId}"]`);
    if (!body || body.dataset.loaded === 'true') return;

    try {
      const detail = await Connection.fetchJson(`/tests/modules/${moduleId}`);
      Tests.renderRoutesTable(body, detail);
      body.dataset.loaded = 'true';
    } catch (err) {
      body.innerHTML = `<div class="p-3 text-danger small">Failed to load routes: ${err.message}</div>`;
    }
  };

  Tests.loadCatalog = async function () {
    Tests.setStatus('Loading test catalog…');
    const spinner = document.getElementById('tests-spinner');
    spinner?.classList.remove('d-none');

    try {
      const [summary, modules] = await Promise.all([
        Connection.fetchJson('/tests/summary'),
        Connection.fetchJson('/tests/modules?limit=100&offset=0'),
      ]);
      Tests.renderSummary(summary);
      Tests.renderModuleAccordion(modules);
      Tests._modulesLoaded = true;
      Tests.setStatus(`${summary.module_count} modules · ${summary.route_count} routes`);
    } catch (err) {
      Tests.setStatus(`Catalog load failed: ${err.message}`);
    } finally {
      spinner?.classList.add('d-none');
    }
  };

  Tests.onConnectionChange = function (connected) {
    const disabled = !connected;
    document.getElementById('tests-search')?.toggleAttribute('disabled', disabled);
    document.getElementById('tests-refresh')?.toggleAttribute('disabled', disabled);
    if (connected && !Tests._modulesLoaded) {
      Tests.loadCatalog();
    }
  };

  Tests.bindFilters = function (root) {
    root.querySelector('#tests-refresh')?.addEventListener('click', () => {
      Tests._modulesLoaded = false;
      document.querySelectorAll('[data-module-body]').forEach((el) => {
        el.dataset.loaded = 'false';
      });
      Tests.loadCatalog();
    });

    root.querySelector('#tests-search')?.addEventListener('input', (event) => {
      clearTimeout(Tests._searchTimer);
      const query = event.target.value.trim();
      Tests._searchTimer = setTimeout(async () => {
        try {
          const path = query
            ? `/tests/modules?search=${encodeURIComponent(query)}&limit=100`
            : '/tests/modules?limit=100&offset=0';
          const modules = await Connection.fetchJson(path);
          Tests.renderModuleAccordion(modules);
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

    window.addEventListener('shell:tab-changed', (event) => {
      if (event.detail?.tabId === 'tests' && Connection.isConnected() && !Tests._modulesLoaded) {
        Tests.loadCatalog();
      }
    });
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
