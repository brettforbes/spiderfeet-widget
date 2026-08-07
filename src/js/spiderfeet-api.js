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
    return Object.assign({ ok: true }, body, extra || {});
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

  SpiderfeetApi.getProject = function (id) {
    return SpiderfeetApi.request(`/projects/${encodeURIComponent(id)}`);
  };

  SpiderfeetApi.createProject = function (body) {
    return SpiderfeetApi.request('/projects', { method: 'POST', body: body || {} });
  };

  SpiderfeetApi.updateProject = function (id, body) {
    return SpiderfeetApi.request(`/projects/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: body || {},
    });
  };

  SpiderfeetApi.deleteProject = function (id) {
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

  SpiderfeetApi.executeStep = function (workflowId, stepId, options) {
    return SpiderfeetApi.request(
      `/workflows/${encodeURIComponent(workflowId)}/steps/${encodeURIComponent(stepId)}/execute`,
      { method: 'POST', body: options || {} }
    );
  };

  SpiderfeetApi.executeWorkflow = function (workflowId, options) {
    return SpiderfeetApi.request(
      `/workflows/${encodeURIComponent(workflowId)}/execute`,
      { method: 'POST', body: options || {} }
    );
  };

  SpiderfeetApi.getScanStep = function (id) {
    return SpiderfeetApi.request(`/scan-steps/${encodeURIComponent(id)}`);
  };

  // —— Contexts ————————————————————————————————————————————————

  SpiderfeetApi.getTemporaryContext = function (projectId) {
    return SpiderfeetApi.request(
      `/projects/${encodeURIComponent(projectId)}/temporary-context`
    );
  };

  SpiderfeetApi.updateTemporaryContext = function (projectId, body) {
    return SpiderfeetApi.request(
      `/projects/${encodeURIComponent(projectId)}/temporary-context`,
      { method: 'PUT', body: body || {} }
    );
  };

  SpiderfeetApi.getProjectContext = function (projectId) {
    return SpiderfeetApi.request(
      `/projects/${encodeURIComponent(projectId)}/project-context`
    );
  };
})(window.Widgets.SpiderfeetApi, window.Widgets, document, window);
