window.Widgets = window.Widgets || {};
window.Widgets.Map = window.Widgets.Map || {};

(function ($, Map, Widgets, Events, Connection, document, window) {
  'use strict';

  Map.selectorPanel = '[data-widget="maps-panel"]';
  Map.SERVICE_COLOUR = '#6366f1';
  Map.NUGGET_FALLBACK = '#3b82f6';

  Map._graphInstance = null;
  Map._connected = false;
  Map._variant = 'default';

  Map.setStatus = function (message) {
    const el = document.getElementById('map-status-text');
    if (el) el.textContent = message;
  };

  Map.setInventory = function (inventory) {
    const root = document.getElementById('map-inventory');
    if (!root || !inventory) return;
    root.querySelector('[data-count="nuggets"]').textContent = inventory.nugget_count;
    root.querySelector('[data-count="services"]').textContent = inventory.service_count;
    root.querySelector('[data-count="links"]').textContent = inventory.link_count;
  };

  Map.setControlsEnabled = function (enabled) {
    document.querySelectorAll('#pane-maps [data-action="refresh-graph"]').forEach((btn) => {
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

  Map.loadGraph = async function () {
    if (!Map._connected) {
      Map.showEmpty(true);
      Map.setStatus('Connect to the API before loading the graph');
      return;
    }

    Map.showSpinner(true);
    Map.showEmpty(false);

    try {
      const graph = await Connection.fetchJson('/map/graph');
      Map.renderGraph(graph);
    } catch (err) {
      Map.showEmpty(true);
      Map.setStatus(`Graph load failed: ${err.message}`);
    } finally {
      Map.showSpinner(false);
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

  Map.onConnectionChange = function (connected, status) {
    Map._connected = connected;
    Map.setControlsEnabled(connected);
    if (status?.inventory) {
      Map.setInventory(status.inventory);
    }
    if (connected) {
      Map.setStatus(`TypeDB reachable (${status?.database || 'spiderfeet-map'})`);
      if (document.getElementById('pane-maps')?.classList.contains('active')) {
        Map.loadGraph();
      }
    } else {
      Map.showEmpty(true);
      Map.setStatus(
        status ? 'API reachable but TypeDB is not' : 'Waiting for API connection…'
      );
    }
  };

  Map.initPanel = function ($root) {
    const el = $root[0];
    if (el.dataset.initialized) return;
    el.dataset.initialized = 'true';

    el.querySelectorAll('[data-action="refresh-graph"]').forEach((btn) => {
      btn.addEventListener('click', () => Map.loadGraph());
    });

    el.querySelectorAll('#map-layout-buttons [data-variant]').forEach((btn) => {
      btn.addEventListener('click', () => Map.setVariant(btn.dataset.variant));
    });

    Map.setVariantButtons(Map._variant);
    Map.setControlsEnabled(Connection.isConnected());
    Map.showEmpty(true);

    Connection.onStatusChange(Map.onConnectionChange);
    if (Connection._lastStatus) {
      Map.onConnectionChange(Connection.isConnected(), Connection._lastStatus);
    }

    window.addEventListener('shell:tab-changed', (event) => {
      if (event.detail?.tabId === 'maps' && Map._connected && !Map._graphInstance) {
        Map.loadGraph();
      }
    });
  };

  Widgets.watchDOMForComponent(Map.selectorPanel, Map.initPanel);
})(
  window.jQuery,
  window.Widgets.Map,
  window.Widgets,
  window.Widgets.Events,
  window.Widgets.Connection,
  document,
  window
);
