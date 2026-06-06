window.Widgets = window.Widgets || {};
window.Widgets.Map = window.Widgets.Map || {};

(function ($, Map, Widgets, Events, Connection, document, window) {
  'use strict';

  Map.selectorPanel = '[data-widget="maps-panel"]';
  Map.SERVICE_COLOUR = '#57534E';
  Map.NUGGET_FALLBACK = '#3b82f6';
  Map.SERVICE_ICON = 'icon_software_used.svg';
  Map.ICON_BASE = 'icons/';

  /** Nugget type colours — @spiderfeet/.docs/analysis/force_graph_colour_scheme.md */
  Map.NUGGET_TYPE_LEGEND = [
    { type: 'ENTITY', label: 'Entity', colour: '#3B82F6' },
    { type: 'DESCRIPTOR', label: 'Descriptor', colour: '#F59E0B' },
    { type: 'DATA', label: 'Data', colour: '#14B8A6' },
    { type: 'SUBENTITY', label: 'Sub-entity', colour: '#F97316' },
    { type: 'INTERNAL', label: 'Internal', colour: '#8B5CF6' },
  ];

  Map.LINK_LEGEND = [
    { label: 'Consumed', className: 'legend-line legend-line-consumed' },
    { label: 'Produced', className: 'legend-line legend-line-produced' },
  ];

  Map._graphInstance = null;
  Map._renderGeneration = 0;
  Map._connected = false;
  Map._variant = 'default';
  Map._nodeDisplay = 'circles';
  Map._lastGraphPayload = null;

  Map.iconUrl = function (filename) {
    if (!filename) return '';
    if (Map.isRemoteIcon(filename)) return filename;
    const name = String(filename).replace(/^icons\//, '');
    return `${Map.ICON_BASE}${name}`;
  };

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
    document.querySelectorAll('#map-node-display-buttons [data-node-display]').forEach((btn) => {
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

  Map.setNodeDisplayButtons = function (active) {
    document.querySelectorAll('#map-node-display-buttons [data-node-display]').forEach((btn) => {
      const on = btn.dataset.nodeDisplay === active;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };

  Map.isRemoteIcon = function (value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value);
  };

  Map.nuggetIconFilename = function (node) {
    if (node.icon) {
      return node.icon;
    }
    return `icon_${String(node.id).toLowerCase()}.svg`;
  };

  Map.resolveNodeIconUrl = function (node) {
    if (node.kind === 'osint-service') {
      if (Map.isRemoteIcon(node.fav_icon)) {
        return node.fav_icon;
      }
      return Map.iconUrl(Map.SERVICE_ICON);
    }
    return Map.iconUrl(Map.nuggetIconFilename(node));
  };

  Map.showSpinner = function (show) {
    document.getElementById('viz-spinner')?.classList.toggle('d-none', !show);
  };

  Map.showEmpty = function (show) {
    document.getElementById('viz-empty')?.classList.toggle('d-none', !show);
  };

  Map.legendRow = function (swatchHtml, label, extraClass) {
    return `<div class="d-flex align-items-center gap-2 mb-1${extraClass ? ` ${extraClass}` : ''}">${swatchHtml}<span>${label}</span></div>`;
  };

  Map.renderLegend = function (mode) {
    const root = document.getElementById('map-legend');
    if (!root) return;

    const swatchClass =
      mode === 'icons' ? 'legend-swatch legend-swatch-rounded' : 'legend-swatch';

    const rows = [];
    rows.push(
      Map.legendRow(
        `<span class="legend-swatch" style="background-color:${Map.SERVICE_COLOUR}"></span>`,
        'OSINT service'
      )
    );

    rows.push('<div class="legend-section-label">Nugget types</div>');
    Map.NUGGET_TYPE_LEGEND.forEach((entry) => {
      rows.push(
        Map.legendRow(
          `<span class="${swatchClass}" style="background-color:${entry.colour}"></span>`,
          entry.label
        )
      );
    });

    rows.push('<div class="legend-section-label">Links</div>');
    Map.LINK_LEGEND.forEach((entry, index) => {
      rows.push(
        Map.legendRow(
          `<span class="${entry.className}"></span>`,
          entry.label,
          index > 0 ? 'mt-1' : ''
        )
      );
    });

    root.innerHTML = rows.join('');
  };

  Map.transformGraph = function (payload) {
    const nodes = (payload.nodes || []).map((n) => {
      const isService = n.kind === 'osint-service';
      const nuggetIcon = Map.nuggetIconFilename(n);
      return {
        id: n.id,
        group: isService ? 'service' : 'nugget',
        label: n.label || n.id,
        r: isService ? 14 : 7,
        iconSize: isService ? 40 : 28,
        iconUrl: Map.resolveNodeIconUrl(n),
        iconFallbackUrl: isService ? Map.iconUrl(Map.SERVICE_ICON) : null,
        colour: n.colour || (isService ? Map.SERVICE_COLOUR : Map.NUGGET_FALLBACK),
        meta: {
          service_state: n.service_state,
          kind: n.kind,
          icon: isService ? n.fav_icon : nuggetIcon,
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

  Map.whenVizStageReady = function (callback) {
    const stage = document.getElementById('viz-stage');
    if (!stage) {
      callback();
      return;
    }
    let attempts = 0;
    const tryReady = () => {
      const rect = stage.getBoundingClientRect();
      if (rect.width > 20 && rect.height > 20) {
        callback();
        return;
      }
      attempts += 1;
      if (attempts > 60) {
        callback();
        return;
      }
      requestAnimationFrame(tryReady);
    };
    tryReady();
  };

  Map.renderGraph = function (payload) {
    Map._lastGraphPayload = payload;
    const generation = ++Map._renderGeneration;

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

    Map.whenVizStageReady(() => {
      if (generation !== Map._renderGeneration) {
        return;
      }
      try {
        Map._mountGraph(nodes, links);
      } catch (err) {
        console.error('Map.renderGraph failed', err);
        Map.showEmpty(true);
        Map.setStatus(`Graph render failed: ${err.message}`);
      }
    });
  };

  Map._mountGraph = function (nodes, links) {
    Map._graphInstance = Viz.ForceGraph.create({
      svg: '#graph',
      tooltip: '#tooltip',
      nodes,
      links,
      variant: Map._variant,
      nodeDisplay: Map._nodeDisplay,
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
    Map.renderLegend(Map._nodeDisplay);
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

  Map.setNodeDisplay = function (mode) {
    if (mode !== 'circles' && mode !== 'icons') return;
    Map._nodeDisplay = mode;
    Map.setNodeDisplayButtons(mode);
    Map.renderLegend(mode);
    if (Map._lastGraphPayload) {
      Map.renderGraph(Map._lastGraphPayload);
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

    el.querySelectorAll('#map-node-display-buttons [data-node-display]').forEach((btn) => {
      btn.addEventListener('click', () => Map.setNodeDisplay(btn.dataset.nodeDisplay));
    });

    Map.setVariantButtons(Map._variant);
    Map.setNodeDisplayButtons(Map._nodeDisplay);
    Map.renderLegend(Map._nodeDisplay);
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

  function bootMapLegend() {
    if (document.getElementById('map-legend')) {
      Map.renderLegend(Map._nodeDisplay);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootMapLegend);
  } else {
    bootMapLegend();
  }
})(
  window.jQuery,
  window.Widgets.Map,
  window.Widgets,
  window.Widgets.Events,
  window.Widgets.Connection,
  document,
  window
);
