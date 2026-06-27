window.Widgets = window.Widgets || {};
window.Widgets.Settings = window.Widgets.Settings || {};

(function ($, Settings, Widgets, Connection, document, window) {
  'use strict';

  Settings.selectorPanel = '[data-widget="settings-panel"]';
  Settings._cliApps = [];

  Settings.escapeHtml = function (text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  Settings.setStatus = function (message) {
    const el = document.getElementById('settings-status-text');
    if (el) el.textContent = message;
  };

  Settings.setButtonsEnabled = function (connected) {
    ['settings-refresh', 'settings-cli-apps-save', 'settings-ai-agent-add'].forEach((id) => {
      document.getElementById(id)?.toggleAttribute('disabled', !connected);
    });
  };

  Settings.renderCliApps = function (apps) {
    Settings._cliApps = apps || [];
    const tbody = document.getElementById('settings-cli-apps-tbody');
    if (!tbody) return;
    if (!apps.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-body-secondary small">No CLI apps registered.</td></tr>';
      return;
    }
    tbody.innerHTML = apps
      .map(
        (app, idx) => `<tr data-cli-app-idx="${idx}">
          <td><strong>${Settings.escapeHtml(app.display_name || app.tool_id)}</strong><br><code class="small">${Settings.escapeHtml(app.tool_id)}</code></td>
          <td><input type="text" class="form-control form-control-sm" data-field="binary_path" value="${Settings.escapeHtml(app.binary_path || '')}" /></td>
          <td>
            <select class="form-select form-select-sm" data-field="runtime">
              ${['windows', 'wsl', 'wsl-root'].map((r) => `<option value="${r}" ${app.runtime === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
          </td>
          <td><input type="text" class="form-control form-control-sm" data-field="env_file" value="${Settings.escapeHtml(app.env_file || '')}" placeholder="optional" /></td>
          <td class="text-center"><input type="checkbox" class="form-check-input" data-field="enabled" ${app.enabled ? 'checked' : ''} /></td>
        </tr>`
      )
      .join('');
  };

  Settings.collectCliApps = function () {
    const rows = document.querySelectorAll('#settings-cli-apps-tbody tr[data-cli-app-idx]');
    return Array.from(rows).map((row) => {
      const idx = Number(row.dataset.cliAppIdx);
      const base = Settings._cliApps[idx] || {};
      return {
        tool_id: base.tool_id,
        display_name: base.display_name || base.tool_id,
        binary_path: row.querySelector('[data-field="binary_path"]')?.value?.trim() || '',
        runtime: row.querySelector('[data-field="runtime"]')?.value || 'windows',
        env_file: row.querySelector('[data-field="env_file"]')?.value?.trim() || null,
        enabled: Boolean(row.querySelector('[data-field="enabled"]')?.checked),
      };
    });
  };

  Settings.renderAiAgents = function (agents) {
    const tbody = document.getElementById('settings-ai-agents-tbody');
    if (!tbody) return;
    if (!agents.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-body-secondary small">No AI agents configured.</td></tr>';
      return;
    }
    tbody.innerHTML = agents
      .map(
        (agent) => `<tr data-agent-id="${Settings.escapeHtml(agent.id)}">
          <td>${Settings.escapeHtml(agent.label)}</td>
          <td><code class="small">${Settings.escapeHtml(agent.provider)}</code></td>
          <td class="small">${Settings.escapeHtml(agent.model || '—')}</td>
          <td>${agent.has_api_key ? '<i class="fa-solid fa-key text-success" title="Configured"></i>' : '<i class="fa-solid fa-key text-warning" title="Missing"></i>'} <span class="small text-body-secondary">${Settings.escapeHtml(agent.masked_api_key || '')}</span></td>
          <td class="text-center">${agent.enabled ? 'Yes' : 'No'}</td>
          <td><button type="button" class="btn btn-sm btn-outline-danger" data-action="delete-agent">Delete</button></td>
        </tr>`
      )
      .join('');

    tbody.querySelectorAll('[data-action="delete-agent"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('tr');
        const agentId = row?.dataset.agentId;
        if (!agentId || !window.confirm('Delete this AI agent key?')) return;
        await Connection.fetchJson(`/settings/ai-agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' });
        Settings.loadAll();
      });
    });
  };

  Settings.loadAll = async function () {
    Settings.setStatus('Loading settings…');
    try {
      const [apps, agents] = await Promise.all([
        Connection.fetchJson('/settings/cli-apps'),
        Connection.fetchJson('/settings/ai-agents'),
      ]);
      Settings.renderCliApps(apps);
      Settings.renderAiAgents(agents);
      Settings.setStatus(`Loaded ${apps.length} CLI apps · ${agents.length} AI agents`);
    } catch (err) {
      Settings.setStatus(`Load failed: ${err.message}`);
    }
  };

  Settings.saveCliApps = async function () {
    Settings.setStatus('Saving CLI app paths…');
    try {
      const apps = Settings.collectCliApps();
      const saved = await Connection.fetchJson('/settings/cli-apps', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apps }),
      });
      Settings.renderCliApps(saved);
      Settings.setStatus('CLI app paths saved.');
    } catch (err) {
      Settings.setStatus(`Save failed: ${err.message}`);
    }
  };

  Settings.addAiAgent = async function () {
    const label = window.prompt('Agent label:', 'My OpenAI agent');
    if (!label) return;
    const provider = window.prompt('Provider (openai, anthropic, google, azure_openai, ollama, custom):', 'openai');
    if (!provider) return;
    const model = window.prompt('Default model (optional):', '') || '';
    const apiKey = window.prompt('API key (stored encrypted server-side):', '');
    if (apiKey === null) return;
    await Connection.fetchJson('/settings/ai-agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, provider, model, api_key: apiKey, enabled: true }),
    });
    Settings.loadAll();
  };

  Settings.onConnectionChange = function (connected) {
    Settings.setButtonsEnabled(connected);
    if (connected) Settings.loadAll();
  };

  Settings.initPanel = function ($root) {
    const el = $root[0];
    if (el.dataset.initialized) return;
    el.dataset.initialized = 'true';

    document.getElementById('settings-refresh')?.addEventListener('click', () => Settings.loadAll());
    document.getElementById('settings-cli-apps-save')?.addEventListener('click', () => Settings.saveCliApps());
    document.getElementById('settings-ai-agent-add')?.addEventListener('click', () => Settings.addAiAgent());

    Connection.onStatusChange(Settings.onConnectionChange);
    if (Connection.isConnected()) Settings.onConnectionChange(true);

    window.addEventListener('shell:tab-changed', (event) => {
      if (event.detail?.tabId === 'settings' && Connection.isConnected()) {
        Settings.loadAll();
      }
    });
  };

  Widgets.watchDOMForComponent(Settings.selectorPanel, Settings.initPanel);
})(window.jQuery, window.Widgets.Settings, window.Widgets, window.Widgets.Connection, document, window);
