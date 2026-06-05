window.Widgets = window.Widgets || {};
window.Widgets.Connection = window.Widgets.Connection || {};

(function ($, Connection, Widgets, document, window) {
  'use strict';

  Connection.selector = '[data-widget="map-connection"]';
  Connection.DEFAULT_API_BASE = 'http://127.0.0.1:8001/api/v1';

  Connection._apiBase = Connection.DEFAULT_API_BASE;
  Connection._connected = false;
  Connection._lastStatus = null;
  Connection._listeners = [];

  Connection.apiUrl = function (path) {
    const base = Connection._apiBase.replace(/\/$/, '');
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  };

  Connection.isConnected = function () {
    return Connection._connected;
  };

  Connection.onStatusChange = function (callback) {
    if (typeof callback === 'function') {
      Connection._listeners.push(callback);
    }
  };

  Connection._notify = function () {
    Connection._listeners.forEach((fn) => {
      try {
        fn(Connection._connected, Connection._lastStatus);
      } catch (err) {
        console.error('Connection listener error', err);
      }
    });
  };

  Connection.setConnectionBadge = function (text, tone) {
    const badge = document.getElementById('connection-badge');
    if (!badge) return;
    badge.textContent = text;
    badge.className = `badge rounded-pill text-bg-${tone || 'secondary'}`;
  };

  Connection.fetchJson = async function (path, options) {
    const response = await fetch(Connection.apiUrl(path), options);
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`${response.status} ${response.statusText}: ${detail}`);
    }
    return response.json();
  };

  Connection.refreshStatus = async function () {
    Connection.setConnectionBadge('Checking…', 'secondary');
    try {
      const status = await Connection.fetchJson('/map/status');
      Connection._connected = Boolean(status.reachable);
      if (status.reachable) {
        Connection.setConnectionBadge(`Connected · ${status.database}`, 'success');
      } else {
        Connection.setConnectionBadge('Unreachable', 'warning');
      }
      Connection._lastStatus = status;
      Connection._notify();
      return status;
    } catch (err) {
      Connection._connected = false;
      Connection._lastStatus = null;
      Connection.setConnectionBadge('Offline', 'danger');
      Connection._notify();
      throw err;
    }
  };

  Connection.ping = async function () {
    try {
      const ping = await Connection.fetchJson('/map/connection/ping', { method: 'POST' });
      if (ping.reachable) {
        Connection.setConnectionBadge(`Ping OK · ${ping.database}`, 'success');
      } else {
        Connection.setConnectionBadge('Ping failed', 'warning');
      }
    } catch (err) {
      Connection.setConnectionBadge('Ping error', 'danger');
      throw err;
    }
  };

  Connection.init = function ($root) {
    const el = $root[0];
    if (el.dataset.initialized) return;
    el.dataset.initialized = 'true';

    const apiBase = document.getElementById('widget-root')?.dataset.apiBase;
    if (apiBase) Connection._apiBase = apiBase;

    el.querySelector('[data-action="ping"]')?.addEventListener('click', () => {
      Connection.ping().then(() => Connection.refreshStatus());
    });

    Connection.refreshStatus().catch(() => {});
  };

  Widgets.watchDOMForComponent(Connection.selector, Connection.init);
})(
  window.jQuery,
  window.Widgets.Connection,
  window.Widgets,
  document,
  window
);
