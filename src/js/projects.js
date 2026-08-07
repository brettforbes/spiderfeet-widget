window.Widgets = window.Widgets || {};
window.Widgets.Projects = window.Widgets.Projects || {};

/**
 * SPEC-011 AQ3 / R11-03 — Projects table (list from GET /projects).
 * Empty / loading / error states. CRUD and row→Composer are AQ4.
 */
(function ($, Projects, Widgets, SpiderfeetApi, document, window) {
  'use strict';

  Projects.selectorPanel = '[data-widget="projects-panel"]';
  Projects._loading = false;
  Projects._loadedOnce = false;

  Projects.escapeHtml = function (text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  Projects.setStatus = function (message) {
    const el = document.getElementById('projects-status-text');
    if (el) el.textContent = message;
  };

  Projects.projectId = function (project) {
    return project.id || project.project_id || '';
  };

  Projects.projectCreated = function (project) {
    return project.created || project.created_at || project.createdAt || '';
  };

  Projects.workflowCount = function (project) {
    if (typeof project.workflow_count === 'number') return project.workflow_count;
    if (typeof project.workflows_count === 'number') return project.workflows_count;
    if (Array.isArray(project.workflows)) return project.workflows.length;
    return 0;
  };

  Projects.stixIncidentId = function (project) {
    return (
      project.stix_incident_id ||
      project.stixIncidentId ||
      project.stix_incident ||
      ''
    );
  };

  Projects.formatCreated = function (value) {
    if (!value) return '—';
    const raw = String(value);
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString();
    }
    return raw;
  };

  Projects.showLoading = function () {
    const main = document.getElementById('projects-main');
    if (!main) return;
    main.innerHTML = `
      <div class="d-flex align-items-center justify-content-center py-5 text-body-secondary" role="status">
        <div class="spinner-border spinner-border-sm me-2" aria-hidden="true"></div>
        <span>Loading projects…</span>
      </div>`;
  };

  Projects.showEmpty = function (message) {
    const main = document.getElementById('projects-main');
    if (!main) return;
    const note = message
      ? `<p class="small text-body-secondary mb-0 mt-1">${Projects.escapeHtml(message)}</p>`
      : '';
    main.innerHTML = `
      <div class="text-center py-5" id="projects-empty">
        <p class="mb-0">No projects yet.</p>
        ${note}
      </div>`;
  };

  Projects.showError = function (message) {
    const main = document.getElementById('projects-main');
    if (!main) return;
    main.innerHTML = `
      <div class="alert alert-danger mb-0" role="alert" id="projects-error">
        <strong>Could not load projects.</strong>
        <div class="small mt-1">${Projects.escapeHtml(message || 'Unknown error')}</div>
      </div>`;
  };

  Projects.renderTable = function (projects) {
    const main = document.getElementById('projects-main');
    if (!main) return;
    const rows = projects
      .map((project) => {
        const id = Projects.projectId(project);
        const created = Projects.formatCreated(Projects.projectCreated(project));
        const count = Projects.workflowCount(project);
        const stix = Projects.stixIncidentId(project) || '—';
        return `<tr data-project-id="${Projects.escapeHtml(id)}">
          <td><code class="small">${Projects.escapeHtml(id || '—')}</code></td>
          <td class="small">${Projects.escapeHtml(created)}</td>
          <td class="small text-end">${Projects.escapeHtml(String(count))}</td>
          <td class="small"><code class="small">${Projects.escapeHtml(stix)}</code></td>
        </tr>`;
      })
      .join('');

    main.innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle mb-0" id="projects-table">
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Created</th>
              <th scope="col" class="text-end">Workflows</th>
              <th scope="col">STIX incident ID</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>`;
  };

  Projects.loadProjects = async function () {
    if (Projects._loading) return;
    Projects._loading = true;
    Projects.showLoading();
    Projects.setStatus('Loading projects…');

    try {
      if (!SpiderfeetApi || typeof SpiderfeetApi.listProjects !== 'function') {
        Projects.showError('SpiderfeetApi.listProjects is not available.');
        Projects.setStatus('Projects API client missing.');
        return;
      }

      const result = await SpiderfeetApi.listProjects();
      if (!result || !result.ok) {
        const message =
          (result && result.message) || 'GET /projects failed';
        Projects.showError(message);
        Projects.setStatus(`Load failed: ${message}`);
        return;
      }

      const projects = Array.isArray(result.projects) ? result.projects : [];
      Projects._loadedOnce = true;

      if (!projects.length) {
        const emptyNote = result.stub
          ? result.message || 'API returned an empty stub list.'
          : '';
        Projects.showEmpty(emptyNote);
        Projects.setStatus(result.stub ? 'No projects (stub).' : 'No projects.');
        return;
      }

      Projects.renderTable(projects);
      Projects.setStatus(
        `${projects.length} project${projects.length === 1 ? '' : 's'}` +
          (result.stub ? ' (stub)' : '')
      );
    } catch (err) {
      const message = (err && err.message) || String(err);
      Projects.showError(message);
      Projects.setStatus(`Load failed: ${message}`);
    } finally {
      Projects._loading = false;
    }
  };

  Projects.bindToolbar = function (root) {
    root.querySelector('#projects-refresh')?.addEventListener('click', () => {
      Projects.loadProjects();
    });
  };

  Projects.initPanel = function ($root) {
    const el = $root[0];
    if (el.dataset.initialized) return;
    el.dataset.initialized = 'true';

    Projects.bindToolbar(el);

    window.addEventListener('shell:tab-changed', (event) => {
      if (event.detail?.tabId === 'projects') {
        Projects.loadProjects();
      }
    });

    const pane = document.getElementById('pane-projects');
    if (pane && pane.classList.contains('active') && !pane.classList.contains('d-none')) {
      Projects.loadProjects();
    }
  };

  Widgets.watchDOMForComponent(Projects.selectorPanel, Projects.initPanel);
})(
  window.jQuery,
  window.Widgets.Projects,
  window.Widgets,
  window.Widgets.SpiderfeetApi,
  document,
  window
);
