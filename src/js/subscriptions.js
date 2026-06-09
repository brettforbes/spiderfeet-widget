window.Widgets = window.Widgets || {};
window.Widgets.Subscriptions = window.Widgets.Subscriptions || {};

(function ($, Subscriptions, Widgets, Connection, document, window) {
  'use strict';

  Subscriptions.selectorPanel = '[data-widget="subscriptions-panel"]';
  Subscriptions._loaded = false;
  Subscriptions._moduleList = [];
  Subscriptions._searchTimer = null;

  Subscriptions.escapeHtml = function (text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  Subscriptions.setStatus = function (message) {
    const el = document.getElementById('subscriptions-status-text');
    if (el) el.textContent = message;
  };

  Subscriptions.tierBadgeHtml = function (tier, hasKey) {
    if (tier === 'paid_auth') {
      const cls = hasKey ? 'text-bg-info' : 'text-bg-warning';
      return `<span class="badge ${cls} me-2" title="Paid subscription">paid</span>`;
    }
    if (tier === 'free_auth') {
      const cls = hasKey ? 'text-bg-secondary' : 'text-bg-warning';
      return `<span class="badge ${cls} me-2" title="Free signup / API key">free</span>`;
    }
    return '';
  };

  Subscriptions.keyIconHtml = function (hasKey) {
    if (hasKey) {
      return '<i class="fa-solid fa-key text-success me-2" title="API key configured"></i>';
    }
    return '<i class="fa-solid fa-key text-warning me-2" title="API key missing"></i>';
  };

  Subscriptions.fixtureCategoryIconHtml = function (fixtureCategory) {
    if (fixtureCategory === 'negative') {
      return '<i class="fa-solid fa-filter-circle-xmark text-secondary me-2" title="Negative fixture module"></i>';
    }
    return '<i class="fa-solid fa-bullseye text-success me-2" title="Positive fixture module"></i>';
  };

  Subscriptions.renderSummary = function (modules) {
    const root = document.getElementById('subscriptions-summary');
    if (!root) return;
    const total = modules.length;
    const configured = modules.filter((row) => row.has_api_key).length;
    const paid = modules.filter((row) => row.subscription_tier === 'paid_auth').length;
    const free = modules.filter((row) => row.subscription_tier === 'free_auth').length;
    const set = (name, value) => {
      const el = root.querySelector(`[data-count="${name}"]`);
      if (el) el.textContent = value;
    };
    set('total', total);
    set('configured', configured);
    set('missing', total - configured);
    set('free-tier', free);
    set('paid-tier', paid);
  };

  Subscriptions.renderAccordion = function (modules) {
    const root = document.getElementById('subscriptions-module-accordion');
    if (!root) return;
    root.innerHTML = '';

    modules.forEach((mod) => {
      const itemId = `subs-mod-${mod.module_id.replace(/[^a-z0-9_-]/gi, '-')}`;
      const item = document.createElement('div');
      item.className = 'accordion-item';
      item.dataset.moduleId = mod.module_id;
      item.innerHTML = `
        <h2 class="accordion-header" id="${itemId}-head">
          <button class="accordion-button collapsed" type="button"
            data-bs-toggle="collapse" data-bs-target="#${itemId}-body"
            aria-expanded="false" aria-controls="${itemId}-body"
            data-module-id="${mod.module_id}">
            ${Subscriptions.fixtureCategoryIconHtml(mod.fixture_category || 'positive')}
            ${Subscriptions.keyIconHtml(mod.has_api_key)}
            <span class="me-2 fw-semibold">${Subscriptions.escapeHtml(mod.module_id)}</span>
            <span class="text-body-secondary small me-2">${Subscriptions.escapeHtml(mod.name)}</span>
            ${Subscriptions.tierBadgeHtml(mod.subscription_tier, mod.has_api_key)}
          </button>
        </h2>
        <div id="${itemId}-body" class="accordion-collapse collapse"
          aria-labelledby="${itemId}-head" data-bs-parent="#subscriptions-module-accordion">
          <div class="accordion-body" data-module-body="${mod.module_id}">
            <div class="text-body-secondary small">Expand to load subscription details…</div>
          </div>
        </div>`;
      root.appendChild(item);

      item.querySelector('.accordion-collapse').addEventListener('show.bs.collapse', () => {
        Subscriptions.loadModuleDetail(mod.module_id);
      });
    });
  };

  Subscriptions.secretFieldsHtml = function (detail) {
    const opts = detail.secret_opts || [];
    if (!opts.length) {
      return '<p class="small text-body-secondary mb-0">No writable secret options for this module.</p>';
    }
    return opts
      .map(
        (opt) => `
      <div class="mb-3" data-secret-field="${Subscriptions.escapeHtml(opt.name)}">
        <label class="form-label small" for="secret-${Subscriptions.escapeHtml(detail.module_id)}-${Subscriptions.escapeHtml(opt.name)}">
          ${Subscriptions.escapeHtml(opt.name)}
          ${opt.configured ? `<span class="text-body-secondary">(${Subscriptions.escapeHtml(opt.masked_value || 'set')})</span>` : ''}
        </label>
        <input
          type="password"
          class="form-control form-control-sm"
          id="secret-${Subscriptions.escapeHtml(detail.module_id)}-${Subscriptions.escapeHtml(opt.name)}"
          autocomplete="off"
          placeholder="${opt.configured ? 'Enter new value to replace' : 'Paste API key or token'}"
        />
      </div>`
      )
      .join('');
  };

  Subscriptions.renderDetail = function (container, detail) {
    const instructions = (detail.api_key_instructions || [])
      .map((line) => `<li>${Subscriptions.escapeHtml(line)}</li>`)
      .join('');
    const website = detail.website
      ? `<a href="${Subscriptions.escapeHtml(detail.website)}" target="_blank" rel="noopener noreferrer">${Subscriptions.escapeHtml(detail.website)}</a>`
      : '—';

    container.innerHTML = `
      <div class="subscriptions-detail" data-module-detail="${detail.module_id}">
        <h3 class="h6">${Subscriptions.escapeHtml(detail.name)}</h3>
        <p class="small mb-3">${Subscriptions.escapeHtml(detail.summary)}</p>
        <dl class="row small mb-3">
          <dt class="col-sm-3">Website</dt>
          <dd class="col-sm-9 mb-1">${website}</dd>
          <dt class="col-sm-3">Tier</dt>
          <dd class="col-sm-9 mb-1">${Subscriptions.escapeHtml(detail.subscription_tier)}</dd>
          <dt class="col-sm-3">Consumes</dt>
          <dd class="col-sm-9 mb-1">${(detail.consumed_nuggets || []).map((n) => `<code class="me-1">${Subscriptions.escapeHtml(n)}</code>`).join('') || '—'}</dd>
          <dt class="col-sm-3">Produces</dt>
          <dd class="col-sm-9 mb-1">${(detail.produced_nuggets || []).map((n) => `<code class="me-1">${Subscriptions.escapeHtml(n)}</code>`).join('') || '—'}</dd>
        </dl>
        ${
          instructions
            ? `<div class="mb-3"><h4 class="h6 text-uppercase text-body-secondary">Get an API key</h4><ol class="small mb-0">${instructions}</ol></div>`
            : ''
        }
        <form data-subscription-form="${detail.module_id}" class="border-top pt-3">
          ${Subscriptions.secretFieldsHtml(detail)}
          <div class="d-flex flex-wrap gap-2">
            <button type="submit" class="btn btn-sm btn-primary">Save</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-action="clear-secrets">Clear keys</button>
          </div>
          <div class="small text-danger mt-2 d-none" data-save-error></div>
        </form>
      </div>`;

    const form = container.querySelector('[data-subscription-form]');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      Subscriptions.saveModuleSecrets(detail.module_id, false);
    });
    form?.querySelector('[data-action="clear-secrets"]')?.addEventListener('click', () => {
      if (window.confirm(`Clear stored API keys for ${detail.module_id}?`)) {
        Subscriptions.saveModuleSecrets(detail.module_id, true);
      }
    });
    container.dataset.loaded = 'true';
  };

  Subscriptions.collectSecrets = function (moduleId, clear) {
    const container = document.querySelector(`[data-module-body="${moduleId}"]`);
    const secrets = {};
    container?.querySelectorAll('[data-secret-field]').forEach((wrap) => {
      const name = wrap.dataset.secretField;
      const input = wrap.querySelector('input');
      secrets[name] = clear ? '' : (input?.value || '').trim();
    });
    return secrets;
  };

  Subscriptions.updateHeaderState = function (moduleId, detail) {
    const item = document.querySelector(`.accordion-item[data-module-id="${moduleId}"]`);
    const btn = item?.querySelector('.accordion-button');
    if (!btn) return;
    btn.querySelector('.fa-key')?.remove();
    btn.insertAdjacentHTML('afterbegin', Subscriptions.keyIconHtml(detail.has_api_key));
    const tierBadge = btn.querySelector('.badge');
    if (tierBadge) {
      tierBadge.outerHTML = Subscriptions.tierBadgeHtml(detail.subscription_tier, detail.has_api_key);
    }
  };

  Subscriptions.saveModuleSecrets = async function (moduleId, clear) {
    const container = document.querySelector(`[data-module-body="${moduleId}"]`);
    const errorEl = container?.querySelector('[data-save-error]');
    if (errorEl) {
      errorEl.classList.add('d-none');
      errorEl.textContent = '';
    }

    const secrets = Subscriptions.collectSecrets(moduleId, clear);
    if (!clear && !Object.values(secrets).some((value) => value)) {
      if (errorEl) {
        errorEl.textContent = 'Enter at least one secret value to save.';
        errorEl.classList.remove('d-none');
      }
      return;
    }

    Subscriptions.setStatus(clear ? `Clearing keys for ${moduleId}…` : `Saving keys for ${moduleId}…`);
    try {
      const detail = await Connection.fetchJson(`/subscriptions/modules/${encodeURIComponent(moduleId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secrets }),
      });
      Subscriptions.renderDetail(container, detail);
      Subscriptions.updateHeaderState(moduleId, detail);
      const idx = Subscriptions._moduleList.findIndex((row) => row.module_id === moduleId);
      if (idx >= 0) {
        Subscriptions._moduleList[idx] = {
          ...Subscriptions._moduleList[idx],
          has_api_key: detail.has_api_key,
          secret_opts: detail.secret_opts,
        };
      }
      Subscriptions.renderSummary(Subscriptions._moduleList);
      Subscriptions.setStatus(
        clear ? `Cleared keys for ${moduleId}.` : `Saved keys for ${moduleId}. Tests tab will refresh.`
      );
      window.dispatchEvent(
        new CustomEvent('subscriptions:updated', { detail: { moduleId, hasApiKey: detail.has_api_key } })
      );
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('d-none');
      }
      Subscriptions.setStatus(`Save failed: ${err.message}`);
    }
  };

  Subscriptions.loadModuleDetail = async function (moduleId) {
    const container = document.querySelector(`[data-module-body="${moduleId}"]`);
    if (!container || container.dataset.loaded === 'true') return;

    container.innerHTML = '<div class="text-body-secondary small">Loading…</div>';
    try {
      const detail = await Connection.fetchJson(
        `/subscriptions/modules/${encodeURIComponent(moduleId)}`
      );
      Subscriptions.renderDetail(container, detail);
    } catch (err) {
      container.innerHTML = `<div class="text-danger small">Failed to load: ${Subscriptions.escapeHtml(err.message)}</div>`;
    }
  };

  Subscriptions.loadCatalog = async function (query) {
    Subscriptions.setStatus('Loading subscriptions…');
    const spinner = document.getElementById('subscriptions-spinner');
    spinner?.classList.remove('d-none');

    try {
      const path = query
        ? `/subscriptions/modules?search=${encodeURIComponent(query)}&limit=200`
        : '/subscriptions/modules?limit=200&offset=0';
      const modules = await Connection.fetchJson(path);
      Subscriptions._moduleList = modules;
      Subscriptions.renderSummary(modules);
      Subscriptions.renderAccordion(modules);
      Subscriptions._loaded = true;
      Subscriptions.setActionButtonsEnabled(Connection.isConnected());
      const configured = modules.filter((row) => row.has_api_key).length;
      Subscriptions.setStatus(`${modules.length} key-required modules · ${configured} configured`);
      Subscriptions.scheduleScrollSync();
    } catch (err) {
      Subscriptions.setStatus(`Load failed: ${err.message}`);
    } finally {
      spinner?.classList.add('d-none');
    }
  };

  Subscriptions.setActionButtonsEnabled = function (connected) {
    document.getElementById('subscriptions-search')?.toggleAttribute('disabled', !connected);
    document.getElementById('subscriptions-refresh')?.toggleAttribute('disabled', !connected);
  };

  Subscriptions.scheduleScrollSync = function () {
    window.requestAnimationFrame(() => {
      Subscriptions.syncScrollLayout();
    });
  };

  Subscriptions.syncScrollLayout = function () {
    const pane = document.getElementById('pane-subscriptions');
    const main = pane?.querySelector('.subscriptions-main');
    const region = document.getElementById('subscriptions-scroll-region');
    if (!pane || !main || !region || pane.classList.contains('d-none')) return;

    const summary = main.querySelector('.border-bottom');
    const footer = document.getElementById('subscriptions-status');
    const mainHeight = main.getBoundingClientRect().height;
    const reserved = (summary?.offsetHeight ?? 0) + (footer?.offsetHeight ?? 0);
    const height = Math.max(160, Math.floor(mainHeight - reserved));
    region.style.height = `${height}px`;
    region.style.maxHeight = `${height}px`;
    region.style.overflowY = 'auto';
  };

  Subscriptions.onConnectionChange = function (connected) {
    Subscriptions.setActionButtonsEnabled(connected);
    if (connected && !Subscriptions._loaded) {
      Subscriptions.loadCatalog();
    }
  };

  Subscriptions.bindFilters = function (root) {
    root.querySelector('#subscriptions-refresh')?.addEventListener('click', () => {
      Subscriptions._loaded = false;
      document.querySelectorAll('[data-module-body]').forEach((el) => {
        el.dataset.loaded = 'false';
      });
      Subscriptions.loadCatalog();
    });

    root.querySelector('#subscriptions-search')?.addEventListener('input', (event) => {
      clearTimeout(Subscriptions._searchTimer);
      const query = event.target.value.trim();
      Subscriptions._searchTimer = setTimeout(() => {
        document.querySelectorAll('[data-module-body]').forEach((el) => {
          el.dataset.loaded = 'false';
        });
        Subscriptions.loadCatalog(query);
      }, 300);
    });
  };

  Subscriptions.initPanel = function ($root) {
    const el = $root[0];
    if (el.dataset.initialized) return;
    el.dataset.initialized = 'true';

    Subscriptions.bindFilters(el);
    Connection.onStatusChange(Subscriptions.onConnectionChange);
    if (Connection.isConnected()) {
      Subscriptions.onConnectionChange(true);
    }

    window.addEventListener('resize', Subscriptions.scheduleScrollSync);
    window.addEventListener('shell:tab-changed', (event) => {
      if (event.detail?.tabId === 'subscriptions') {
        Subscriptions.scheduleScrollSync();
        if (Connection.isConnected() && !Subscriptions._loaded) {
          Subscriptions.loadCatalog();
        }
      }
    });

    Subscriptions.scheduleScrollSync();
  };

  Widgets.watchDOMForComponent(Subscriptions.selectorPanel, Subscriptions.initPanel);
})(
  window.jQuery,
  window.Widgets.Subscriptions,
  window.Widgets,
  window.Widgets.Connection,
  document,
  window
);
