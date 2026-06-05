window.Widgets = window.Widgets || {};
window.Widgets.Map = window.Widgets.Map || {};

(function ($, Map, Widgets, Events, document, window) {
  'use strict';

  Map.selectorPanel = '[data-widget="maps-panel"]';
  Map.selectorConnection = '[data-widget="map-connection"]';

  Map.DEFAULT_API_BASE = 'http://127.0.0.1:8001/api/v1';
  Map.SERVICE_COLOUR = '#6366f1';
  Map.NUGGET_FALLBACK = '#3b82f6';

  Map._graphInstance = null;
  Map._connected = false;
  Map._variant = 'default';
  Map._apiBase = Map.DEFAULT_API_BASE;

  Map.apiUrl = function (path) {
    const base = Map._apiBase.replace(/\/$/, '');
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  };

  Map.setStatus = function (message) {
    const el = document.getElementById('map-status-text');
    if (el) el.textContent = message;
  };

  Map.setConnectionBadge = function (text, tone) {
    const badge = document.getElementById('connection-badge');
    if (!badge) return;
    badge.textContent = text;
    badge.className = `badge rounded-pill text-bg-${tone || 'secondary'}`;
  };

  Map.setInventory = function (inventory) {
    const root = document.getElementById('map-inventory');
    if (!root || !inventory) return;
    root.querySelector('[data-count="nuggets"]').textContent = inventory.nugget_count;
    root.querySelector('[data-count="services"]').textContent = inventory.service_count;
    root.querySelector('[data-count="links"]').textContent = inventory.link_count;
  };

  Map.setControlsEnabled = function (enabled) {
    document.querySelectorAll('[data-action="refresh-graph"]').forEach((btn) => {
      btn.disabled = !enabled;
    });
    document.querySelectorAll('#map-layout-buttons [data-variant]').forEach((btn) => {
      btn.disabled = !enabled;
    });
  };

  Map.setVariantButtons = function (active) {
    document.querySelectorAll('#map-layout-buttons [data-variant]').forEach((btn) => {
      const on = btn.dataset.variant === active;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };

  Map.showSpinner = function (show) {
    document.getElementById('viz-spinner')?.classList.toggle('d-none', !show);
  };

  Map.showEmpty = function (show) {
    document.getElementById('viz-empty')?.classList.toggle('d-none', !show);
  };

  Map.transformGraph = function (payload) {
    const nodes = (payload.nodes || []).map((n) => {
      const isService = n.kind === 'osint-service';
      return {
        id: n.id,
        group: isService ? 'service' : 'nugget',
        label: n.label || n.id,
        r: isService ? 14 : 7,
        colour: n.colour || (isService ? Map.SERVICE_COLOUR : Map.NUGGET_FALLBACK),
        meta: {
          service_state: n.service_state,
          kind: n.kind,
        },
      };
    });

    const links = (payload.links || []).map((l) => ({
      source: l.source,
      target: l.target,
      role: l.role,
    }));

    return { nodes, links };
  };

  Map.renderGraph = function (payload) {
    if (Map._graphInstance) {
      Map._graphInstance.destroy();
      Map._graphInstance = null;
    }

    const { nodes, links } = Map.transformGraph(payload);

    if (!nodes.length) {
      Map.showEmpty(true);
      document.getElementById('map-node-count').textContent = '';
      Map.setStatus('Connected — no nodes in graph export');
      return;
    }

    Map.showEmpty(false);

    Map._graphInstance = Viz.ForceGraph.create({
      svg: '#graph',
      tooltip: '#tooltip',
      nodes,
      links,
      variant: Map._variant,
      onNodeClick: (event, node) => {
        Events.raiseEvent(
          'map-node-selected',
          Events.compileEventData(
            { id: node.id, group: node.group, label: node.label },
            'map-node-selected',
            'click',
            'force-graph',
            {},
            'parent'
          )
        );
      },
    });

    document.getElementById('map-node-count').textContent = `${nodes.length} nodes · ${links.length} links`;
    Map.setStatus(`Graph loaded (${nodes.length} nodes, ${links.length} links)`);
  };

  Map.fetchJson = async function (path, options) {
    const response = await fetch(Map.apiUrl(path), options);
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`${response.status} ${response.statusText}: ${detail}`);
    }
    return response.json();
  };

  Map.refreshStatus = async function () {
    Map.setConnectionBadge('Checking…', 'secondary');
    Map.setStatus('Checking API and TypeDB…');

    try {
      const status = await Map.fetchJson('/map/status');
      Map._connected = Boolean(status.reachable);
      if (status.reachable) {
        Map.setConnectionBadge(`Connected · ${status.database}`, 'success');
        Map.setInventory(status.inventory);
        Map.setControlsEnabled(true);
        Map.setStatus(`TypeDB reachable (${status.database})`);
        return status;
      }
      Map.setConnectionBadge('Unreachable', 'warning');
      Map.setControlsEnabled(false);
      Map.setStatus('API reachable but TypeDB is not');
      return status;
    } catch (err) {
      Map._connected = false;
      Map.setConnectionBadge('Offline', 'danger');
      Map.setControlsEnabled(false);
      Map.setStatus(`Connection failed: ${err.message}`);
      throw err;
    }
  };

  Map.loadGraph = async function () {
    if (!Map._connected) {
      Map.showEmpty(true);
      Map.setStatus('Connect to the API before loading the graph');
      return;
    }

    Map.showSpinner(true);
    Map.showEmpty(false);

    try {
      const graph = await Map.fetchJson('/map/graph');
      Map.renderGraph(graph);
    } catch (err) {
      Map.showEmpty(true);
      Map.setStatus(`Graph load failed: ${err.message}`);
    } finally {
      Map.showSpinner(false);
    }
  };

  Map.ping = async function () {
    try {
      const ping = await Map.fetchJson('/map/connection/ping', { method: 'POST' });
      if (ping.reachable) {
        Map.setConnectionBadge(`Ping OK · ${ping.database}`, 'success');
      } else {
        Map.setConnectionBadge('Ping failed', 'warning');
      }
    } catch (err) {
      Map.setConnectionBadge('Ping error', 'danger');
      Map.setStatus(`Ping failed: ${err.message}`);
    }
  };

  Map.setVariant = function (variant) {
    if (!Viz.ForceGraph.variants.includes(variant)) return;
    Map._variant = variant;
    Map.setVariantButtons(variant);
    if (Map._connected) {
      Map.loadGraph();
    }
  };

  Map.bindPanel = function (root) {
    const apiBase = document.getElementById('widget-root')?.dataset.apiBase;
    if (apiBase) Map._apiBase = apiBase;

    root.querySelectorAll('[data-action="refresh-graph"]').forEach((btn) => {
      btn.addEventListener('click', () => Map.loadGraph());
    });

    root.querySelectorAll('#map-layout-buttons [data-variant]').forEach((btn) => {
      btn.addEventListener('click', () => Map.setVariant(btn.dataset.variant));
    });
  };

  Map.bindConnection = function (root) {
    root.querySelector('[data-action="ping"]')?.addEventListener('click', () => {
      Map.ping().then(() => Map.refreshStatus());
    });
  };

  Map.initPanel = function ($root) {
    const el = $root[0];
    if (el.dataset.initialized) return;
    el.dataset.initialized = 'true';

    Map.bindPanel(el);
    Map.setVariantButtons(Map._variant);
    Map.setControlsEnabled(false);
    Map.showEmpty(true);

    Map.refreshStatus()
      .then((status) => {
        if (status?.reachable) {
          return Map.loadGraph();
        }
        Map.showEmpty(true);
        return null;
      })
      .catch(() => {
        Map.showEmpty(true);
      });
  };

  Map.initConnection = function ($root) {
    const el = $root[0];
    if (el.dataset.initialized) return;
    el.dataset.initialized = 'true';
    Map.bindConnection(el);
  };

  Widgets.watchDOMForComponent(Map.selectorPanel, Map.initPanel);
  Widgets.watchDOMForComponent(Map.selectorConnection, Map.initConnection);
})(
  window.jQuery,
  window.Widgets.Map,
  window.Widgets,
  window.Widgets.Events,
  document,
  window
);
