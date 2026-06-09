window.Widgets = window.Widgets || {};
window.Widgets.Map = window.Widgets.Map || {};

(function ($, Map, Widgets, Events, Connection, document, window) {
  'use strict';

  Map.selectorPanel = '[data-widget="maps-panel"]';
  /** Distinct from nugget type colours — @spiderfeet/.docs/analysis/force_graph_colour_scheme.md */
  Map.FIXTURE_POSITIVE_COLOUR = '#57534E';
  Map.FIXTURE_NEGATIVE_COLOUR = '#991B1B';
  Map.NUGGET_FALLBACK = '#3b82f6';
  Map.SERVICE_ICON = 'icon_software_used.svg';
  Map.ICON_BASE = 'icons/';

  Map.FIXTURE_LEGEND = [
    { category: 'positive', label: 'Positive fixture', colour: Map.FIXTURE_POSITIVE_COLOUR },
    { category: 'negative', label: 'Negative fixture', colour: Map.FIXTURE_NEGATIVE_COLOUR },
  ];

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
  Map._graphTotals = null;
  Map._fixtureFilters = { positive: true, negative: true };
  Map._serviceStateFilters = {
    'passes-tests': true,
    'needs-subscription': false,
    error: false,
  };

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

  Map.countPayloadInventory = function (payload) {
    let serviceCount = 0;
    let nuggetCount = 0;
    (payload?.nodes || []).forEach((node) => {
      if (node.kind === 'osint-service') {
        serviceCount += 1;
      } else {
        nuggetCount += 1;
      }
    });
    return {
      nugget_count: nuggetCount,
      service_count: serviceCount,
      link_count: (payload?.links || []).length,
    };
  };

  Map.setInventoryField = function (root, name, value) {
    const el = root.querySelector(`[data-count="${name}"]`);
    if (el) {
      el.textContent = value == null ? '—' : String(value);
    }
  };

  Map.updateInventoryDisplay = function (visible, total) {
    const root = document.getElementById('map-inventory');
    if (!root) return;
    const totals = total || Map._graphTotals;

    if (totals) {
      Map.setInventoryField(root, 'nuggets-total', totals.nugget_count);
      Map.setInventoryField(root, 'services-total', totals.service_count);
      Map.setInventoryField(root, 'links-total', totals.link_count);
    }

    if (visible != null) {
      Map.setInventoryField(root, 'nuggets-visible', visible.nugget_count);
      Map.setInventoryField(root, 'services-visible', visible.service_count);
      Map.setInventoryField(root, 'links-visible', visible.link_count);
    }
  };

  Map.setInventory = function (inventory) {
    if (!inventory) return;
    Map._graphTotals = {
      nugget_count: inventory.nugget_count,
      service_count: inventory.service_count,
      link_count: inventory.link_count,
    };
    Map.updateInventoryDisplay(null, Map._graphTotals);
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
    document.querySelectorAll('#map-fixture-filters [data-fixture-filter]').forEach((input) => {
      input.disabled = !enabled;
    });
    document.querySelectorAll('#map-service-state-filters [data-service-state-filter]').forEach((input) => {
      input.disabled = !enabled;
    });
  };

  Map.fixtureCategoryForService = function (node) {
    return String(node.fixture_category || 'positive').toLowerCase() === 'negative'
      ? 'negative'
      : 'positive';
  };

  Map.serviceColour = function (fixtureCategory) {
    return fixtureCategory === 'negative'
      ? Map.FIXTURE_NEGATIVE_COLOUR
      : Map.FIXTURE_POSITIVE_COLOUR;
  };

  Map.serviceFilterBucket = function (node) {
    if (node.kind !== 'osint-service') return null;
    const state = String(node.service_state || 'in-test').toLowerCase();
    if (state === 'error') return 'error';
    if (node.requires_api_key) return 'needs-subscription';
    return 'passes-tests';
  };

  Map.serviceMatchesFilters = function (node) {
    const bucket = Map.serviceFilterBucket(node);
    return Boolean(bucket && Map._serviceStateFilters[bucket]);
  };

  Map.fixtureMatchesFilters = function (node) {
    const category = Map.fixtureCategoryForService(node);
    return Boolean(Map._fixtureFilters[category]);
  };

  Map.applyGraphFilters = function (payload) {
    const visibleServices = new Set();
    (payload.nodes || []).forEach((node) => {
      if (node.kind !== 'osint-service') return;
      if (!Map.fixtureMatchesFilters(node)) return;
      if (!Map.serviceMatchesFilters(node)) return;
      visibleServices.add(node.id);
    });

    const visibleNuggets = new Set();
    (payload.links || []).forEach((link) => {
      if (visibleServices.has(link.source)) {
        visibleNuggets.add(link.target);
      }
    });

    const filteredNodes = (payload.nodes || []).filter((node) => {
      if (node.kind === 'osint-service') {
        return visibleServices.has(node.id);
      }
      return visibleNuggets.has(node.id);
    });

    const visibleNodeIds = new Set(filteredNodes.map((node) => node.id));
    const filteredLinks = (payload.links || []).filter(
      (link) => visibleNodeIds.has(link.source) && visibleNodeIds.has(link.target)
    );

    return { nodes: filteredNodes, links: filteredLinks };
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

  Map.fixtureLegendSwatch = function (entry, mode) {
    if (mode === 'icons') {
      return `<span class="legend-swatch legend-swatch-ring" style="--swatch-colour:${entry.colour}"></span>`;
    }
    return `<span class="legend-swatch" style="background-color:${entry.colour}"></span>`;
  };

  Map.renderLegend = function (mode) {
    const root = document.getElementById('map-legend');
    if (!root) return;

    const swatchClass =
      mode === 'icons' ? 'legend-swatch legend-swatch-rounded' : 'legend-swatch';

    const rows = [];
    rows.push('<div class="legend-section-label">Fixture categories</div>');
    Map.FIXTURE_LEGEND.forEach((entry) => {
      rows.push(Map.legendRow(Map.fixtureLegendSwatch(entry, mode), entry.label));
    });

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
      const fixtureCategory = isService ? Map.fixtureCategoryForService(n) : null;
      const serviceColour = isService ? Map.serviceColour(fixtureCategory) : null;
      return {
        id: n.id,
        group: isService ? 'service' : 'nugget',
        label: n.label || n.id,
        r: isService ? 14 : 7,
        iconSize: isService ? 40 : 28,
        iconUrl: Map.resolveNodeIconUrl(n),
        iconFallbackUrl: isService ? Map.iconUrl(Map.SERVICE_ICON) : null,
        colour: isService ? serviceColour : n.colour || Map.NUGGET_FALLBACK,
        fixtureColour: serviceColour,
        meta: {
          service_state: n.service_state,
          fixture_category: fixtureCategory,
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
    Map._graphTotals = Map.countPayloadInventory(payload);
    const generation = ++Map._renderGeneration;

    if (Map._graphInstance) {
      Map._graphInstance.destroy();
      Map._graphInstance = null;
    }

    const filtered = Map.applyGraphFilters(payload);
    Map.updateInventoryDisplay(Map.countPayloadInventory(filtered), Map._graphTotals);
    const { nodes, links } = Map.transformGraph(filtered);

    if (!nodes.length) {
      Map.showEmpty(true);
      document.getElementById('map-node-count').textContent = '';
      Map.setStatus('Connected — no nodes match current filters');
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

  Map.setFixtureFilter = function (category, enabled) {
    if (category !== 'positive' && category !== 'negative') return;
    Map._fixtureFilters[category] = Boolean(enabled);
    if (Map._lastGraphPayload) {
      Map.renderGraph(Map._lastGraphPayload);
    }
  };

  Map.setServiceStateFilter = function (bucket, enabled) {
    if (!Object.prototype.hasOwnProperty.call(Map._serviceStateFilters, bucket)) return;
    Map._serviceStateFilters[bucket] = Boolean(enabled);
    if (Map._lastGraphPayload) {
      Map.renderGraph(Map._lastGraphPayload);
    }
  };

  Map.syncFilterControls = function () {
    document.querySelectorAll('#map-fixture-filters [data-fixture-filter]').forEach((input) => {
      input.checked = Boolean(Map._fixtureFilters[input.dataset.fixtureFilter]);
    });
    document.querySelectorAll('#map-service-state-filters [data-service-state-filter]').forEach((input) => {
      input.checked = Boolean(Map._serviceStateFilters[input.dataset.serviceStateFilter]);
    });
  };

  Map.onConnectionChange = function (connected, status) {
    const serverUp = Boolean(status?.server_reachable ?? connected);
    const dbReady = Boolean(status?.database_ready);
    Map._connected = serverUp && dbReady;
    Map.setControlsEnabled(Map._connected);
    if (status?.inventory) {
      Map.setInventory(status.inventory);
    }
    if (!status) {
      Map.showEmpty(true);
      Map.setStatus('Waiting for API connection…');
      return;
    }
    if (!serverUp) {
      Map.showEmpty(true);
      Map.setStatus('TypeDB server unreachable — check server and .config/typedb.connection.json');
      return;
    }
    if (status.bootstrapped) {
      Map.setStatus(`Recreated map database ${status.database} — loading graph…`);
    } else if (dbReady) {
      Map.setStatus(`Map database ready (${status.database})`);
    } else {
      Map.setStatus(`TypeDB server OK but map database ${status.database} is not ready`);
    }
    if (Map._connected && document.getElementById('pane-maps')?.classList.contains('active')) {
      Map.loadGraph();
    } else if (!dbReady) {
      Map.showEmpty(true);
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

    el.querySelectorAll('#map-fixture-filters [data-fixture-filter]').forEach((input) => {
      input.addEventListener('change', () => {
        Map.setFixtureFilter(input.dataset.fixtureFilter, input.checked);
      });
    });

    el.querySelectorAll('#map-service-state-filters [data-service-state-filter]').forEach((input) => {
      input.addEventListener('change', () => {
        Map.setServiceStateFilter(input.dataset.serviceStateFilter, input.checked);
      });
    });

    Map.syncFilterControls();
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
