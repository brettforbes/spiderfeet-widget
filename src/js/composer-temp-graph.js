window.Widgets = window.Widgets || {};
window.Widgets.ComposerTempGraph = window.Widgets.ComposerTempGraph || {};

/**
 * SPEC-011 AW1 / R11-18 — Temporary Subgraph Viewer import with temporary_id.
 *
 * On a completed step with `context.export: scan_graph`, each imported node
 * receives a fresh `temporary--<uuidv4>`; edges are remapped to those ids and
 * the result is appended as a discrete subgraph (overlapping canonical ids
 * do not collide). AW2 adds remove toggles; AW3 strips temporary_id on send.
 */
(function (ComposerTempGraph, Widgets, document, window) {
  'use strict';

  /** @type {Array<{
   *   subgraphId: string,
   *   stepId: string|null,
   *   importedAt: string,
   *   nodes: object[],
   *   edges: object[]
   * }>} */
  ComposerTempGraph._subgraphs = [];

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
   * @returns {{ nodes: object[], edges: object[], idMap: Record<string, string> }}
   */
  ComposerTempGraph.assignTemporaryIds = function (scanGraph) {
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
      return edge;
    });

    return { nodes, edges, idMap };
  };

  /**
   * Flatten accumulated discrete subgraphs for CanvasGraph.
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

  ComposerTempGraph.clear = function () {
    ComposerTempGraph._subgraphs = [];
  };

  /**
   * Convert accumulated temporary graph into CanvasGraph `{nodes,links}`.
   * Prefer CliScanApp.transformProposalGraph when available.
   * @returns {{ nodes: object[], links: object[] }}
   */
  ComposerTempGraph.toCanvasGraph = function () {
    const proposal = ComposerTempGraph.getAccumulatedGraph();
    if (Widgets.CliScanApp?.transformProposalGraph) {
      return Widgets.CliScanApp.transformProposalGraph(proposal);
    }
    const nodes = (proposal.nodes || []).map((n) => ({
      id: n.temporary_id || n.id,
      group: 'nugget',
      label: n.nugget_id || n.nugget_instance_id || n.id,
      shortLabel: n.nugget_id || n.nugget_instance_id || n.id,
      r: 10,
      iconSize: 28,
      colour: '#6c757d',
      meta: {
        nugget_type: n.nugget_type,
        nugget_instance_id: n.nugget_instance_id,
        temporary_id: n.temporary_id,
        data: n.data || n.nugget_data,
      },
    }));
    const links = (proposal.edges || []).map((e, idx) => ({
      id: `temp-edge-${idx}`,
      source: e.source,
      target: e.target,
      role: e.relation || e.type || e.name || 'contains',
    }));
    return { nodes, links };
  };

  /**
   * Remount the Temporary Subgraph Viewer CanvasGraph with accumulated data.
   */
  ComposerTempGraph.refreshViewer = function () {
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
   * Import one scan graph as a discrete subgraph (R11-18).
   * @param {{ nodes?: object[], edges?: object[], links?: object[] }} scanGraph
   * @param {{ stepId?: string|null }} [meta]
   * @returns {{ subgraphId: string, nodes: object[], edges: object[] }|null}
   */
  ComposerTempGraph.importScanGraph = function (scanGraph, meta) {
    if (!scanGraph || typeof scanGraph !== 'object') return null;
    const assigned = ComposerTempGraph.assignTemporaryIds(scanGraph);
    const subgraph = {
      subgraphId: `subgraph--${ComposerTempGraph.uuidv4()}`,
      stepId: meta?.stepId != null ? String(meta.stepId) : null,
      importedAt: new Date().toISOString(),
      nodes: assigned.nodes,
      edges: assigned.edges,
    };
    ComposerTempGraph._subgraphs.push(subgraph);
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
})(window.Widgets.ComposerTempGraph, window.Widgets, document, window);
