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

  CliScanApp.create = function (config) {
    const container = config.container;
    if (!container) throw new Error('CliScanApp.create requires container');

    const instanceId = config.instanceId || uid('cli-scan');
    const mode = config.mode === 'edit-run' ? 'edit-run' : 'view';
    const contentBase = config.dataSource?.contentBase || '/content';
    const corpusBase = config.dataSource?.corpusBase || '/cli-corpus';

    const state = {
      instanceId,
      mode,
      toolId: config.toolId || '',
      scenarioKey: config.scenarioKey || null,
      detail: config.detail || null,
      contentBase,
      corpusBase,
      schema: null,
      manifest: null,
      values: {},
      graphInstance: null,
      graphRenderGeneration: 0,
      shadowDescriptors: false,
      legendVisible: true,
      graphFullscreen: false,
      priorExamTab: null,
      viewer: null,
      frameId: `data-viewer-${instanceId}`,
    };

    state.container = container;
    container.innerHTML = CliScanApp._shellHtml(state);
    CliScanApp._instances.set(instanceId, state);
    CliScanApp._wireTabs(container, state);
    CliScanApp._wireRail(container, state);
    CliScanApp.load(state, config).catch((err) => {
      console.error('CliScanApp.load failed', err);
      CliScanApp._setStatus(container, state, err.message);
    });
    return {
      instanceId,
      reload: (next) => CliScanApp.load(state, next),
      destroy: () => CliScanApp.destroy(state),
    };
  };

  CliScanApp.destroy = function (state) {
    if (state.graphInstance) {
      state.graphInstance.destroy();
      state.graphInstance = null;
    }
    CliScanApp._instances.delete(state.instanceId);
  };

  CliScanApp.load = async function (state, config) {
    const container = state.container || document.querySelector(`[data-cli-scan-id="${state.instanceId}"]`);
    state.container = container;
    if (config.toolId) state.toolId = config.toolId;
    if (config.scenarioKey) state.scenarioKey = config.scenarioKey;
    if (config.detail) state.detail = config.detail;
    if (config.mode) state.mode = config.mode === 'edit-run' ? 'edit-run' : 'view';

    CliScanApp._setStatus(container, state, `Loading ${state.toolId}…`);

    try {
      const [schema, manifest] = await Promise.all([
        Connection.fetchJson(`${state.contentBase}/tools/${encodeURIComponent(state.toolId)}/options-schema`),
        Connection.fetchJson(`${state.contentBase}/tools/${encodeURIComponent(state.toolId)}`),
      ]);
      state.schema = schema;
      state.manifest = manifest;
    } catch (err) {
      console.warn('CliScanApp: content API unavailable, Scan tab limited', err);
      state.schema = { tool_id: state.toolId, groups: ['General'], flags: [] };
      state.manifest = { tool_id: state.toolId, executable: state.toolId };
    }
    state.values = CliScanApp._initialValues(state.schema, state.detail);

    CliScanApp._renderScanForm(container, state);
    CliScanApp._updateCommandPreview(container, state);

    if (state.detail) {
      CliScanApp._renderOutputs(container, state);
    }

    CliScanApp._setStatus(container, state, `Ready — ${state.toolId}${state.scenarioKey ? ` / ${state.scenarioKey}` : ''}`);
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
    <div class="tab-pane fade show active h-100" id="${id}-pane-scan" role="tabpanel">
      <div class="row g-0 h-100">
        <div class="col-12 col-lg-9 border-end cli-scan-form-col overflow-auto p-3" data-cli-scan-form></div>
        <div class="col-12 col-lg-3 cli-scan-rail p-3 d-flex flex-column gap-2">
          <div class="d-grid gap-2" data-cli-scan-rail-actions></div>
          <label class="small fw-semibold mt-2">Command preview</label>
          <pre class="cli-scan-command-preview small bg-body-secondary bg-opacity-25 border rounded p-2 mb-0" data-cli-scan-command></pre>
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
    container.querySelectorAll('.cli-scan-tabs [data-bs-toggle="tab"]').forEach((tab) => {
      tab.addEventListener('shown.bs.tab', () => {
        if (tab.id === `${state.instanceId}-tab-graph` && state.detail?.graph_proposal) {
          setTimeout(() => CliScanApp.renderProposalGraph(container, state, state.detail.graph_proposal), 50);
        }
      });
    });
    window.addEventListener('shell:theme-changed', () => {
      if (state.detail?.structured?.content) CliScanApp.pushStructuredToViewer(container, state);
    });
  };

  CliScanApp._wireRail = function (container, state) {
    const actions = container.querySelector('[data-cli-scan-rail-actions]');
    if (!actions) return;
    actions.innerHTML = `
      <button type="button" class="btn btn-outline-secondary btn-sm" data-cli-scan-modal-btn="options">Options</button>
      <button type="button" class="btn btn-outline-secondary btn-sm" data-cli-scan-modal-btn="graph-structure">Graph Structure</button>
      <button type="button" class="btn btn-outline-secondary btn-sm" data-cli-scan-modal-btn="zero-to-hero">User Guide</button>`;

    actions.querySelectorAll('[data-cli-scan-modal-btn]').forEach((btn) => {
      btn.addEventListener('click', () => CliScanApp._openModal(container, state, btn.dataset.cliScanModalBtn));
    });
  };

  CliScanApp._initialValues = function (schema, detail) {
    const values = {};
    (schema?.flags || []).forEach((f) => {
      values[f.id] = f.default ?? (f.type === 'boolean' ? false : '');
    });
    if (detail?.command) {
      values.__captured_command = detail.command.trim();
    }
    return values;
  };

  CliScanApp._renderScanForm = function (container, state) {
    const root = container.querySelector('[data-cli-scan-form]');
    if (!root || !state.schema) return;
    const readOnly = state.mode === 'view';
    const groups = state.schema.groups || ['General'];
    const byGroup = {};
    groups.forEach((g) => { byGroup[g] = []; });
    (state.schema.flags || []).forEach((flag) => {
      const g = flag.group || 'General';
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push(flag);
    });

    const parts = [];
    if (readOnly && state.values.__captured_command) {
      parts.push(`<p class="small text-body-secondary">Captured examination command (read-only view mode).</p>`);
    }

    groups.forEach((groupName, gi) => {
      const flags = byGroup[groupName] || [];
      if (!flags.length) return;
      const collapse = flags.length > 10;
      const body = flags.map((f) => CliScanApp._fieldHtml(f, state, readOnly)).join('');
      if (collapse) {
        parts.push(`<div class="accordion mb-2" id="${state.instanceId}-acc-${gi}"><div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button${gi ? ' collapsed' : ''}" type="button" data-bs-toggle="collapse" data-bs-target="#${state.instanceId}-acc-body-${gi}">${escHtml(groupName)}</button></h2><div id="${state.instanceId}-acc-body-${gi}" class="accordion-collapse collapse${gi ? '' : ' show'}"><div class="accordion-body">${body}</div></div></div></div>`);
      } else {
        parts.push(`<fieldset class="mb-3"><legend class="h6">${escHtml(groupName)}</legend>${body}</fieldset>`);
      }
    });

    const advanced = (state.schema.flags || []).filter((f) => f.advanced);
    if (advanced.length) {
      const advBody = advanced.map((f) => CliScanApp._fieldHtml(f, state, readOnly)).join('');
      parts.push(`<details class="mb-2"><summary class="fw-semibold">Advanced options</summary><div class="mt-2">${advBody}</div></details>`);
    }

    root.innerHTML = parts.join('');
    root.querySelectorAll('[data-cli-scan-field]').forEach((el) => {
      el.addEventListener('input', () => {
        state.values[el.dataset.cliScanField] = el.type === 'checkbox' ? el.checked : el.value;
        CliScanApp._updateCommandPreview(container, state);
      });
      el.addEventListener('change', () => {
        state.values[el.dataset.cliScanField] = el.type === 'checkbox' ? el.checked : el.value;
        CliScanApp._updateCommandPreview(container, state);
      });
    });
  };

  CliScanApp._fieldHtml = function (flag, state, readOnly) {
    const id = `${state.instanceId}-f-${flag.id}`;
    const req = flag.required ? ' <span class="text-danger" aria-hidden="true">*</span>' : '';
    const val = state.values[flag.id];
    const dis = readOnly ? ' disabled' : '';
    let input = '';
    if (flag.type === 'boolean') {
      input = `<div class="form-check"><input class="form-check-input" type="checkbox" id="${id}" data-cli-scan-field="${flag.id}"${val ? ' checked' : ''}${dis} /><label class="form-check-label" for="${id}">${escHtml(flag.label)}${req}</label></div>`;
      return `<div class="mb-2">${input}<div class="form-text">${escHtml(flag.description || '')}</div></div>`;
    }
    if (flag.type === 'select' && Array.isArray(flag.choices)) {
      const opts = flag.choices.map((c) => `<option value="${escHtml(c)}"${val === c ? ' selected' : ''}>${escHtml(c)}</option>`).join('');
      input = `<select class="form-select form-select-sm" id="${id}" data-cli-scan-field="${flag.id}"${dis}>${opts}</select>`;
    } else if (flag.type === 'integer' || flag.type === 'float') {
      input = `<input class="form-control form-control-sm" type="number" id="${id}" data-cli-scan-field="${flag.id}" value="${escHtml(val ?? '')}" placeholder="${escHtml(flag.placeholder || '')}"${dis} />`;
    } else {
      const hint = flag.type === 'path' ? ' <span class="text-body-secondary">(path)</span>' : '';
      input = `<input class="form-control form-control-sm" type="text" id="${id}" data-cli-scan-field="${flag.id}" value="${escHtml(val ?? '')}" placeholder="${escHtml(flag.placeholder || '')}"${dis} />${hint}`;
    }
    return `<div class="mb-2"><label class="form-label small mb-0" for="${id}">${escHtml(flag.label)}${req}</label>${input}<div class="form-text">${escHtml(flag.description || '')}</div></div>`;
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
    (state.schema?.flags || []).forEach((f) => {
      const v = state.values[f.id];
      if (f.type === 'boolean') {
        if (v && f.flag) tokens.push(f.flag);
        return;
      }
      if (v === '' || v == null) return;
      if (f.flag) tokens.push(f.flag, String(v));
      else if (f.id === 'target') tokens.push(String(v));
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
