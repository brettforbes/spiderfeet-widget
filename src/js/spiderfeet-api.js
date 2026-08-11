window.Widgets = window.Widgets || {};
window.Widgets.SpiderfeetApi = window.Widgets.SpiderfeetApi || {};

/**
 * SPEC-011 AQ1 / R11-01 — v2 Projects/Composer API client (SPEC-010 AN2 contract).
 * Resolves against data-api-base (same base as Widgets.Connection).
 * Stub-tolerant: missing routes yield UI-visible { ok:false, status, message } (or empty stub for listProjects).
 */
(function (SpiderfeetApi, Widgets, document, window) {
  'use strict';

  SpiderfeetApi.DEFAULT_API_BASE = 'http://127.0.0.1:8001/api/v1';
  SpiderfeetApi._apiBase = SpiderfeetApi.DEFAULT_API_BASE;

  SpiderfeetApi.resolveApiBase = function () {
    const fromConnection =
      Widgets.Connection && Widgets.Connection._apiBase
        ? Widgets.Connection._apiBase
        : null;
    const fromDom = document.getElementById('widget-root')?.dataset?.apiBase;
    SpiderfeetApi._apiBase =
      fromConnection || fromDom || SpiderfeetApi.DEFAULT_API_BASE;
    return SpiderfeetApi._apiBase.replace(/\/$/, '');
  };

  SpiderfeetApi.apiUrl = function (path) {
    const base = SpiderfeetApi.resolveApiBase();
    if (Widgets.Connection && typeof Widgets.Connection.apiUrl === 'function') {
      return Widgets.Connection.apiUrl(path);
    }
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  };

  SpiderfeetApi._error = function (status, message, extra) {
    return Object.assign(
      { ok: false, status: status == null ? 0 : status, message: String(message || 'Request failed') },
      extra || {}
    );
  };

  SpiderfeetApi._success = function (payload, extra) {
    const body =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload
        : { data: payload };
    // Do not let HTTP `status` clobber API payload fields (e.g. execute `status: "stub"`).
    const rest = Object.assign({}, extra || {});
    const httpStatus = rest.status;
    delete rest.status;
    const out = Object.assign({ ok: true }, rest, body);
    if (httpStatus != null) out.httpStatus = httpStatus;
    return out;
  };

  SpiderfeetApi._stubEnabled = function () {
    return window.SPIDERFEET_API_STUB === true;
  };

  /**
   * Core fetch: always resolves (never throws) with { ok, status?, message?, ... }.
   */
  SpiderfeetApi.request = async function (path, options = {}) {
    const timeoutMs = options.timeoutMs ?? 15000;
    const fetchOptions = { ...options };
    delete fetchOptions.timeoutMs;

    const headers = Object.assign(
      { Accept: 'application/json' },
      fetchOptions.headers || {}
    );
    if (
      fetchOptions.body != null &&
      typeof fetchOptions.body === 'object' &&
      !(fetchOptions.body instanceof FormData) &&
      !(typeof Blob !== 'undefined' && fetchOptions.body instanceof Blob)
    ) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      fetchOptions.body = JSON.stringify(fetchOptions.body);
    }
    fetchOptions.headers = headers;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    fetchOptions.signal = controller.signal;

    try {
      const response = await fetch(SpiderfeetApi.apiUrl(path), fetchOptions);
      const text = await response.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (_parseErr) {
          data = { raw: text };
        }
      }

      if (!response.ok) {
        const detail =
          (data && (data.detail || data.message || data.error)) ||
          text ||
          response.statusText ||
          'Request failed';
        const message =
          typeof detail === 'string' ? detail : JSON.stringify(detail);
        return SpiderfeetApi._error(response.status, message, {
          path,
          body: data,
        });
      }

      return SpiderfeetApi._success(data == null ? {} : data, { status: response.status });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return SpiderfeetApi._error(0, `Request timed out after ${timeoutMs}ms`, { path });
      }
      return SpiderfeetApi._error(0, (err && err.message) || String(err), { path });
    } finally {
      clearTimeout(timer);
    }
  };

  // —— Projects ————————————————————————————————————————————————

  SpiderfeetApi.listProjects = async function () {
    if (SpiderfeetApi._stubEnabled()) {
      return { ok: true, stub: true, projects: [] };
    }
    const result = await SpiderfeetApi.request('/projects');
    if (!result.ok && result.status === 404) {
      return { ok: true, stub: true, projects: [], message: 'v2 /projects not available (stub)' };
    }
    if (!result.ok) {
      return result;
    }
    const projects = Array.isArray(result.projects)
      ? result.projects
      : Array.isArray(result.data)
        ? result.data
        : Array.isArray(result.items)
          ? result.items
          : [];
    return Object.assign({}, result, { projects });
  };

  SpiderfeetApi._mutateUnavailable = function (action) {
    return SpiderfeetApi._error(404, `${action} not available (v2 API stub)`, {
      stub: true,
      path: '/projects',
    });
  };

  SpiderfeetApi.getProject = async function (id) {
    if (SpiderfeetApi._stubEnabled()) {
      return SpiderfeetApi._mutateUnavailable('GET /projects/:id');
    }
    return SpiderfeetApi.request(`/projects/${encodeURIComponent(id)}`);
  };

  /** R13-06 / R13-15 — one-call Composer load with workflow_yaml inline. */
  SpiderfeetApi.getProjectComplete = async function (id) {
    if (SpiderfeetApi._stubEnabled()) {
      return SpiderfeetApi._mutateUnavailable('GET /projects/:id/complete');
    }
    return SpiderfeetApi.request(`/projects/${encodeURIComponent(id)}/complete`);
  };

  SpiderfeetApi.createProject = async function (body) {
    if (SpiderfeetApi._stubEnabled()) {
      return SpiderfeetApi._mutateUnavailable('POST /projects');
    }
    return SpiderfeetApi.request('/projects', { method: 'POST', body: body || {} });
  };

  SpiderfeetApi.updateProject = async function (id, body) {
    if (SpiderfeetApi._stubEnabled()) {
      return SpiderfeetApi._mutateUnavailable('PUT /projects/:id');
    }
    return SpiderfeetApi.request(`/projects/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: body || {},
    });
  };

  SpiderfeetApi.deleteProject = async function (id) {
    if (SpiderfeetApi._stubEnabled()) {
      return SpiderfeetApi._mutateUnavailable('DELETE /projects/:id');
    }
    return SpiderfeetApi.request(`/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  };

  // —— Workflows ———————————————————————————————————————————————

  SpiderfeetApi.listWorkflows = function (projectId) {
    return SpiderfeetApi.request(
      `/projects/${encodeURIComponent(projectId)}/workflows`
    );
  };

  SpiderfeetApi.getWorkflow = function (id) {
    return SpiderfeetApi.request(`/workflows/${encodeURIComponent(id)}`);
  };

  SpiderfeetApi.createWorkflow = function (projectId, body) {
    return SpiderfeetApi.request(
      `/projects/${encodeURIComponent(projectId)}/workflows`,
      { method: 'POST', body: body || {} }
    );
  };

  SpiderfeetApi.updateWorkflow = function (id, body) {
    return SpiderfeetApi.request(`/workflows/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: body || {},
    });
  };

  SpiderfeetApi.deleteWorkflow = function (id) {
    return SpiderfeetApi.request(`/workflows/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  };

  // —— Targets —————————————————————————————————————————————————

  SpiderfeetApi.listTargets = function (projectId) {
    return SpiderfeetApi.request(
      `/projects/${encodeURIComponent(projectId)}/targets`
    );
  };

  SpiderfeetApi.getTarget = function (id) {
    return SpiderfeetApi.request(`/targets/${encodeURIComponent(id)}`);
  };

  SpiderfeetApi.createTarget = function (projectId, body) {
    return SpiderfeetApi.request(
      `/projects/${encodeURIComponent(projectId)}/targets`,
      { method: 'POST', body: body || {} }
    );
  };

  SpiderfeetApi.updateTarget = function (id, body) {
    return SpiderfeetApi.request(`/targets/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: body || {},
    });
  };

  SpiderfeetApi.deleteTarget = function (id) {
    return SpiderfeetApi.request(`/targets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  };

  // —— Execute / scan steps ————————————————————————————————————

  /** Default timeout for live CLI execute (AO); stubs return immediately. */
  SpiderfeetApi.EXECUTE_TIMEOUT_MS = 300000;

  /**
   * Map a scan-step / execute payload to CliScanApp `detail` (four forms).
   * Accepts AL3 projection field names and CliScanApp detail aliases.
   * @param {object|null} payload
   * @returns {object|null}
   */
  SpiderfeetApi.scanStepToDetail = function (payload) {
    if (!payload || typeof payload !== 'object') return null;

    const text =
      payload.output_text != null
        ? payload.output_text
        : payload.text_form != null
          ? payload.text_form
          : null;
    const narrative =
      payload.narrative_markdown != null
        ? payload.narrative_markdown
        : payload.graph_description_markdown != null
          ? payload.graph_description_markdown
          : payload.markdown_narrative_form != null
            ? payload.markdown_narrative_form
            : null;
    const command =
      payload.command != null
        ? payload.command
        : payload.cli_command != null
          ? payload.cli_command
          : null;

    let structured = payload.structured || null;
    if (!structured) {
      const raw =
        payload.structured_form != null ? payload.structured_form : null;
      if (raw != null && raw !== '') {
        const format =
          payload.scan_ui_structured_form_type ||
          payload.structured_type ||
          payload.structured_format ||
          'json';
        structured = {
          content: typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2),
          format: String(format).toLowerCase(),
          filename: payload.structured_filename || `scan.${String(format).toLowerCase()}`,
        };
      }
    } else if (typeof structured === 'string') {
      structured = {
        content: structured,
        format: 'json',
        filename: 'scan.json',
      };
    } else if (structured && structured.content == null && typeof structured === 'object') {
      structured = {
        content: JSON.stringify(structured, null, 2),
        format: 'json',
        filename: 'scan.json',
      };
    }

    let graphProposal = payload.graph_proposal || null;
    if (!graphProposal) {
      const rawGraph = payload.graph_form != null ? payload.graph_form : payload.graph;
      if (typeof rawGraph === 'string' && rawGraph.trim()) {
        try {
          graphProposal = JSON.parse(rawGraph);
        } catch (_err) {
          graphProposal = { nodes: [], edges: [], parse_error: true };
        }
      } else if (rawGraph && typeof rawGraph === 'object') {
        graphProposal = rawGraph;
      }
    }
    if (graphProposal && !Array.isArray(graphProposal.edges) && Array.isArray(graphProposal.links)) {
      graphProposal = {
        nodes: graphProposal.nodes || [],
        edges: graphProposal.links,
      };
    }

    const detail = {};
    if (command != null) detail.command = command;
    if (text != null) detail.output_text = text;
    if (structured) detail.structured = structured;
    if (graphProposal) detail.graph_proposal = graphProposal;
    if (narrative != null) {
      detail.narrative_markdown = narrative;
      detail.graph_description_markdown = narrative;
      detail.markdown = narrative;
    }
    if (payload.scan_instance_id) detail.scan_instance_id = payload.scan_instance_id;
    if (Array.isArray(payload.argv)) detail.argv = payload.argv;

    return Object.keys(detail).length ? detail : null;
  };

  SpiderfeetApi.executeStep = function (workflowId, stepId, options) {
    const opts = options && typeof options === 'object' ? { ...options } : {};
    const timeoutMs =
      opts.timeoutMs != null ? opts.timeoutMs : SpiderfeetApi.EXECUTE_TIMEOUT_MS;
    delete opts.timeoutMs;
    return SpiderfeetApi.request(
      `/workflows/${encodeURIComponent(workflowId)}/steps/${encodeURIComponent(stepId)}/execute`,
      { method: 'POST', body: opts, timeoutMs }
    );
  };

  SpiderfeetApi.executeWorkflow = function (workflowId, options) {
    const opts = options && typeof options === 'object' ? { ...options } : {};
    const timeoutMs =
      opts.timeoutMs != null ? opts.timeoutMs : SpiderfeetApi.EXECUTE_TIMEOUT_MS;
    delete opts.timeoutMs;
    return SpiderfeetApi.request(
      `/workflows/${encodeURIComponent(workflowId)}/execute`,
      { method: 'POST', body: opts, timeoutMs }
    );
  };

  /**
   * SPEC-015 R15-12 — background full-workflow execute (202 + run_id).
   * Poll {@link SpiderfeetApi.getWorkflowStatus} for live step progress.
   */
  SpiderfeetApi.executeWorkflowAsync = function (workflowId, options) {
    const opts = options && typeof options === 'object' ? { ...options } : {};
    delete opts.timeoutMs;
    return SpiderfeetApi.request(
      `/workflows/${encodeURIComponent(workflowId)}/execute-async`,
      { method: 'POST', body: opts }
    );
  };

  /**
   * SPEC-015 R15-12 — background single-step execute (202 + run_id).
   */
  SpiderfeetApi.executeStepAsync = function (workflowId, stepId, options) {
    const opts = options && typeof options === 'object' ? { ...options } : {};
    delete opts.timeoutMs;
    return SpiderfeetApi.request(
      `/workflows/${encodeURIComponent(workflowId)}/steps/${encodeURIComponent(stepId)}/execute-async`,
      { method: 'POST', body: opts }
    );
  };

  /**
   * SPEC-015 R15-12 — cheap per-step scan_status for DAG live progress.
   * @returns {Promise<{workflow_id:string, run_id?:string, run_state?:string, steps:Array}>}
   */
  SpiderfeetApi.getWorkflowStatus = function (workflowId) {
    return SpiderfeetApi.request(
      `/workflows/${encodeURIComponent(workflowId)}/status`
    );
  };

  /** Clear all step scan results + temporary context; keep workflow YAML (SPEC-015 R15-04/16). */
  SpiderfeetApi.resetWorkflow = function (workflowId, options) {
    const opts = options && typeof options === 'object' ? { ...options } : {};
    return SpiderfeetApi.request(
      `/workflows/${encodeURIComponent(workflowId)}/reset`,
      { method: 'POST', body: opts }
    );
  };

  SpiderfeetApi.getScanStep = function (id) {
    return SpiderfeetApi.request(`/scan-steps/${encodeURIComponent(id)}`);
  };

  SpiderfeetApi.listScanSteps = function () {
    return SpiderfeetApi.request('/scan-steps');
  };

  /**
   * DNS namespace UUID — matches `spiderfeet_v2.workflow.typedb_convert._WORKFLOW_ID_NS`.
   * Used for deterministic `scan_instance_id` (R11-17 / AV2).
   */
  SpiderfeetApi.WORKFLOW_ID_NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

  SpiderfeetApi._uuidToBytes = function (uuid) {
    const hex = String(uuid || '').replace(/-/g, '');
    if (hex.length !== 32) {
      throw new Error(`Invalid UUID for namespace: ${uuid}`);
    }
    const out = new Uint8Array(16);
    for (let i = 0; i < 16; i += 1) {
      out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  };

  SpiderfeetApi._bytesToUuid = function (bytes) {
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return (
      `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
      `${hex.slice(16, 20)}-${hex.slice(20, 32)}`
    );
  };

  /**
   * RFC 4122 UUID v5 (SHA-1). Sync when Node `crypto` is available; else SubtleCrypto.
   * @param {string} namespaceUuid
   * @param {string} name
   * @returns {string|Promise<string>}
   */
  SpiderfeetApi.uuid5 = function (namespaceUuid, name) {
    const nsBytes = SpiderfeetApi._uuidToBytes(namespaceUuid);
    const nameStr = String(name ?? '');
    const finish = (digest) => {
      const hash = new Uint8Array(digest);
      hash[6] = (hash[6] & 0x0f) | 0x50;
      hash[8] = (hash[8] & 0x3f) | 0x80;
      return SpiderfeetApi._bytesToUuid(hash.slice(0, 16));
    };

    // Node / webpack sanity scripts
    try {
      // eslint-disable-next-line global-require, import/no-extraneous-dependencies
      const nodeCrypto = typeof require === 'function' ? require('crypto') : null;
      if (nodeCrypto?.createHash) {
        const hash = nodeCrypto
          .createHash('sha1')
          .update(Buffer.from(nsBytes))
          .update(nameStr, 'utf8')
          .digest();
        return finish(hash);
      }
    } catch (_err) {
      /* browser path */
    }

    const nameBytes = new TextEncoder().encode(nameStr);
    const data = new Uint8Array(nsBytes.length + nameBytes.length);
    data.set(nsBytes, 0);
    data.set(nameBytes, nsBytes.length);
    return crypto.subtle.digest('SHA-1', data).then(finish);
  };

  /**
   * Deterministic scan_step id for a workflow DSL step (SPEC-010 typedb_convert).
   * @param {string} workflowId
   * @param {string} stepId
   * @returns {string|Promise<string>}
   */
  SpiderfeetApi.scanInstanceIdFor = function (workflowId, stepId) {
    const wf = String(workflowId || '').trim();
    const step = String(stepId || '').trim();
    if (!wf || !step) return '';
    const uuid = SpiderfeetApi.uuid5(
      SpiderfeetApi.WORKFLOW_ID_NS,
      `${wf}:${step}`
    );
    if (uuid && typeof uuid.then === 'function') {
      return uuid.then((id) => `scan_step--${id}`);
    }
    return `scan_step--${uuid}`;
  };

  /**
   * True when a scan-step / detail payload carries at least one of the four forms.
   * @param {object|null} payload
   * @returns {boolean}
   */
  SpiderfeetApi.scanStepHasFourForms = function (payload) {
    const detail = SpiderfeetApi.scanStepToDetail(payload);
    if (!detail) return false;
    if (detail.output_text) return true;
    if (detail.narrative_markdown) return true;
    if (
      detail.graph_proposal &&
      (detail.graph_proposal.nodes?.length ||
        detail.graph_proposal.edges?.length ||
        detail.graph_proposal.links?.length)
    ) {
      return true;
    }
    const structured = detail.structured;
    if (structured == null) return false;
    if (typeof structured === 'string') return structured.length > 0;
    if (typeof structured === 'object') {
      if (structured.content != null && structured.content !== '') return true;
      return Object.keys(structured).length > 0;
    }
    return false;
  };

  /**
   * Load a persisted prior run for workflow+step (R11-17 / AV2).
   * Uses deterministic scan_instance_id; 404 / empty forms → null (unset step).
   * @param {string} workflowId
   * @param {string} stepId
   * @returns {Promise<{ scanInstanceId: string, payload: object, detail: object }|null>}
   */
  SpiderfeetApi.fetchPriorScanStep = async function (workflowId, stepId) {
    const wf = String(workflowId || '').trim();
    const step = String(stepId || '').trim();
    if (!wf || !step) return null;

    let scanInstanceId = SpiderfeetApi.scanInstanceIdFor(wf, step);
    if (scanInstanceId && typeof scanInstanceId.then === 'function') {
      scanInstanceId = await scanInstanceId;
    }
    if (!scanInstanceId) return null;

    const payload = await SpiderfeetApi.getScanStep(scanInstanceId);
    if (!payload || payload.ok === false) return null;
    if (!SpiderfeetApi.scanStepHasFourForms(payload)) return null;

    const detail = SpiderfeetApi.scanStepToDetail(payload);
    if (!detail) return null;
    return { scanInstanceId, payload, detail };
  };

  // —— Contexts ————————————————————————————————————————————————

  /**
   * SPEC-017 R17-04 / R17-07 — list all project temporary subgraphs.
   * Normalizes `{ project_id, subgraphs: [{ temporary_subgraph_id, scan_name, scan_description, nodes, edges }] }`.
   * @param {string} projectId
   * @returns {Promise<object>}
   */
  SpiderfeetApi.getTemporaryContext = async function (projectId) {
    const result = await SpiderfeetApi.request(
      `/projects/${encodeURIComponent(projectId)}/contexts/temporary`
    );
    if (!result || result.ok === false) return result;
    const subgraphs = Array.isArray(result.subgraphs)
      ? result.subgraphs
      : result.nodes != null || result.edges != null
        ? [
            {
              temporary_subgraph_id:
                result.temporary_subgraph_id || result.subgraph_id || null,
              scan_name: result.scan_name || 'legacy',
              scan_description: result.scan_description || null,
              nodes: Array.isArray(result.nodes) ? result.nodes : [],
              edges: Array.isArray(result.edges) ? result.edges : [],
            },
          ]
        : [];
    return Object.assign({}, result, { subgraphs });
  };

  SpiderfeetApi.updateTemporaryContext = function (projectId, body) {
    return SpiderfeetApi.request(
      `/projects/${encodeURIComponent(projectId)}/contexts/temporary`,
      { method: 'PUT', body: body || {} }
    );
  };

  SpiderfeetApi.getProjectContext = function (projectId) {
    return SpiderfeetApi.request(
      `/projects/${encodeURIComponent(projectId)}/contexts/project`
    );
  };
})(window.Widgets.SpiderfeetApi, window.Widgets, document, window);
