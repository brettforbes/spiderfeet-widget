window.Widgets = window.Widgets || {};
window.Widgets.Projects = window.Widgets.Projects || {};
window.Widgets.Composer = window.Widgets.Composer || {};

/**
 * SPEC-011 AQ3–AQ4 / R11-03…R11-05 — Projects table + CRUD; row → Composer.
 */
(function ($, Projects, Composer, Widgets, SpiderfeetApi, document, window) {
  'use strict';

  Projects.selectorPanel = '[data-widget="projects-panel"]';
  Projects.STORAGE_PROJECT_ID = 'spiderfeet.composer.projectId';
  Projects.STORAGE_PROJECT = 'spiderfeet.composer.project';
  Projects._loading = false;
  Projects._loadedOnce = false;
  Projects._projectsById = {};
  Projects._modal = null;
  Projects._busy = false;

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

  Projects.setComposerStatus = function (message) {
    const el = document.getElementById('composer-status-text');
    if (el) el.textContent = message;
  };

  Projects.clearAlert = function () {
    const el = document.getElementById('projects-alert');
    if (!el) return;
    el.className = 'px-3 pt-2 flex-shrink-0 d-none';
    el.innerHTML = '';
  };

  Projects.showAlert = function (message, kind) {
    const el = document.getElementById('projects-alert');
    if (!el) return;
    const variant = kind === 'success' ? 'success' : kind === 'warning' ? 'warning' : 'danger';
    el.className = 'px-3 pt-2 flex-shrink-0';
    el.innerHTML = `
      <div class="alert alert-${variant} alert-dismissible fade show mb-0 py-2 small" role="alert">
        ${Projects.escapeHtml(message || 'Something went wrong')}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>`;
  };

  Projects.projectId = function (project) {
    if (!project || typeof project !== 'object') return '';
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

  Projects.normalizeProject = function (payload, fallbackId) {
    if (!payload || typeof payload !== 'object') {
      return fallbackId ? { id: fallbackId, project_id: fallbackId } : null;
    }
    const nested =
      payload.project && typeof payload.project === 'object'
        ? payload.project
        : payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
          ? payload.data
          : payload;
    const id = Projects.projectId(nested) || fallbackId || '';
    if (!id) return nested;
    return Object.assign({}, nested, { id, project_id: nested.project_id || id });
  };

  Projects.apiUnavailableMessage = function (action, result) {
    const status = result && result.status;
    if (status === 404) {
      return `${action} is not available yet (v2 /projects returned 404).`;
    }
    if (result && result.stub) {
      return `${action} is unavailable while the API is in stub mode.`;
    }
    return (result && result.message) || `${action} failed.`;
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
        return `<tr class="projects-row" data-project-id="${Projects.escapeHtml(id)}" role="button" tabindex="0" title="Open in Composer">
          <td><code class="small">${Projects.escapeHtml(id || '—')}</code></td>
          <td class="small">${Projects.escapeHtml(created)}</td>
          <td class="small text-end">${Projects.escapeHtml(String(count))}</td>
          <td class="small"><code class="small">${Projects.escapeHtml(stix)}</code></td>
          <td class="text-end text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-secondary me-1" data-project-action="edit" title="Edit project">
              <i class="fa-solid fa-pen" aria-hidden="true"></i>
              <span class="visually-hidden">Edit</span>
            </button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-project-action="delete" title="Delete project">
              <i class="fa-solid fa-trash" aria-hidden="true"></i>
              <span class="visually-hidden">Delete</span>
            </button>
          </td>
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
              <th scope="col" class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>`;

    Projects.bindTable(main);
  };

  Projects.bindTable = function (root) {
    root.querySelectorAll('.projects-row').forEach((row) => {
      row.addEventListener('click', (event) => {
        if (event.target.closest('[data-project-action]')) return;
        const id = row.dataset.projectId;
        if (id) Projects.openProjectInComposer(id);
      });
      row.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (event.target.closest('[data-project-action]')) return;
        event.preventDefault();
        const id = row.dataset.projectId;
        if (id) Projects.openProjectInComposer(id);
      });
    });

    root.querySelectorAll('[data-project-action]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const row = btn.closest('[data-project-id]');
        const id = row && row.dataset.projectId;
        if (!id) return;
        const action = btn.dataset.projectAction;
        if (action === 'edit') {
          Projects.openEditModal(id);
        } else if (action === 'delete') {
          Projects.deleteProject(id);
        }
      });
    });
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
      Projects._projectsById = {};
      projects.forEach((project) => {
        const normalized = Projects.normalizeProject(project);
        const id = Projects.projectId(normalized);
        if (id) Projects._projectsById[id] = normalized;
      });

      if (!projects.length) {
        const emptyNote = result.stub
          ? result.message || 'API returned an empty stub list.'
          : '';
        Projects.showEmpty(emptyNote);
        Projects.setStatus(result.stub ? 'No projects (stub).' : 'No projects.');
        return;
      }

      Projects.renderTable(projects.map((p) => Projects.normalizeProject(p)));
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

  Projects.getModal = function () {
    const el = document.getElementById('projects-modal');
    if (!el || !window.bootstrap || !window.bootstrap.Modal) return null;
    if (!Projects._modal) {
      Projects._modal = window.bootstrap.Modal.getOrCreateInstance(el);
    }
    return Projects._modal;
  };

  Projects.setFormError = function (message) {
    const el = document.getElementById('projects-form-error');
    if (!el) return;
    if (!message) {
      el.classList.add('d-none');
      el.textContent = '';
      return;
    }
    el.classList.remove('d-none');
    el.textContent = message;
  };

  Projects.openCreateModal = function () {
    const title = document.getElementById('projects-modal-title');
    const idInput = document.getElementById('projects-form-id');
    const stixInput = document.getElementById('projects-form-stix');
    const submit = document.getElementById('projects-form-submit');
    if (title) title.textContent = 'New Project';
    if (idInput) idInput.value = '';
    if (stixInput) stixInput.value = '';
    if (submit) submit.textContent = 'Create';
    Projects.setFormError('');
    Projects.clearAlert();
    const modal = Projects.getModal();
    if (modal) modal.show();
    else Projects.showAlert('Bootstrap Modal is not available.');
  };

  Projects.openEditModal = function (projectId) {
    const project = Projects._projectsById[projectId] || { id: projectId };
    const title = document.getElementById('projects-modal-title');
    const idInput = document.getElementById('projects-form-id');
    const stixInput = document.getElementById('projects-form-stix');
    const submit = document.getElementById('projects-form-submit');
    if (title) title.textContent = 'Edit Project';
    if (idInput) idInput.value = projectId;
    if (stixInput) stixInput.value = Projects.stixIncidentId(project);
    if (submit) submit.textContent = 'Save';
    Projects.setFormError('');
    Projects.clearAlert();
    const modal = Projects.getModal();
    if (modal) modal.show();
    else Projects.showAlert('Bootstrap Modal is not available.');
  };

  Projects.buildFormBody = function () {
    const stix = (document.getElementById('projects-form-stix')?.value || '').trim();
    const body = {};
    if (stix) body.stix_incident_id = stix;
    return body;
  };

  Projects.submitForm = async function (event) {
    event.preventDefault();
    if (Projects._busy) return;
    Projects._busy = true;
    Projects.setFormError('');

    const editId = (document.getElementById('projects-form-id')?.value || '').trim();
    const body = Projects.buildFormBody();
    const submit = document.getElementById('projects-form-submit');
    if (submit) submit.disabled = true;

    try {
      let result;
      if (editId) {
        if (!SpiderfeetApi || typeof SpiderfeetApi.updateProject !== 'function') {
          Projects.setFormError('SpiderfeetApi.updateProject is not available.');
          return;
        }
        result = await SpiderfeetApi.updateProject(editId, body);
        if (!result || !result.ok) {
          Projects.setFormError(Projects.apiUnavailableMessage('Update project', result));
          return;
        }
        Projects.getModal()?.hide();
        Projects.showAlert(`Updated project ${editId}.`, 'success');
      } else {
        if (!SpiderfeetApi || typeof SpiderfeetApi.createProject !== 'function') {
          Projects.setFormError('SpiderfeetApi.createProject is not available.');
          return;
        }
        result = await SpiderfeetApi.createProject(body);
        if (!result || !result.ok) {
          Projects.setFormError(Projects.apiUnavailableMessage('Create project', result));
          return;
        }
        const created = Projects.normalizeProject(result);
        const createdId = Projects.projectId(created) || '(new)';
        Projects.getModal()?.hide();
        Projects.showAlert(`Created project ${createdId}.`, 'success');
      }

      await Projects.loadProjects();
    } catch (err) {
      Projects.setFormError((err && err.message) || String(err));
    } finally {
      Projects._busy = false;
      if (submit) submit.disabled = false;
    }
  };

  Projects.deleteProject = async function (projectId) {
    if (Projects._busy) return;
    if (
      !window.confirm(
        `Delete project ${projectId}?\n\nThis cannot be undone. The list will refresh to verify removal.`
      )
    ) {
      return;
    }

    Projects._busy = true;
    Projects.clearAlert();
    Projects.setStatus(`Deleting ${projectId}…`);

    try {
      if (!SpiderfeetApi || typeof SpiderfeetApi.deleteProject !== 'function') {
        Projects.showAlert('SpiderfeetApi.deleteProject is not available.');
        return;
      }

      const result = await SpiderfeetApi.deleteProject(projectId);
      if (!result || !result.ok) {
        Projects.showAlert(Projects.apiUnavailableMessage('Delete project', result));
        Projects.setStatus('Delete failed.');
        return;
      }

      await Projects.loadProjects();

      const stillPresent = Boolean(Projects._projectsById[projectId]);
      if (stillPresent) {
        Projects.showAlert(
          `Delete reported success, but ${projectId} still appears after refresh.`,
          'warning'
        );
        Projects.setStatus('Delete not verified after refresh.');
      } else {
        Projects.showAlert(`Deleted project ${projectId} (verified by refresh).`, 'success');
        Projects.setStatus(`Deleted ${projectId}.`);
      }
    } catch (err) {
      Projects.showAlert((err && err.message) || String(err));
      Projects.setStatus('Delete failed.');
    } finally {
      Projects._busy = false;
    }
  };

  Projects.persistSelectedProject = function (project) {
    const id = Projects.projectId(project);
    Composer.selectedProjectId = id || null;
    Composer.selectedProject = project || null;
    try {
      if (id) {
        sessionStorage.setItem(Projects.STORAGE_PROJECT_ID, id);
        sessionStorage.setItem(Projects.STORAGE_PROJECT, JSON.stringify(project));
      } else {
        sessionStorage.removeItem(Projects.STORAGE_PROJECT_ID);
        sessionStorage.removeItem(Projects.STORAGE_PROJECT);
      }
    } catch (_err) {
      /* ignore quota / private mode */
    }

    try {
      const url = new URL(window.location.href);
      if (id) {
        url.searchParams.set('tab', 'composer');
        url.searchParams.set('project', id);
      } else {
        url.searchParams.delete('project');
      }
      history.replaceState(
        { tab: 'composer', projectId: id || null },
        '',
        url.toString()
      );
    } catch (_err) {
      /* ignore */
    }
  };

  /**
   * Update Composer chrome (label / meta / status) without replacing the AR1 layout.
   */
  Projects.renderComposerPlaceholder = function (project, note) {
    const label = document.getElementById('composer-project-label');
    const meta = document.getElementById('composer-project-meta');
    const id = Projects.projectId(project);

    if (label) {
      label.textContent = id ? `Project ${id}` : 'No project selected';
    }

    if (!id) {
      if (meta) {
        meta.textContent = '';
        meta.classList.add('d-none');
      }
      Projects.setComposerStatus('No project selected. Choose one from Projects.');
      return;
    }

    const stix = Projects.stixIncidentId(project) || '—';
    const created = Projects.formatCreated(Projects.projectCreated(project));
    const workflows = Projects.workflowCount(project);
    if (meta) {
      meta.textContent = `${created} · ${workflows} workflow(s) · STIX ${stix}`;
      meta.classList.remove('d-none');
      if (note) {
        meta.title = note;
      } else {
        meta.removeAttribute('title');
      }
    }

    Projects.setComposerStatus(
      note ? `Loaded project ${id} (partial).` : `Loaded project ${id}.`
    );
  };

  Projects.openProjectInComposer = async function (projectId) {
    if (!projectId || Projects._busy) return;
    Projects._busy = true;
    Projects.clearAlert();
    Projects.setStatus(`Opening ${projectId}…`);

    let project = Projects._projectsById[projectId]
      ? Object.assign({}, Projects._projectsById[projectId])
      : { id: projectId, project_id: projectId };
    let note = '';

    try {
      if (SpiderfeetApi && typeof SpiderfeetApi.getProject === 'function') {
        const result = await SpiderfeetApi.getProject(projectId);
        if (result && result.ok) {
          project = Projects.normalizeProject(result, projectId);
        } else {
          note = Projects.apiUnavailableMessage('Fetch project', result);
          note += ' Using list-row data for navigation.';
        }
      }
    } catch (err) {
      note = (err && err.message) || String(err);
    }

    Projects.persistSelectedProject(project);
    Projects.renderComposerPlaceholder(project, note || null);

    // AS2 / R11-10 — push workflow_yaml into the editor when the project carries it.
    if (Widgets.ComposerWorkflow?.syncYamlFromComposer) {
      Widgets.ComposerWorkflow.syncYamlFromComposer();
    }

    if (Widgets.Shell && typeof Widgets.Shell.activateTab === 'function') {
      Widgets.Shell.activateTab('composer');
    }

    Projects.setStatus(
      note ? `Opened ${projectId} (partial).` : `Opened ${projectId} in Composer.`
    );
    if (note) {
      Projects.showAlert(note, 'warning');
    }
    Projects._busy = false;
  };

  Projects.restoreComposerFromStorage = async function () {
    let projectId = null;
    try {
      const url = new URL(window.location.href);
      projectId = url.searchParams.get('project');
    } catch (_err) {
      /* ignore */
    }
    if (!projectId) {
      try {
        projectId = sessionStorage.getItem(Projects.STORAGE_PROJECT_ID);
      } catch (_err) {
        projectId = null;
      }
    }
    if (!projectId) {
      Projects.renderComposerPlaceholder(null);
      return;
    }

    let cached = null;
    try {
      const raw = sessionStorage.getItem(Projects.STORAGE_PROJECT);
      if (raw) cached = JSON.parse(raw);
    } catch (_err) {
      cached = null;
    }

    let project = Projects.normalizeProject(cached, projectId) || {
      id: projectId,
      project_id: projectId,
    };
    let note = '';

    if (SpiderfeetApi && typeof SpiderfeetApi.getProject === 'function') {
      const result = await SpiderfeetApi.getProject(projectId);
      if (result && result.ok) {
        project = Projects.normalizeProject(result, projectId);
      } else {
        note = Projects.apiUnavailableMessage('Re-fetch project', result);
      }
    }

    Projects.persistSelectedProject(project);
    Projects.renderComposerPlaceholder(project, note || null);

    if (Widgets.ComposerWorkflow?.syncYamlFromComposer) {
      Widgets.ComposerWorkflow.syncYamlFromComposer();
    }
  };

  Projects.bindToolbar = function (root) {
    root.querySelector('#projects-refresh')?.addEventListener('click', () => {
      Projects.clearAlert();
      Projects.loadProjects();
    });
    root.querySelector('#projects-new')?.addEventListener('click', () => {
      Projects.openCreateModal();
    });
    root.querySelector('#projects-form')?.addEventListener('submit', (event) => {
      Projects.submitForm(event);
    });
  };

  Projects.enableComposerNav = function () {
    const btn = document.querySelector('[data-shell-tab="composer"]');
    if (!btn) return;
    btn.disabled = false;
    btn.removeAttribute('title');
  };

  Projects.initPanel = function ($root) {
    const el = $root[0];
    if (el.dataset.initialized) return;
    el.dataset.initialized = 'true';

    Projects.enableComposerNav();
    Projects.bindToolbar(el);

    window.addEventListener('shell:tab-changed', (event) => {
      if (event.detail?.tabId === 'projects') {
        Projects.loadProjects();
      }
      if (event.detail?.tabId === 'composer') {
        Projects.restoreComposerFromStorage();
      }
    });

    const pane = document.getElementById('pane-projects');
    if (pane && pane.classList.contains('active') && !pane.classList.contains('d-none')) {
      Projects.loadProjects();
    }

    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('tab') === 'composer') {
        Projects.restoreComposerFromStorage().then(() => {
          if (Widgets.Shell && typeof Widgets.Shell.activateTab === 'function') {
            Widgets.Shell.activateTab('composer');
          }
        });
      }
    } catch (_err) {
      /* ignore */
    }
  };

  Widgets.watchDOMForComponent(Projects.selectorPanel, Projects.initPanel);
})(
  window.jQuery,
  window.Widgets.Projects,
  window.Widgets.Composer,
  window.Widgets,
  window.Widgets.SpiderfeetApi,
  document,
  window
);
