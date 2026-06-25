window.Widgets = window.Widgets || {};
window.Widgets.Profiling = window.Widgets.Profiling || {};

(function ($, Profiling, Widgets, Connection, DataViewerHost, document, window) {
  'use strict';

  Profiling.selectorPanel = '[data-widget="profiling-panel"]';
  Profiling._tools = [];
  Profiling._scenarios = [];
  Profiling._detail = null;
  Profiling._graphInstance = null;
  Profiling._currentTool = null;
  Profiling._currentScenarioKey = null;
  Profiling._graphFullscreen = false;
  Profiling._priorExamTab = null;
  Profiling._graphRenderGeneration = 0;
  Profiling.frameId = 'data-viewer-profiling';
  Profiling._viewer = null;
  Profiling._shadowDescriptors = false;
  Profiling._shadowEntities = false;
  Profiling._legendVisible = true;
  Profiling.ICON_BASE = 'icons/';

  Profiling.META_NUGGET_IDS = new Set([
    'SCAN_RECORD',
    'SCAN_CLI',
    'SCAN_VERSION',
    'SCAN_START',
    'SCAN_TARGET',
    'SCAN_TOOL',
    'SCAN_SUMMARY',
    'SCAN_ELAPSED',
  ]);

  /** @spiderfeet/.docs/analysis/force_graph_colour_scheme.md */
  Profiling.NUGGET_TYPE_COLOUR = {
    ENTITY: '#3B82F6',
    DESCRIPTOR: '#F59E0B',
    DATA: '#14B8A6',
    SUBENTITY: '#F97316',
    INTERNAL: '#8B5CF6',
    CATEGORY: '#14B8A6',
  };

  Profiling.NUGGET_TYPE_LEGEND = [
    { type: 'ENTITY', label: 'Entity', colour: '#3B82F6' },
    { type: 'DESCRIPTOR', label: 'Descriptor', colour: '#F59E0B' },
    { type: 'CATEGORY', label: 'Category', colour: '#14B8A6' },
  ];

  Profiling.LINK_LEGEND = [
    { label: 'contains', className: 'legend-line' },
    { label: 'had (dashed)', className: 'legend-line legend-line-had' },
    { label: 'listens-to', className: 'legend-line legend-line-produced' },
  ];

  Profiling.NODE_DISPLAY_LEGEND = [
    { label: 'Catalogue icon', className: 'legend-swatch legend-swatch-rounded' },
    { label: 'No icon — titled tile', className: 'legend-swatch legend-swatch-rounded' },
  ];

  Profiling.reviewBadgeClass = function (status) {
    if (status === 'approved') return 'text-bg-success';
    if (status === 'rejected') return 'text-bg-danger';
    return 'text-bg-secondary';
  };

  Profiling.artifactBadges = function (row) {
    const parts = [
      ['txt', row.has_text],
      ['data', row.has_structured],
      ['graph', row.has_graph],
      ['md', row.has_markdown],
    ];
    return parts
      .map(([label, ok]) => {
        const cls = ok ? 'text-bg-success' : 'text-bg-warning';
        return `<span class="badge rounded-pill ${cls} me-1">${label}</span>`;
      })
      .join('');
  };

  Profiling.setStatus = function (message) {
    const el = document.getElementById('profiling-status-text');
    if (el) el.textContent = message;
  };

  Profiling.showView = function (view) {
    if (view !== 'detail' && Profiling._graphFullscreen) {
      Profiling.setGraphFullscreen(false);
    }
    const scroll = document.getElementById('profiling-main-scroll');
    if (scroll) {
      scroll.classList.toggle('overflow-auto', view !== 'detail');
      scroll.classList.toggle('overflow-hidden', view === 'detail');
    }
    const detailEl = document.getElementById('profiling-view-detail');
    if (detailEl) {
      detailEl.classList.toggle('d-flex', view === 'detail');
      detailEl.classList.toggle('flex-column', view === 'detail');
      detailEl.classList.toggle('flex-grow-1', view === 'detail');
      detailEl.classList.toggle('min-h-0', view === 'detail');
    }
    ['tools', 'structure', 'exams', 'detail'].forEach((name) => {
      const el = document.getElementById(`profiling-view-${name}`);
      if (el) el.classList.toggle('d-none', name !== view);
    });
    document.getElementById('profiling-back-tools')?.classList.toggle('d-none', view === 'tools');
    document.getElementById('profiling-back-exams')?.classList.toggle('d-none', view !== 'detail');
  };

  Profiling.destroyGraph = function () {
    if (Profiling._graphInstance) {
      Profiling._graphInstance.destroy();
      Profiling._graphInstance = null;
    }
  };

  Profiling.iconUrlForNugget = function (nuggetId) {
    if (!nuggetId) return '';
    const name = `icon_${String(nuggetId).toLowerCase()}.svg`;
    return `${Profiling.ICON_BASE}${name}`;
  };

  Profiling.colourForNode = function (node) {
    const t = String(node.nugget_type || 'ENTITY').toUpperCase();
    return Profiling.NUGGET_TYPE_COLOUR[t] || Profiling.NUGGET_TYPE_COLOUR.ENTITY;
  };

  Profiling.legendRow = function (swatchHtml, label, extraClass) {
    return `<div class="d-flex align-items-center gap-2 mb-1${extraClass ? ` ${extraClass}` : ''}">${swatchHtml}<span>${label}</span></div>`;
  };

  Profiling.renderLegend = function () {
    const root = document.getElementById('profiling-graph-legend');
    if (!root) return;
    root.classList.toggle('profiling-graph-legend-hidden', !Profiling._legendVisible);

    const rows = [];
    rows.push('<div class="legend-section-label">Nugget types</div>');
    Profiling.NUGGET_TYPE_LEGEND.forEach((entry) => {
      rows.push(
        Profiling.legendRow(
          `<span class="legend-swatch legend-swatch-rounded" style="background-color:${entry.colour}"></span>`,
          entry.label
        )
      );
    });

    rows.push('<div class="legend-section-label mt-2">Node display</div>');
    rows.push(
      Profiling.legendRow(
        `<span class="legend-swatch legend-swatch-rounded" style="background-color:#3B82F6"></span>`,
        'Icon when catalogue SVG exists'
      )
    );
    rows.push(
      Profiling.legendRow(
        `<span class="legend-swatch legend-swatch-rounded" style="background-color:#3B82F6;color:#fff;font-size:0.55rem;line-height:12px;text-align:center">ID</span>`,
        'Titled tile when icon missing'
      )
    );

    rows.push('<div class="legend-section-label mt-2">Relations</div>');
    Profiling.LINK_LEGEND.forEach((entry, index) => {
      rows.push(
        Profiling.legendRow(`<span class="${entry.className}"></span>`, entry.label, index > 0 ? 'mt-1' : '')
      );
    });

    root.innerHTML = rows.join('');
  };

  Profiling.setLegendVisible = function (visible) {
    Profiling._legendVisible = Boolean(visible);
    const btn = document.getElementById('profiling-legend-toggle');
    const legend = document.getElementById('profiling-graph-legend');
    if (btn) {
      btn.setAttribute('aria-pressed', Profiling._legendVisible ? 'false' : 'true');
      btn.textContent = Profiling._legendVisible ? 'Hide legend' : 'Show legend';
      btn.title = Profiling._legendVisible ? 'Hide graph legend' : 'Show graph legend';
    }
    if (legend) {
      legend.classList.toggle('profiling-graph-legend-hidden', !Profiling._legendVisible);
    }
  };

  Profiling.toggleLegend = function () {
    Profiling.setLegendVisible(!Profiling._legendVisible);
  };

  Profiling.setShadowToggleStates = function () {
    const descriptors = document.getElementById('profiling-shadow-descriptors');
    const entities = document.getElementById('profiling-shadow-entities');
    if (descriptors) {
      descriptors.checked = Profiling._shadowDescriptors;
      descriptors.setAttribute('aria-checked', Profiling._shadowDescriptors ? 'true' : 'false');
    }
    if (entities) {
      entities.checked = Profiling._shadowEntities;
      entities.setAttribute('aria-checked', Profiling._shadowEntities ? 'true' : 'false');
    }
  };

  Profiling.isMetaNugget = function (node) {
    const nuggetId = String(node.nugget_id || node.id || '').toUpperCase();
    const nuggetType = String(node.nugget_type || '').toUpperCase();
    return nuggetType === 'CATEGORY' || Profiling.META_NUGGET_IDS.has(nuggetId);
  };

  Profiling.applyShadowOptions = function (proposal) {
    let graph = proposal || { nodes: [], edges: [] };
    const shadows = window.Widgets?.GraphShadows;
    if (!shadows) return graph;

    if (Profiling._shadowDescriptors) {
      graph = shadows.apply(graph, {
        mode: 'descriptors',
        edgeRoles: ['had', 'has_this'],
        shouldShadowTarget: (node) => String(node.nugget_type || '').toUpperCase() === 'DESCRIPTOR',
      });
    }
    if (Profiling._shadowEntities) {
      graph = shadows.apply(graph, {
        mode: 'entities',
        edgeRoles: ['contains', 'contains_this'],
        shouldShadowTarget: (node) => {
          const type = String(node.nugget_type || '').toUpperCase();
          return (type === 'ENTITY' || type === 'SUBENTITY') && !Profiling.isMetaNugget(node);
        },
      });
    }
    return graph;
  };

  Profiling.transformProposalGraph = function (proposal) {
    if (!proposal?.nodes?.length) {
      return { nodes: [], links: [] };
    }

    const nodes = proposal.nodes.map((n) => {
      const nuggetId = n.nugget_id || n.id;
      const colour = Profiling.colourForNode(n);
      return {
        id: n.id,
        group: 'nugget',
        label: nuggetId,
        shortLabel: nuggetId,
        r: 10,
        iconSize: 28,
        colour,
        iconUrl: Profiling.iconUrlForNugget(nuggetId),
        isShadow: Boolean(n.is_shadow),
        meta: {
          nugget_type: n.nugget_type,
          data: n.data || n.nugget_data,
          kind: 'nugget',
          shadow_of: n.shadow_of || n.meta?.shadow_of,
          shadow_mode: n.meta?.shadow_mode,
        },
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

  Profiling.whenGraphStageReady = function (callback) {
    const stage = document.getElementById('profiling-graph-stage');
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

  Profiling.setGraphFullscreen = function (on) {
    const root = document.getElementById('profiling-view-detail');
    const btn = document.getElementById('profiling-graph-fullscreen');
    if (!root) return;

    Profiling._graphFullscreen = Boolean(on);
    root.classList.toggle('profiling-graph-host-fullscreen', Profiling._graphFullscreen);

    if (btn) {
      btn.setAttribute('aria-pressed', Profiling._graphFullscreen ? 'true' : 'false');
      btn.textContent = Profiling._graphFullscreen ? 'Exit full screen' : 'Full screen';
      btn.title = Profiling._graphFullscreen ? 'Return graph to tab' : 'Expand graph to full screen';
    }

    if (Profiling._graphFullscreen) {
      const tabList = document.getElementById('profiling-exam-tabs');
      const graphBtn = document.getElementById('profiling-tab-graph');
      const active = tabList?.querySelector('.nav-link.active');
      if (active && active !== graphBtn) {
        Profiling._priorExamTab = active;
      }
      if (graphBtn && window.bootstrap?.Tab) {
        window.bootstrap.Tab.getOrCreateInstance(graphBtn).show();
      }
    } else if (Profiling._priorExamTab && window.bootstrap?.Tab) {
      window.bootstrap.Tab.getOrCreateInstance(Profiling._priorExamTab).show();
      Profiling._priorExamTab = null;
    }

    window.setTimeout(() => {
      if (Profiling._detail?.graph_proposal) {
        Profiling.renderProposalGraph(Profiling._detail.graph_proposal);
      }
    }, 80);
  };

  Profiling.toggleGraphFullscreen = function () {
    Profiling.setGraphFullscreen(!Profiling._graphFullscreen);
  };

  Profiling.renderProposalGraph = function (proposal) {
    Profiling._lastGraphProposal = proposal;
    const generation = ++Profiling._graphRenderGeneration;
    Profiling.destroyGraph();

    const stage = document.getElementById('profiling-graph-stage');
    const stats = document.getElementById('profiling-graph-stats');
    const svgEl = document.getElementById('profiling-graph-svg');
    if (!stage || !svgEl || !window.Viz?.ForceGraph) return;

    Profiling.setShadowToggleStates();
    const displayProposal = Profiling.applyShadowOptions(proposal);
    const { nodes, links } = Profiling.transformProposalGraph(displayProposal);
    if (!nodes.length) {
      window.Viz.Core.clear(window.Viz.Core.selectSvg(svgEl));
      if (stats) stats.textContent = 'No proposed graph';
      Profiling.renderLegend();
      return;
    }

    Profiling.whenGraphStageReady(() => {
      if (generation !== Profiling._graphRenderGeneration) return;
      try {
        Profiling._graphInstance = window.Viz.ForceGraph.create({
          svg: '#profiling-graph-svg',
          tooltip: '#profiling-graph-tooltip',
          nodes,
          links,
          variant: 'default',
          nodeDisplay: 'icons',
          linkLabels: true,
          linkDistance: (l) => (l.role === 'had' ? 40 : 80),
        });
        const shadowCount = displayProposal.shadow_meta?.shadow_count || 0;
        const shadowText = shadowCount ? ` · ${shadowCount} shadows` : '';
        if (stats) stats.textContent = `${nodes.length} nodes · ${links.length} links${shadowText}`;
        Profiling.renderLegend();
      } catch (err) {
        console.error('Profiling.renderProposalGraph failed', err);
        if (stats) stats.textContent = `Graph error: ${err.message}`;
      }
    });
  };

  Profiling.ensureViewer = function () {
    if (Profiling._viewer) {
      Profiling._viewer.ensure();
      return Profiling._viewer;
    }

    Profiling._viewer = DataViewerHost.create({
      instanceId: Profiling.frameId,
      iframe: `#${Profiling.frameId}`,
      tabButton: '#profiling-tab-structured',
      importExportRoot: '/cli-corpus',
      fullscreenRoot: '#profiling-view-detail',
      structuredTabButton: '#profiling-tab-structured',
      tabListSelector: '#profiling-exam-tabs',
      onReady: () => Profiling.pushStructuredToViewer(),
    });

    return Profiling._viewer;
  };

  Profiling.pushStructuredToViewer = function () {
    const viewer = Profiling.ensureViewer();
    const structured = Profiling._detail?.structured;
    if (!structured?.content) {
      viewer.clear();
      return;
    }
    viewer.setPayload({
      content: structured.content,
      filename: structured.filename,
      format: structured.format,
    });
  };

  Profiling.renderMarkdownDoc = function (el, markdown, emptyMessage) {
    if (!el) return;
    const renderer = window.Widgets?.Markdown;
    if (markdown) {
      if (renderer) {
        el.innerHTML = renderer.render(markdown);
      } else {
        el.textContent = markdown;
      }
      return;
    }
    el.innerHTML = `<p class="text-body-secondary">${emptyMessage}</p>`;
  };

  Profiling.renderDetail = function (detail) {
    Profiling._detail = detail;
    Profiling._currentScenarioKey = detail.scenario_key;

    const title = document.getElementById('profiling-detail-title');
    if (title) {
      const name = detail.manifest?.scenario_name || detail.scenario_key;
      title.textContent = `${detail.tool_id} — ${name}`;
    }

    const badge = document.getElementById('profiling-detail-review-badge');
    if (badge) {
      badge.textContent = detail.review_status || 'pending';
      badge.className = `badge rounded-pill ${Profiling.reviewBadgeClass(detail.review_status)}`;
    }

    const text = document.getElementById('profiling-output-text');
    if (text) text.textContent = detail.output_text || '(empty text output)';

    const md = document.getElementById('profiling-markdown-body');
    Profiling.renderMarkdownDoc(
      md,
      detail.graph_description_markdown || detail.markdown,
      'No scenario graph description markdown for this scenario yet.'
    );

    Profiling.pushStructuredToViewer();
    Profiling.renderProposalGraph(detail.graph_proposal);
    Profiling.showView('detail');
  };

  Profiling.loadScenario = async function (toolId, scenarioKey) {
    Profiling.setStatus(`Loading ${toolId} scenario ${scenarioKey}…`);
    const detail = await Connection.fetchJson(
      `/cli-corpus/tools/${encodeURIComponent(toolId)}/scenarios/${encodeURIComponent(scenarioKey)}`
    );
    Profiling.renderDetail(detail);
    Profiling.setStatus(`Reviewing ${toolId} scenario ${scenarioKey}.`);
  };

  Profiling.renderScenariosTable = function (toolId, scenarios) {
    Profiling._currentTool = toolId;
    const tbody = document.getElementById('profiling-exams-tbody');
    const title = document.getElementById('profiling-exams-title');
    if (title) title.textContent = `${toolId} — scenarios`;
    if (!tbody) return;

    if (!scenarios.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-body-secondary small">No scenarios captured yet.</td></tr>';
      return;
    }

    tbody.innerHTML = scenarios
      .map(
        (row) => `
      <tr data-profiling-scenario="${row.scenario_key}" role="button" class="profiling-click-row">
        <td><strong>${row.scenario_name || row.scenario_key}</strong><br/><span class="small text-body-secondary">${row.scenario_key}</span></td>
        <td class="text-truncate" style="max-width:12rem">${row.target || '—'}</td>
        <td>${Profiling.artifactBadges(row)}</td>
        <td><span class="badge rounded-pill ${Profiling.reviewBadgeClass(row.review_status)}">${row.review_status}</span></td>
        <td>${row.structured_kind || '—'}</td>
      </tr>`
      )
      .join('');

    tbody.querySelectorAll('[data-profiling-scenario]').forEach((tr) => {
      tr.addEventListener('click', () => {
        Profiling.loadScenario(toolId, tr.dataset.profilingScenario);
      });
    });
  };

  Profiling.openTool = async function (toolId) {
    Profiling.setStatus(`Loading scenarios for ${toolId}…`);
    const scenarios = await Connection.fetchJson(
      `/cli-corpus/tools/${encodeURIComponent(toolId)}/scenarios`
    );
    Profiling._scenarios = scenarios;
    Profiling.renderScenariosTable(toolId, scenarios);
    Profiling.showView('exams');
    Profiling.setStatus(`${toolId}: ${scenarios.length} scenario(s).`);
  };

  Profiling.openToolGraphStructure = async function (toolId) {
    Profiling.setStatus(`Loading ${toolId} graph structure…`);
    const doc = await Connection.fetchJson(
      `/cli-corpus/tools/${encodeURIComponent(toolId)}/graph-structure`
    );
    const title = document.getElementById('profiling-structure-title');
    if (title) title.textContent = `${toolId} — nugget graph structure`;
    Profiling.renderMarkdownDoc(
      document.getElementById('profiling-structure-body'),
      doc.markdown,
      'No tool-level nugget graph structure markdown is available.'
    );
    Profiling.showView('structure');
    Profiling.setStatus(`Viewing ${toolId} graph structure.`);
  };

  Profiling.onToolStructureClick = function (event) {
    event.stopPropagation();
    const toolId = event.currentTarget.dataset.profilingStructure;
    Profiling.openToolGraphStructure(toolId).catch((err) => {
      console.error(err);
      Profiling.setStatus(`Failed to load graph structure: ${err.message}`);
    });
  };

  Profiling.renderToolsTable = function (tools) {
    const tbody = document.getElementById('profiling-tools-tbody');
    if (!tbody) return;

    if (!tools.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-body-secondary small">No tools returned. Start SpiderFeet API with <code>.\\start.ps1 -Mode api</code> (port 8001) and ensure examination files exist under <code>.docs/docs-for-cli-tools/app_examination_docs/</code>.</td></tr>';
      return;
    }

    const withExams = tools.filter((t) => t.exam_count > 0);
    const rows = withExams.length ? withExams : tools;

    tbody.innerHTML = rows
      .map(
        (row) => `
      <tr data-profiling-tool="${row.id}" role="button" class="profiling-click-row">
        <td><strong>${row.id}</strong></td>
        <td>${row.phase || 'pending'}</td>
        <td>${row.exam_count}</td>
        <td>${row.runtime || '—'}</td>
        <td class="small text-body-secondary">${row.notes || ''}</td>
        <td>
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary"
            data-profiling-structure="${row.id}"
            ${row.has_graph_structure ? '' : 'disabled'}
          >
            Structure
          </button>
        </td>
      </tr>`
      )
      .join('');

    tbody.querySelectorAll('[data-profiling-tool]').forEach((tr) => {
      tr.addEventListener('click', () => Profiling.openTool(tr.dataset.profilingTool));
    });
    tbody.querySelectorAll('[data-profiling-structure]').forEach((button) => {
      button.addEventListener('click', Profiling.onToolStructureClick);
    });
  };

  Profiling.loadTools = async function () {
    Profiling.setStatus('Loading CLI corpus…');
    try {
      const [config, tools] = await Promise.all([
        Connection.fetchJson('/cli-corpus/config'),
        Connection.fetchJson('/cli-corpus/tools'),
      ]);
      const viewerUrl = config.data_viewer_url || Widgets.DataViewer?.defaultSrc?.() || '';
      Profiling.ensureViewer();
      Profiling._tools = tools;
      Profiling.renderToolsTable(tools);
      Profiling.showView('tools');
      const examTotal = tools.reduce((sum, t) => sum + (t.exam_count || 0), 0);
      Profiling.setStatus(
        `Loaded ${tools.length} tool(s), ${examTotal} scenario(s). Data Viewer: ${viewerUrl}`
      );
    } catch (err) {
      console.error('Profiling.loadTools failed', err);
      const tbody = document.getElementById('profiling-tools-tbody');
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-danger small">Failed to load corpus: ${err.message}. Is the API running at ${Connection._apiBase}? Restart with <code>cd spiderfeet; .\\start.ps1 -Mode api</code>.</td></tr>`;
      }
      Profiling.setStatus(`Failed to load corpus: ${err.message}`);
      throw err;
    }
  };

  Profiling.setReview = async function (status) {
    if (!Profiling._currentTool || !Profiling._currentScenarioKey) return;
    Profiling.setStatus(`Setting review status to ${status}…`);
    await Connection.fetchJson(
      `/cli-corpus/tools/${encodeURIComponent(Profiling._currentTool)}/scenarios/${encodeURIComponent(Profiling._currentScenarioKey)}/review`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }
    );
    await Profiling.loadScenario(Profiling._currentTool, Profiling._currentScenarioKey);
    if (Profiling._currentTool) {
      const scenarios = await Connection.fetchJson(
        `/cli-corpus/tools/${encodeURIComponent(Profiling._currentTool)}/scenarios`
      );
      Profiling.renderScenariosTable(Profiling._currentTool, scenarios);
    }
    Profiling.setStatus(`Review status set to ${status}.`);
  };

  Profiling.onTabShown = function () {
    const active = document.querySelector('#profiling-exam-tabs .nav-link.active');
    if (active?.id !== 'profiling-tab-graph' && Profiling._graphFullscreen) {
      Profiling.setGraphFullscreen(false);
    }
    if (active?.id === 'profiling-tab-graph' && Profiling._detail) {
      setTimeout(() => Profiling.renderProposalGraph(Profiling._detail.graph_proposal), 50);
    }
  };

  Profiling.init = function ($root) {
    const el = $root[0];
    if (el.dataset.profilingInitialized === 'true') return;
    el.dataset.profilingInitialized = 'true';

    Profiling.ensureViewer();

    window.addEventListener('shell:theme-changed', () => {
      if (Profiling._detail?.structured?.content) {
        Profiling.pushStructuredToViewer();
      }
    });

    document.getElementById('profiling-back-tools')?.addEventListener('click', () => {
      Profiling.showView('tools');
      Profiling.setStatus('Select a CLI tool to review scenarios.');
    });

    document.getElementById('profiling-back-exams')?.addEventListener('click', () => {
      if (Profiling._currentTool) Profiling.openTool(Profiling._currentTool);
    });

    document.getElementById('profiling-refresh')?.addEventListener('click', () => {
      Profiling.loadTools().catch((err) => {
        console.error(err);
        Profiling.setStatus(`Failed to load corpus: ${err.message}`);
      });
    });

    document.getElementById('profiling-approve')?.addEventListener('click', () => {
      Profiling.setReview('approved').catch((err) => Profiling.setStatus(err.message));
    });

    document.getElementById('profiling-reject')?.addEventListener('click', () => {
      Profiling.setReview('rejected').catch((err) => Profiling.setStatus(err.message));
    });

    document.getElementById('profiling-reset-review')?.addEventListener('click', () => {
      Profiling.setReview('pending').catch((err) => Profiling.setStatus(err.message));
    });

    document.getElementById('profiling-graph-fullscreen')?.addEventListener('click', () => {
      Profiling.toggleGraphFullscreen();
    });

    document.getElementById('profiling-shadow-descriptors')?.addEventListener('change', (event) => {
      Profiling._shadowDescriptors = event.currentTarget.checked;
      event.currentTarget.setAttribute('aria-checked', Profiling._shadowDescriptors ? 'true' : 'false');
      if (Profiling._detail?.graph_proposal) {
        Profiling.renderProposalGraph(Profiling._detail.graph_proposal);
      }
    });

    document.getElementById('profiling-shadow-entities')?.addEventListener('change', (event) => {
      Profiling._shadowEntities = event.currentTarget.checked;
      event.currentTarget.setAttribute('aria-checked', Profiling._shadowEntities ? 'true' : 'false');
      if (Profiling._detail?.graph_proposal) {
        Profiling.renderProposalGraph(Profiling._detail.graph_proposal);
      }
    });

    document.getElementById('profiling-legend-toggle')?.addEventListener('click', () => {
      Profiling.toggleLegend();
    });

    document.querySelectorAll('#profiling-exam-tabs [data-bs-toggle="tab"]').forEach((tab) => {
      tab.addEventListener('shown.bs.tab', () => Profiling.onTabShown());
    });

    window.addEventListener('shell:tab-changed', (event) => {
      if (event.detail?.tabId !== 'profiling') return;
      if (!Profiling._tools.length) {
        Profiling.loadTools().catch((err) => {
          console.error(err);
          Profiling.setStatus(`Failed to load corpus: ${err.message}`);
        });
      }
    });

    Profiling.showView('tools');
    Profiling.renderLegend();
    Profiling.setLegendVisible(true);
    Profiling.setStatus('Open this tab to load the CLI profiling corpus (API required).');
  };

  Widgets.watchDOMForComponent(Profiling.selectorPanel, Profiling.init);
})(
  window.jQuery,
  window.Widgets.Profiling,
  window.Widgets,
  window.Widgets.Connection,
  window.Widgets.DataViewerHost,
  document,
  window
);
