window.Widgets = window.Widgets || {};
window.Widgets.ComposerTempGraph = window.Widgets.ComposerTempGraph || {};

/**
 * SPEC-011 AW1–AW2 / R11-18–R19 — Temporary Subgraph Viewer.
 *
 * AW1: on completed step with `context.export: scan_graph`, assign each node a
 * fresh `temporary--<uuidv4>`, remap edges, append as a discrete subgraph.
 * AW2: render accumulated imports as discrete CanvasGraph clusters and provide
 * a per-subgraph remove toggle. AW3 strips temporary_id on send.
 */
(function (ComposerTempGraph, Widgets, document, window) {
  'use strict';

  /** Accent colours so each imported subgraph reads as a discrete cluster. */
  ComposerTempGraph.SUBGRAPH_PALETTE = [
    '#0d6efd',
    '#198754',
    '#fd7e14',
    '#6f42c1',
    '#dc3545',
    '#20c997',
    '#0dcaf0',
    '#6610f2',
  ];

  /** @type {Array<{
   *   subgraphId: string,
   *   stepId: string|null,
   *   importedAt: string,
   *   label: string,
   *   nodes: object[],
   *   edges: object[]
   * }>} */
  ComposerTempGraph._subgraphs = [];
  ComposerTempGraph._uiBound = false;

  /**
   * Shared uuidv4 helper (browser crypto.randomUUID when available).
   * @returns {string}
   */
  ComposerTempGraph.uuidv4 = function () {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // RFC4122 v4 fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  /**
   * Widget-only temporary id: `temporary--<uuidv4>` (R11-18 / R10-25).
   * @returns {string}
   */
  ComposerTempGraph.newTemporaryId = function () {
    return `temporary--${ComposerTempGraph.uuidv4()}`;
  };

  /**
   * Canonical nugget instance id from a scan-graph node.
   * @param {object} node
   * @returns {string|null}
   */
  ComposerTempGraph.canonicalNodeId = function (node) {
    if (!node || typeof node !== 'object') return null;
    const nid = node.nugget_instance_id || node.id;
    return nid != null && String(nid).trim() ? String(nid) : null;
  };

  /**
   * Read `context.export` for a workflow step (lightweight, no YAML lib).
   * @param {string} [yaml]
   * @param {string} stepId
   * @returns {'scan_graph'|'none'|null}
   */
  ComposerTempGraph.parseStepContextExport = function (yaml, stepId) {
    if (!stepId || typeof stepId !== 'string') return null;
    const lines = String(yaml ?? '').split(/\r?\n/);
    let inSteps = false;
    let inStep = false;
    let stepIndent = '';

    const escaped = stepId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const idRe = new RegExp(
      `^(\\s*)-\\s+id:\\s*['"]?${escaped}['"]?\\s*(?:#.*)?$`
    );
    const anyStepIdRe = /^(\s*)-\s+id:\s*/;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!inSteps) {
        if (/^steps:\s*(?:#.*)?$/.test(trimmed)) inSteps = true;
        continue;
      }

      const stepMatch = line.match(idRe);
      if (stepMatch) {
        inStep = true;
        stepIndent = stepMatch[1] || '';
        continue;
      }

      if (!inStep) continue;

      // Next top-level step item ends the current step.
      const anyId = line.match(anyStepIdRe);
      if (anyId && (anyId[1] || '') === stepIndent) {
        break;
      }
      // Dedent past the step list item.
      const col = line.replace(/\t/g, '  ').search(/\S/);
      const stepCol = stepIndent.replace(/\t/g, '  ').length;
      if (trimmed && col >= 0 && col < stepCol) {
        break;
      }

      const exp = line.match(/^\s*export:\s*(.+?)\s*(?:#.*)?$/);
      if (exp) {
        // Only accept export under a `context:` key in this step.
        let j = i - 1;
        let underContext = false;
        while (j >= 0) {
          const prev = lines[j];
          j -= 1;
          if (!prev.trim()) continue;
          if (/^\s*context:\s*(?:#.*)?$/.test(prev)) {
            underContext = true;
            break;
          }
          if (anyStepIdRe.test(prev)) break;
          if (/^\s*\w[\w-]*:\s*/.test(prev) && !/^\s*export:\s*/.test(prev)) {
            break;
          }
        }
        if (!underContext) continue;
        const raw = String(exp[1] || '').trim().replace(/^['"]|['"]$/g, '');
        if (raw === 'scan_graph' || raw === 'none') return raw;
        return raw || null;
      }
    }
    return null;
  };

  /**
   * Assign fresh temporary_ids and remap edges (pure; does not mutate store).
   * Node `id` becomes the temporary_id so CanvasGraph endpoints stay discrete;
   * original identity is preserved on `nugget_instance_id`.
   * @param {{ nodes?: object[], edges?: object[], links?: object[] }} scanGraph
   * @param {string} [subgraphId]
   * @returns {{ nodes: object[], edges: object[], idMap: Record<string, string> }}
   */
  ComposerTempGraph.assignTemporaryIds = function (scanGraph, subgraphId) {
    const idMap = Object.create(null);
    const nodes = [];
    const rawNodes = Array.isArray(scanGraph?.nodes) ? scanGraph.nodes : [];

    rawNodes.forEach((raw) => {
      if (!raw || typeof raw !== 'object') return;
      const canonical = ComposerTempGraph.canonicalNodeId(raw);
      const temporaryId = ComposerTempGraph.newTemporaryId();
      const node = Object.assign({}, raw);
      if (canonical) {
        node.nugget_instance_id = canonical;
        idMap[canonical] = temporaryId;
      }
      if (raw.id != null && String(raw.id) !== canonical) {
        idMap[String(raw.id)] = temporaryId;
      }
      node.temporary_id = temporaryId;
      node.id = temporaryId;
      if (subgraphId) node.subgraph_id = subgraphId;
      nodes.push(node);
    });

    const remapEndpoint = (value) => {
      if (value == null) return value;
      const key = String(value);
      return idMap[key] || key;
    };

    const rawEdges = Array.isArray(scanGraph?.edges)
      ? scanGraph.edges
      : Array.isArray(scanGraph?.links)
        ? scanGraph.links
        : [];

    const edges = rawEdges.map((raw) => {
      if (!raw || typeof raw !== 'object') return raw;
      const edge = Object.assign({}, raw);
      const src = edge.source != null ? edge.source : edge.from;
      const tgt = edge.target != null ? edge.target : edge.to;
      const nextSrc = remapEndpoint(src);
      const nextTgt = remapEndpoint(tgt);
      if ('source' in edge || nextSrc != null) edge.source = nextSrc;
      if ('target' in edge || nextTgt != null) edge.target = nextTgt;
      if ('from' in edge) edge.from = nextSrc;
      if ('to' in edge) edge.to = nextTgt;
      if (subgraphId) edge.subgraph_id = subgraphId;
      return edge;
    });

    return { nodes, edges, idMap };
  };

  /**
   * Flatten accumulated discrete subgraphs for CanvasGraph / AW3 send.
   * @returns {{ nodes: object[], edges: object[], links: object[] }}
   */
  ComposerTempGraph.getAccumulatedGraph = function () {
    const nodes = [];
    const edges = [];
    ComposerTempGraph._subgraphs.forEach((sg) => {
      (sg.nodes || []).forEach((n) => nodes.push(n));
      (sg.edges || []).forEach((e) => edges.push(e));
    });
    return { nodes, edges, links: edges };
  };

  /** @returns {typeof ComposerTempGraph._subgraphs} */
  ComposerTempGraph.getSubgraphs = function () {
    return ComposerTempGraph._subgraphs.slice();
  };

  /**
   * Convert accumulated temporary graph into CanvasGraph `{nodes,links}`.
   * Each import is a discrete group with a seeded cluster offset (R11-19).
   * @returns {{ nodes: object[], links: object[] }}
   */
  ComposerTempGraph.toCanvasGraph = function () {
    const subgraphs = ComposerTempGraph._subgraphs;
    const nodes = [];
    const links = [];
    const colourFor = Widgets.CliScanApp?.colourForNode;
    const iconBase = Widgets.CliScanApp?.ICON_BASE || '/assets/icons/';
    const count = Math.max(subgraphs.length, 1);

    subgraphs.forEach((sg, sgIndex) => {
      const group = `import-${sgIndex + 1}`;
      const accent =
        ComposerTempGraph.SUBGRAPH_PALETTE[
          sgIndex % ComposerTempGraph.SUBGRAPH_PALETTE.length
        ];
      const clusterAngle = (2 * Math.PI * sgIndex) / count;
      const clusterR = 160;
      const cx = Math.cos(clusterAngle) * clusterR;
      const cy = Math.sin(clusterAngle) * clusterR;
      const localNodes = Array.isArray(sg.nodes) ? sg.nodes : [];

      localNodes.forEach((n, i) => {
        const nuggetId = n.nugget_id || n.nugget_instance_id || n.id;
        const localAngle = (2 * Math.PI * i) / Math.max(localNodes.length, 1);
        const localR = 36 + Math.min(localNodes.length, 8) * 2;
        nodes.push({
          id: n.temporary_id || n.id,
          group,
          label: nuggetId,
          shortLabel: nuggetId,
          r: 10,
          iconSize: 28,
          colour: colourFor ? colourFor(n) : accent,
          iconUrl: `${iconBase}icon_${String(nuggetId).toLowerCase()}.svg`,
          x: cx + localR * Math.cos(localAngle),
          y: cy + localR * Math.sin(localAngle),
          meta: {
            nugget_type: n.nugget_type,
            nugget_instance_id: n.nugget_instance_id,
            temporary_id: n.temporary_id,
            subgraph_id: sg.subgraphId,
            import_index: sgIndex + 1,
            data: n.data || n.nugget_data,
            kind: 'nugget',
          },
        });
      });

      (sg.edges || []).forEach((e, idx) => {
        links.push({
          id: `${sg.subgraphId}-edge-${idx}`,
          source: e.source,
          target: e.target,
          role: e.relation || e.type || e.name || 'contains',
        });
      });
    });

    return { nodes, links };
  };

  function escHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Render per-subgraph remove toggles (R11-19).
   */
  ComposerTempGraph.renderSubgraphToggles = function () {
    const list = document.getElementById('composer-temp-subgraph-list');
    if (!list) return;

    const subgraphs = ComposerTempGraph._subgraphs;
    if (!subgraphs.length) {
      list.replaceChildren();
      list.hidden = true;
      list.setAttribute('aria-hidden', 'true');
      return;
    }

    list.hidden = false;
    list.setAttribute('aria-hidden', 'false');
    const parts = subgraphs.map((sg, index) => {
      const accent =
        ComposerTempGraph.SUBGRAPH_PALETTE[
          index % ComposerTempGraph.SUBGRAPH_PALETTE.length
        ];
      const label = sg.label || `Import ${index + 1}`;
      const nodeCount = (sg.nodes || []).length;
      const title = sg.stepId
        ? `${label} · ${sg.stepId} (${nodeCount} nodes)`
        : `${label} (${nodeCount} nodes)`;
      return (
        `<div class="composer-temp-subgraph-chip d-inline-flex align-items-center gap-1 border rounded px-2 py-1 bg-body" ` +
        `data-temp-subgraph-id="${escHtml(sg.subgraphId)}" style="border-left: 3px solid ${accent} !important;">` +
        `<span class="small text-truncate" style="max-width: 12rem;" title="${escHtml(title)}">${escHtml(label)}` +
        (sg.stepId
          ? ` <span class="text-body-secondary">· ${escHtml(sg.stepId)}</span>`
          : '') +
        ` <span class="text-body-secondary">(${nodeCount})</span></span>` +
        `<button type="button" class="btn btn-sm btn-outline-secondary py-0 px-1" ` +
        `data-temp-subgraph-remove="${escHtml(sg.subgraphId)}" ` +
        `title="Remove ${escHtml(label)}" aria-label="Remove ${escHtml(label)}">` +
        `<i class="fa-solid fa-xmark" aria-hidden="true"></i></button>` +
        `</div>`
      );
    });
    list.innerHTML = parts.join('');
  };

  /**
   * Bind remove-toggle clicks once.
   */
  ComposerTempGraph.bindUi = function () {
    if (ComposerTempGraph._uiBound) return;
    const list = document.getElementById('composer-temp-subgraph-list');
    if (!list) return;
    ComposerTempGraph._uiBound = true;
    list.addEventListener('click', (event) => {
      const btn = event.target?.closest?.('[data-temp-subgraph-remove]');
      if (!btn) return;
      event.preventDefault();
      const id = btn.getAttribute('data-temp-subgraph-remove');
      if (id) ComposerTempGraph.removeSubgraph(id);
    });
  };

  /**
   * Remount the Temporary Subgraph Viewer CanvasGraph with accumulated data
   * and refresh remove toggles (R11-19).
   */
  ComposerTempGraph.refreshViewer = function () {
    ComposerTempGraph.bindUi();
    ComposerTempGraph.renderSubgraphToggles();
    const Composer = Widgets.Composer;
    if (!Composer?.mountCanvasGraph) return;
    const canvas = ComposerTempGraph.toCanvasGraph();
    Composer.mountCanvasGraph('temp-subgraph', canvas);
    const count = ComposerTempGraph._subgraphs.length;
    const n = canvas.nodes.length;
    Composer.setStatus?.(
      count
        ? `Temporary Subgraph Viewer: ${count} discrete import${count === 1 ? '' : 's'} (${n} nodes).`
        : 'Temporary Subgraph Viewer cleared.'
    );
  };

  /**
   * Remove one discrete import; remaining subgraphs stay mounted (R11-19).
   * @param {string} subgraphId
   * @returns {boolean}
   */
  ComposerTempGraph.removeSubgraph = function (subgraphId) {
    if (!subgraphId) return false;
    const before = ComposerTempGraph._subgraphs.length;
    ComposerTempGraph._subgraphs = ComposerTempGraph._subgraphs.filter(
      (sg) => sg.subgraphId !== subgraphId
    );
    if (ComposerTempGraph._subgraphs.length === before) return false;
    ComposerTempGraph.refreshViewer();
    return true;
  };

  ComposerTempGraph.clear = function () {
    ComposerTempGraph._subgraphs = [];
    ComposerTempGraph.refreshViewer();
  };

  /**
   * Import one scan graph as a discrete subgraph (R11-18).
   * @param {{ nodes?: object[], edges?: object[], links?: object[] }} scanGraph
   * @param {{ stepId?: string|null }} [meta]
   * @returns {{ subgraphId: string, nodes: object[], edges: object[] }|null}
   */
  ComposerTempGraph.importScanGraph = function (scanGraph, meta) {
    if (!scanGraph || typeof scanGraph !== 'object') return null;
    const subgraphId = `subgraph--${ComposerTempGraph.uuidv4()}`;
    const assigned = ComposerTempGraph.assignTemporaryIds(scanGraph, subgraphId);
    const importIndex = ComposerTempGraph._subgraphs.length + 1;
    const stepId = meta?.stepId != null ? String(meta.stepId) : null;
    const subgraph = {
      subgraphId,
      stepId,
      importedAt: new Date().toISOString(),
      label: `Import ${importIndex}`,
      nodes: assigned.nodes,
      edges: assigned.edges,
    };
    ComposerTempGraph._subgraphs.push(subgraph);
    // Relabel so indices stay contiguous after removals.
    ComposerTempGraph._subgraphs.forEach((sg, i) => {
      sg.label = `Import ${i + 1}`;
    });
    ComposerTempGraph.refreshViewer();
    return subgraph;
  };

  /**
   * Hook from Composer onScanComplete — import when export is scan_graph.
   * @param {{ ok?: boolean, kind?: string, detail?: object, result?: object }} outcome
   * @param {{ stepId?: string|null, yaml?: string }} [opts]
   * @returns {{ subgraphId: string }|null}
   */
  ComposerTempGraph.handleScanComplete = function (outcome, opts) {
    if (!outcome || outcome.ok === false) return null;
    if (outcome.kind && outcome.kind !== 'complete') return null;

    const Composer = Widgets.Composer;
    const wf = Widgets.ComposerWorkflow;
    const stepId =
      (opts && opts.stepId) ||
      Composer?._selectedStepId ||
      null;
    const ownerId = (stepId && wf?.argvOwnerStepId?.(stepId)) || stepId;
    const yaml =
      (opts && opts.yaml) ||
      wf?.getWorkflowYaml?.() ||
      '';

    const exportKind = ComposerTempGraph.parseStepContextExport(yaml, ownerId || '');
    if (exportKind !== 'scan_graph') return null;

    const detail = outcome.detail || null;
    const result = outcome.result || null;
    const graph =
      detail?.graph_proposal ||
      result?.graph_proposal ||
      result?.graph_form ||
      result?.graph ||
      null;
    if (!graph || typeof graph !== 'object') return null;

    const imported = ComposerTempGraph.importScanGraph(graph, { stepId: ownerId });
    return imported ? { subgraphId: imported.subgraphId } : null;
  };

  /** Ensure toggle strip is bound when Composer mounts. */
  ComposerTempGraph.initFromComposer = function () {
    ComposerTempGraph.bindUi();
    ComposerTempGraph.renderSubgraphToggles();
  };
})(window.Widgets.ComposerTempGraph, window.Widgets, document, window);
