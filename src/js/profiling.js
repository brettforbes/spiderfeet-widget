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
  Profiling.frameId = 'data-viewer-profiling';
  Profiling._viewer = null;

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
    ['tools', 'exams', 'detail'].forEach((name) => {
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

  Profiling.proposalToGraph = function (proposal) {
    if (!proposal?.nodes?.length) {
      return { nodes: [], links: [] };
    }
    const nodes = proposal.nodes.map((n) => ({
      id: n.id,
      label: n.nugget_id || n.id,
      group: (n.nugget_id || 'entity').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      meta: n.data || {},
      r: n.nugget_type === 'ENTITY' ? 12 : 9,
    }));
    const links = (proposal.edges || []).map((e, idx) => ({
      id: `edge-${idx}`,
      source: e.source,
      target: e.target,
      relation: e.relation,
    }));
    return { nodes, links };
  };

  Profiling.renderProposalGraph = function (proposal) {
    Profiling.destroyGraph();
    const container = document.getElementById('profiling-graph-stage');
    const tooltip = document.getElementById('profiling-graph-tooltip');
    if (!container || !window.Viz?.ForceGraph) return;

    const { nodes, links } = Profiling.proposalToGraph(proposal);
    if (!nodes.length) {
      container.innerHTML =
        '<p class="small text-body-secondary p-3 mb-0">No proposed nodes/edges JSON for this scenario yet.</p>';
      return;
    }

    container.innerHTML =
      '<svg id="profiling-graph-svg" class="profiling-graph-svg" role="img" aria-label="Proposed nugget graph"></svg>';

    const svgEl = document.getElementById('profiling-graph-svg');
    const { width, height } = window.Viz.Core.dimensions(svgEl);
    const svg = window.Viz.Core.selectSvg(svgEl);
    window.Viz.Core.clear(svg);
    svg
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const cloned = window.Viz.Core.cloneGraph({ nodes, links });
    const colour = window.Viz.Core.colourByGroup([...new Set(cloned.nodes.map((n) => n.group))]);

    const rootG = svg.append('g').attr('class', 'graph-root');
    const zoom = d3
      .zoom()
      .scaleExtent([0.2, 8])
      .on('zoom', (event) => rootG.attr('transform', event.transform));
    svg.call(zoom);

    const simulation = d3.forceSimulation(cloned.nodes);
    simulation
      .force('link', d3.forceLink().id((d) => d.id).distance(90).strength(0.75))
      .force('charge', d3.forceManyBody().strength(-260))
      .force('center', d3.forceCenter(width / 2, height / 2));
    simulation.force('link').links(cloned.links);

    const link = rootG
      .append('g')
      .selectAll('line')
      .data(cloned.links)
      .join('line')
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 1.5);

    const pinDrag = d3
      .drag()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = event.x;
        d.fy = event.y;
        d.pinned = true;
      });

    const node = rootG
      .append('g')
      .selectAll('g')
      .data(cloned.nodes)
      .join('g')
      .call(pinDrag);

    node
      .append('circle')
      .attr('r', (d) => d.r || 10)
      .attr('fill', (d) => colour(d.group))
      .attr('stroke', '#1e293b')
      .attr('stroke-width', 1.2);

    node
      .append('text')
      .attr('dy', 4)
      .attr('text-anchor', 'middle')
      .attr('font-size', 9)
      .attr('fill', '#0f172a')
      .attr('pointer-events', 'none')
      .text((d) => (d.label.length > 14 ? `${d.label.slice(0, 12)}…` : d.label));

    node
      .on('mouseover', (event, d) => {
        if (!tooltip) return;
        tooltip.hidden = false;
        tooltip.innerHTML = `<strong>${d.label}</strong><br/>id: ${d.id}<br/>${JSON.stringify(d.meta, null, 2)}`;
      })
      .on('mousemove', (event) => {
        if (!tooltip) return;
        const bounds = container.getBoundingClientRect();
        tooltip.style.left = `${event.clientX - bounds.left + 12}px`;
        tooltip.style.top = `${event.clientY - bounds.top + 12}px`;
      })
      .on('mouseout', () => {
        if (tooltip) tooltip.hidden = true;
      })
      .on('dblclick', (event, d) => {
        event.stopPropagation();
        d.pinned = false;
        d.fx = null;
        d.fy = null;
        simulation.alpha(0.4).restart();
      });

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);
      node.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    Profiling._graphInstance = {
      destroy() {
        simulation.stop();
        svg.on('.zoom', null);
        window.Viz.Core.clear(svg);
      },
    };
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

    const meta = document.getElementById('profiling-detail-meta');
    if (meta) {
      const m = detail.manifest || {};
      const artifacts = detail.artifacts || {};
      meta.textContent = [
        `key: ${detail.scenario_key}`,
        m.target ? `target: ${m.target}` : null,
        m.runtime ? `runtime: ${m.runtime}` : null,
        artifacts.has_text ? null : 'missing text',
        artifacts.has_structured ? null : 'missing structured',
        artifacts.has_graph ? null : 'missing graph',
        artifacts.has_markdown ? null : 'missing markdown',
      ]
        .filter(Boolean)
        .join(' · ');
    }

    const cmd = document.getElementById('profiling-command-text');
    if (cmd) cmd.textContent = detail.command || '(no command capture)';

    const text = document.getElementById('profiling-output-text');
    if (text) text.textContent = detail.output_text || '(empty text output)';

    const md = document.getElementById('profiling-markdown-body');
    if (md) {
      const renderer = window.Widgets?.Markdown;
      if (detail.markdown) {
        md.innerHTML = renderer
          ? renderer.render(detail.markdown)
          : `<pre>${detail.markdown}</pre>`;
      } else {
        md.innerHTML =
          '<p class="text-body-secondary">No nugget graph structure markdown for this scenario yet.</p>';
      }
    }

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

  Profiling.renderToolsTable = function (tools) {
    const tbody = document.getElementById('profiling-tools-tbody');
    if (!tbody) return;

    if (!tools.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-body-secondary small">No tools returned. Start SpiderFeet API with <code>.\\start.ps1 -Mode api</code> (port 8001) and ensure examination files exist under <code>.docs/docs-for-cli-tools/app_examination_docs/</code>.</td></tr>';
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
      </tr>`
      )
      .join('');

    tbody.querySelectorAll('[data-profiling-tool]').forEach((tr) => {
      tr.addEventListener('click', () => Profiling.openTool(tr.dataset.profilingTool));
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
