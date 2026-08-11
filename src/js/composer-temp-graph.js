window.Widgets = window.Widgets || {};
window.Widgets.ComposerTempGraph = window.Widgets.ComposerTempGraph || {};

/**
 * SPEC-011 AW1–AW3 / SPEC-017 R17-07..09 — Temporary Subgraph Viewer.
 *
 * Read-only consumer of GET /projects/{id}/contexts/temporary (multi-row list).
 * Engine owns writes; viewer clears, loads all subgraphs, centres on chip click.
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
   *   scanName: string|null,
   *   scanDescription: string|null,
   *   importedAt: string,
   *   label: string,
   *   nodes: object[],
   *   edges: object[]
   * }>} */
  ComposerTempGraph._subgraphs = [];
  ComposerTempGraph._uiBound = false;
  /** @type {{ nodes: object[], edges: object[], temporary_subgraph_id?: string }|null} */
  ComposerTempGraph._lastOutboundPayload = null;
  /** @type {string|null} */
  ComposerTempGraph._temporarySubgraphId = null;
  /** @type {string|null} project id that owns `_temporarySubgraphId` / loaded graph */
  ComposerTempGraph._loadedForProjectId = null;
  ComposerTempGraph._sending = false;

  /**
   * Label for a server subgraph entry (scan_name preferred).
   * @param {{ scan_name?: string, scan_description?: string|null, temporary_subgraph_id?: string }} entry
   * @returns {string}
   */
  ComposerTempGraph.subgraphLabel = function (entry) {
    if (!entry || typeof entry !== 'object') return 'subgraph';
    const name = entry.scan_name != null ? String(entry.scan_name).trim() : '';
    if (name) return name;
    const desc =
      entry.scan_description != null ? String(entry.scan_description).trim() : '';
    if (desc) return desc;
    const id = entry.temporary_subgraph_id || entry.subgraph_id;
    return id ? String(id) : 'subgraph';
  };

  /**
   * Normalize one API subgraph row for the viewer store (preserve server stamps).
   * @param {object} entry
   * @returns {{ subgraphId: string, stepId: string|null, scanName: string|null, scanDescription: string|null, label: string, nodes: object[], edges: object[] }|null}
   */
  ComposerTempGraph.normalizeServerSubgraph = function (entry) {
    if (!entry || typeof entry !== 'object') return null;
    const subgraphId =
      entry.temporary_subgraph_id || entry.subgraph_id || `subgraph--${ComposerTempGraph.uuidv4()}`;
    const scanName = entry.scan_name != null ? String(entry.scan_name) : null;
    const scanDescription =
      entry.scan_description != null ? String(entry.scan_description) : null;
    const label = ComposerTempGraph.subgraphLabel(entry);
    const stepId = scanName && scanName !== 'target' ? scanName : null;

    const nodes = (Array.isArray(entry.nodes) ? entry.nodes : []).map((raw) => {
      if (!raw || typeof raw !== 'object') return raw;
      const node = Object.assign({}, raw);
      const tid = node.temporary_id || node.id;
      if (tid) {
        node.temporary_id = String(tid);
        node.id = String(tid);
      }
      node.subgraph_id = subgraphId;
      if (scanName && node.source == null) node.source = scanName;
      return node;
    });

    const edges = (Array.isArray(entry.edges) ? entry.edges : []).map((raw) => {
      if (!raw || typeof raw !== 'object') return raw;
      const edge = Object.assign({}, raw);
      edge.subgraph_id = subgraphId;
      if (scanName && edge.scan_name == null) edge.scan_name = scanName;
      return edge;
    });

    return {
      subgraphId: String(subgraphId),
      stepId,
      scanName,
      scanDescription,
      label,
      nodes,
      edges,
    };
  };

  /**
   * Replace in-memory subgraphs from a GET list payload (read-only).
   * @param {object[]} subgraphEntries
   * @returns {number} subgraph count loaded
   */
  ComposerTempGraph.loadSubgraphsFromList = function (subgraphEntries) {
    ComposerTempGraph._subgraphs = [];
    const list = Array.isArray(subgraphEntries) ? subgraphEntries : [];
    list.forEach((entry) => {
      const normalized = ComposerTempGraph.normalizeServerSubgraph(entry);
      if (!normalized) return;
      ComposerTempGraph._subgraphs.push(
        Object.assign({}, normalized, {
          importedAt: new Date().toISOString(),
        })
      );
    });
    ComposerTempGraph.refreshViewer();
    return ComposerTempGraph._subgraphs.length;
  };

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
   * Strip viewer-only `temporary_id` tags and remap edge endpoints to
   * canonical `nugget_instance_id` (R11-20 / R10-25). Pure — does not mutate
   * the viewer store. Mirrors `spiderfeet_v2.api.temporary_ids.strip_temporary_ids`.
   * @param {{ nodes?: object[], edges?: object[], links?: object[] }} graph
   * @returns {{ nodes: object[], edges: object[] }}
   */
  ComposerTempGraph.stripTemporaryIds = function (graph) {
    const tempToCanonical = Object.create(null);
    const cleanNodes = [];
    const rawNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];

    rawNodes.forEach((raw) => {
      if (!raw || typeof raw !== 'object') return;
      const node = Object.assign({}, raw);
      const tid = node.temporary_id;
      delete node.temporary_id;
      const canonical = ComposerTempGraph.canonicalNodeId(node);
      if (tid && canonical) {
        tempToCanonical[String(tid)] = canonical;
      }
      // id may still be the temporary tag when nugget_instance_id is absent.
      if (canonical) {
        node.id = canonical;
        if (node.nugget_instance_id == null || node.nugget_instance_id === '') {
          node.nugget_instance_id = canonical;
        }
      }
      cleanNodes.push(node);
    });

    const remap = (value) => {
      if (value == null) return value;
      const key = String(value);
      return Object.prototype.hasOwnProperty.call(tempToCanonical, key)
        ? tempToCanonical[key]
        : value;
    };

    const rawEdges = Array.isArray(graph?.edges)
      ? graph.edges
      : Array.isArray(graph?.links)
        ? graph.links
        : [];

    const cleanEdges = [];
    rawEdges.forEach((raw) => {
      if (!raw || typeof raw !== 'object') return;
      const edge = Object.assign({}, raw);
      const src = remap('source' in edge ? edge.source : edge.from);
      const tgt = remap('target' in edge ? edge.target : edge.to);
      const rel = edge.relation != null ? edge.relation : edge.type;
      const out = {};
      Object.keys(edge).forEach((k) => {
        if (
          k === 'source' ||
          k === 'from' ||
          k === 'target' ||
          k === 'to' ||
          k === 'relation' ||
          k === 'type'
        ) {
          return;
        }
        out[k] = edge[k];
      });
      if (src != null) out.source = src;
      if (tgt != null) out.target = tgt;
      if (rel != null) out.relation = rel;
      cleanEdges.push(out);
    });

    return { nodes: cleanNodes, edges: cleanEdges };
  };

  /**
   * Build the outbound temporary-context PUT body (no `temporary_id`).
   * Captures the payload on `_lastOutboundPayload` for verification.
   * @param {{ temporarySubgraphId?: string|null }} [opts]
   * @returns {{ nodes: object[], edges: object[], temporary_subgraph_id?: string }}
   */
  ComposerTempGraph.buildServerPayload = function (opts) {
    const cleaned = ComposerTempGraph.stripTemporaryIds(
      ComposerTempGraph.getAccumulatedGraph()
    );
    const payload = {
      nodes: cleaned.nodes,
      edges: cleaned.edges,
    };
    // SPEC-016 B1 — only send a subgraph id when it belongs to the open project.
    const currentPid = ComposerTempGraph.resolveProjectId();
    const sgId =
      (opts && opts.temporarySubgraphId) ||
      (ComposerTempGraph._loadedForProjectId &&
      currentPid &&
      ComposerTempGraph._loadedForProjectId === currentPid
        ? ComposerTempGraph._temporarySubgraphId
        : null) ||
      null;
    if (sgId) payload.temporary_subgraph_id = String(sgId);
    ComposerTempGraph._lastOutboundPayload = payload;
    return payload;
  };

  /** @returns {{ nodes: object[], edges: object[], temporary_subgraph_id?: string }|null} */
  ComposerTempGraph.getLastOutboundPayload = function () {
    return ComposerTempGraph._lastOutboundPayload;
  };

  /**
   * Resolve the active Composer project id for temporary-context sync.
   * @param {string} [explicitProjectId]
   * @returns {string|null}
   */
  ComposerTempGraph.resolveProjectId = function (explicitProjectId) {
    if (explicitProjectId != null && String(explicitProjectId).trim()) {
      return String(explicitProjectId).trim();
    }
    const Composer = Widgets.Composer;
    if (Composer?.selectedProjectId) {
      return String(Composer.selectedProjectId);
    }
    const p = Composer?.selectedProject;
    const fromProject = p?.project_id || p?.id || null;
    return fromProject != null && String(fromProject).trim()
      ? String(fromProject).trim()
      : null;
  };

  /**
   * PUT accumulated temporary graph to the server after strip-on-send (R11-20).
   * @param {string} [projectId]
   * @param {{ temporarySubgraphId?: string|null, silent?: boolean }} [opts]
   * @returns {Promise<{ ok: boolean, status?: number, message?: string, payload?: object, result?: object }>}
   */
  ComposerTempGraph.sendToServer = async function (projectId, opts) {
    const pid = ComposerTempGraph.resolveProjectId(projectId);
    if (!pid) {
      return { ok: false, status: 0, message: 'No project selected for temporary-context sync.' };
    }
    const Api = Widgets.SpiderfeetApi;
    if (!Api || typeof Api.updateTemporaryContext !== 'function') {
      return { ok: false, status: 0, message: 'SpiderfeetApi.updateTemporaryContext unavailable.' };
    }

    const payload = ComposerTempGraph.buildServerPayload(opts);
    // Invariant: outbound must never carry temporary_id (forbidden + R11-20).
    const leaked = (payload.nodes || []).some(
      (n) => n && Object.prototype.hasOwnProperty.call(n, 'temporary_id')
    );
    if (leaked) {
      return {
        ok: false,
        status: 0,
        message: 'Outbound payload still contains temporary_id after strip.',
        payload,
      };
    }

    if (ComposerTempGraph._sending) {
      return { ok: false, status: 0, message: 'Temporary-context sync already in progress.' };
    }
    ComposerTempGraph._sending = true;
    try {
      const result = await Api.updateTemporaryContext(pid, payload);
      if (result && result.ok !== false) {
        const returnedId =
          result.subgraph_id ||
          result.temporary_subgraph_id ||
          payload.temporary_subgraph_id ||
          null;
        if (returnedId) {
          ComposerTempGraph._temporarySubgraphId = String(returnedId);
        }
        if (!opts?.silent) {
          const n = (payload.nodes || []).length;
          const e = (payload.edges || []).length;
          Widgets.Composer?.setStatus?.(
            `Temporary context synced (${n} nodes, ${e} edges; temporary_id stripped).`
          );
        }
        return { ok: true, payload, result };
      }
      const message =
        (result && (result.message || result.detail)) ||
        'Temporary-context sync failed.';
      if (!opts?.silent) {
        Widgets.Composer?.setStatus?.(String(message));
      }
      return {
        ok: false,
        status: result?.status || result?.httpStatus || 0,
        message: String(message),
        payload,
        result,
      };
    } finally {
      ComposerTempGraph._sending = false;
    }
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
      // SPEC-016 B3 — seed imports farther apart before grouped force settles.
      const clusterR = 220;
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
   * Render per-subgraph centre chips (SPEC-017 R17-07 — read-only, no delete).
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
      const label = sg.label || sg.scanName || `Import ${index + 1}`;
      const nodeCount = (sg.nodes || []).length;
      const desc = sg.scanDescription ? ` — ${sg.scanDescription}` : '';
      const title = `${label}${desc} (${nodeCount} nodes)`;
      return (
        `<button type="button" class="composer-temp-subgraph-chip d-inline-flex align-items-center gap-1 border rounded px-2 py-1 bg-body" ` +
        `data-temp-subgraph-id="${escHtml(sg.subgraphId)}" style="border-left: 3px solid ${accent} !important;" ` +
        `title="Centre ${escHtml(title)} in the viewer">` +
        `<span class="small text-truncate" style="max-width: 14rem;" title="${escHtml(title)}">${escHtml(label)}` +
        ` <span class="text-body-secondary">(${nodeCount})</span></span>` +
        `</button>`
      );
    });
    list.innerHTML = parts.join('');
  };

  /**
   * SPEC-016 B4 — centre the temp CanvasGraph on one import's nodes.
   * @param {string} subgraphId
   * @returns {boolean}
   */
  ComposerTempGraph.centerSubgraph = function (subgraphId) {
    if (!subgraphId) return false;
    const sg = ComposerTempGraph._subgraphs.find((s) => s.subgraphId === subgraphId);
    if (!sg) return false;
    const ids = (sg.nodes || [])
      .map((n) => n.temporary_id || n.id)
      .filter(Boolean);
    const api = Widgets.Composer?.getCanvasGraph?.('temp-subgraph');
    if (!api?.centerOnNodes) return false;
    const ok = api.centerOnNodes(ids);
    if (ok) {
      Widgets.Composer?.setStatus?.(
        `Centred temporary import ${sg.label || subgraphId} (${ids.length} nodes).`
      );
    }
    return ok;
  };

  /**
   * Bind centre-chip clicks once (read-only viewer).
   */
  ComposerTempGraph.bindUi = function () {
    if (ComposerTempGraph._uiBound) return;
    ComposerTempGraph._uiBound = true;

    const list = document.getElementById('composer-temp-subgraph-list');
    if (list) {
      list.addEventListener('click', (event) => {
        const chip = event.target?.closest?.('[data-temp-subgraph-id]');
        if (!chip) return;
        event.preventDefault();
        const id = chip.getAttribute('data-temp-subgraph-id');
        if (id) ComposerTempGraph.centerSubgraph(id);
      });
    }
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
        ? `Temporary Subgraph Viewer: ${count} subgraph${count === 1 ? '' : 's'} (${n} nodes).`
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
    ComposerTempGraph._lastOutboundPayload = null;
    // SPEC-016 B1 — never reuse another project's subgraph id after clear/switch.
    ComposerTempGraph._temporarySubgraphId = null;
    ComposerTempGraph._loadedForProjectId = null;
    ComposerTempGraph.refreshViewer();
  };

  /**
   * SPEC-017 R17-07 — replace viewer from GET /contexts/temporary list.
   * @param {string} projectId
   * @returns {Promise<{ ok: boolean, subgraphCount?: number, nodeCount?: number, message?: string }>}
   */
  ComposerTempGraph.loadFromServer = async function (projectId) {
    const pid = ComposerTempGraph.resolveProjectId(projectId);
    if (!pid) {
      return { ok: false, message: 'No project id for temporary-context load.' };
    }
    const Api = Widgets.SpiderfeetApi;
    if (!Api || typeof Api.getTemporaryContext !== 'function') {
      return { ok: false, message: 'SpiderfeetApi.getTemporaryContext unavailable.' };
    }

    ComposerTempGraph.clear();
    ComposerTempGraph._loadedForProjectId = pid;

    try {
      const result = await Api.getTemporaryContext(pid);
      if (!result || result.ok === false) {
        return {
          ok: false,
          message:
            result?.detail || result?.error || result?.message || 'GET temporary context failed',
        };
      }

      const subgraphs = Array.isArray(result.subgraphs) ? result.subgraphs : [];
      const targetSg =
        subgraphs.find((sg) => sg && String(sg.scan_name || '') === 'target') ||
        subgraphs[0] ||
        null;
      const sgId =
        targetSg?.temporary_subgraph_id ||
        result.subgraph_id ||
        result.temporary_subgraph_id ||
        null;
      if (sgId) ComposerTempGraph._temporarySubgraphId = String(sgId);

      const count = ComposerTempGraph.loadSubgraphsFromList(subgraphs);
      let nodeCount = 0;
      ComposerTempGraph._subgraphs.forEach((sg) => {
        nodeCount += (sg.nodes || []).length;
      });
      return { ok: true, subgraphCount: count, nodeCount };
    } catch (err) {
      console.warn('ComposerTempGraph.loadFromServer', err);
      return { ok: false, message: (err && err.message) || String(err) };
    }
  };

  /**
   * Import one scan graph as a discrete subgraph (R11-18).
   * @param {{ nodes?: object[], edges?: object[], links?: object[] }} scanGraph
   * @param {{ stepId?: string|null, sync?: boolean }} [meta]
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
   * Deprecated — SPEC-017 B2: engine persists temps; host re-GETs the list.
   * @returns {null}
   */
  ComposerTempGraph.handleScanComplete = function () {
    return null;
  };

  /** Ensure toggle strip is bound when Composer mounts. */
  ComposerTempGraph.initFromComposer = function () {
    ComposerTempGraph.bindUi();
    ComposerTempGraph.renderSubgraphToggles();
  };
})(window.Widgets.ComposerTempGraph, window.Widgets, document, window);
