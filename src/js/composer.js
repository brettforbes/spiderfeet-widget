window.Widgets = window.Widgets || {};
window.Widgets.Composer = window.Widgets.Composer || {};

/**
 * SPEC-011 AR1–AR3 / R11-06–R11-08 — Composer shell, expand/revert, CanvasGraph viewers.
 */
(function ($, Composer, Widgets, document, window) {
  'use strict';

  Composer.selectorPanel = '[data-widget="composer-panel"]';

  /** Left column Bootstrap width states (AS1 embeds yaml-workflow-widget here). */
  Composer.LEFT_STATES = {
    collapsed: { label: 'collapsed' },
    partial: { label: 'partial', leftCols: 3, centerCols: 9 },
    full: { label: 'full', leftCols: 12, centerCols: 0 },
  };

  /** Central viewer panes that support full-screen expand (R11-07) + CanvasGraph (R11-08). */
  Composer.EXPANDABLE_PANES = {
    'project-context': {
      sectionId: 'composer-project-context',
      buttonId: 'composer-context-expand',
      stageId: 'composer-project-context-stage',
      canvasId: 'composer-project-context-canvas',
      tooltipId: 'composer-project-context-tooltip',
      label: 'Project Context Viewer',
      /** Empty by design this spec (future project content). */
      initialGraph: { nodes: [], links: [] },
    },
    'temp-subgraph': {
      sectionId: 'composer-temp-subgraph',
      buttonId: 'composer-temp-expand',
      stageId: 'composer-temp-subgraph-stage',
      canvasId: 'composer-temp-subgraph-canvas',
      tooltipId: 'composer-temp-subgraph-tooltip',
      label: 'Temporary Subgraph Viewer',
      /** Ready for AW temporary_id imports; empty until then. */
      initialGraph: { nodes: [], links: [] },
    },
  };

  Composer._leftState = 'partial';
  Composer._rightOpen = false;
  /** @type {null|'project-context'|'temp-subgraph'} */
  Composer._expandedPane = null;
  /** @type {Record<string, object|null>} */
  Composer._graphs = {
    'project-context': null,
    'temp-subgraph': null,
  };
  /** @type {Record<string, number>} */
  Composer._graphMountGeneration = {
    'project-context': 0,
    'temp-subgraph': 0,
  };

  Composer.setStatus = function (message) {
    const el = document.getElementById('composer-status-text');
    if (el) el.textContent = message;
  };

  Composer._stripColClasses = function (el) {
    if (!el) return;
    Array.from(el.classList).forEach((cls) => {
      if (/^col(-\d+)?$/.test(cls)) el.classList.remove(cls);
    });
  };

  Composer._applyColumnClasses = function (el, cols) {
    if (!el) return;
    Composer._stripColClasses(el);
    if (cols == null) {
      el.classList.add('col');
      return;
    }
    if (cols > 0) el.classList.add(`col-${cols}`);
  };

  /**
   * Set left-column width: collapsed (0) | partial (≈3) | full (12).
   * @param {'collapsed'|'partial'|'full'} state
   */
  Composer.setLeftState = function (state) {
    const cfg = Composer.LEFT_STATES[state];
    if (!cfg) return;

    Composer._leftState = state;
    const workspace = document.getElementById('composer-workspace');
    const left = document.getElementById('composer-left');
    const rail = document.getElementById('composer-left-rail');
    const center = document.getElementById('composer-center');

    if (workspace) workspace.dataset.composerLeftState = state;

    const collapsed = state === 'collapsed';
    const full = state === 'full';

    if (left) {
      left.classList.toggle('d-none', collapsed);
      left.classList.toggle('d-flex', !collapsed);
      if (collapsed) {
        Composer._stripColClasses(left);
      } else {
        Composer._applyColumnClasses(left, cfg.leftCols);
      }
    }

    if (rail) {
      rail.classList.toggle('d-none', !collapsed);
      rail.classList.toggle('d-flex', collapsed);
    }

    if (center) {
      center.classList.toggle('d-none', full);
      center.classList.toggle('d-flex', !full);
      if (full) {
        Composer._stripColClasses(center);
      } else if (collapsed) {
        // Rail is fixed-width; center fills remainder of the 12-col row.
        Composer._applyColumnClasses(center, null);
      } else {
        Composer._applyColumnClasses(center, cfg.centerCols);
      }
    }

    document.querySelectorAll('button[data-composer-left-state]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.composerLeftState === state);
    });

    Composer.setStatus(`Workflow column: ${cfg.label}.`);
  };

  /**
   * Open/close the right CliScanApp slide-in (covers columns 4–12 when open).
   * @param {boolean} open
   */
  Composer.setRightOpen = function (open) {
    Composer._rightOpen = !!open;
    const workspace = document.getElementById('composer-workspace');
    const right = document.getElementById('composer-right');
    if (workspace) workspace.dataset.composerRightOpen = open ? 'true' : 'false';
    if (right) {
      if (open) {
        right.removeAttribute('hidden');
        right.classList.add('composer-right-open');
      } else {
        right.setAttribute('hidden', '');
        right.classList.remove('composer-right-open');
      }
    }
    Composer.setStatus(open ? 'CLI app panel open.' : 'CLI app panel closed.');
  };

  Composer._expandIconClass = 'fa-up-right-and-down-left-from-center';
  Composer._revertIconClass = 'fa-down-left-and-up-right-to-center';

  /**
   * Sync expand/revert button chrome for one pane.
   * @param {string} paneKey
   * @param {boolean} expanded
   */
  Composer._syncExpandButton = function (paneKey, expanded) {
    const meta = Composer.EXPANDABLE_PANES[paneKey];
    if (!meta) return;
    const btn = document.getElementById(meta.buttonId);
    if (!btn) return;
    const icon = btn.querySelector('[data-composer-expand-icon]') || btn.querySelector('i');
    const action = expanded ? 'Revert' : 'Expand';
    const label = `${action} ${meta.label}`;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.setAttribute('aria-pressed', expanded ? 'true' : 'false');
    btn.classList.toggle('active', expanded);
    if (icon) {
      icon.classList.remove(Composer._expandIconClass, Composer._revertIconClass);
      icon.classList.add(expanded ? Composer._revertIconClass : Composer._expandIconClass);
    }
  };

  /**
   * Expand one central pane to fill the center column, or revert to the split.
   * @param {null|'project-context'|'temp-subgraph'} paneKey
   */
  Composer.setExpandedPane = function (paneKey) {
    if (paneKey != null && !Composer.EXPANDABLE_PANES[paneKey]) return;

    const center = document.getElementById('composer-center');
    const next = paneKey || null;
    Composer._expandedPane = next;

    if (center) {
      center.dataset.composerExpanded = next || '';
      center.classList.toggle('composer-center-expanded', !!next);
    }

    Object.keys(Composer.EXPANDABLE_PANES).forEach((key) => {
      const meta = Composer.EXPANDABLE_PANES[key];
      const section = document.getElementById(meta.sectionId);
      const isExpanded = next === key;
      const isHiddenSibling = !!next && !isExpanded;
      if (section) {
        section.classList.toggle('composer-viewer-expanded', isExpanded);
        section.classList.toggle('composer-viewer-collapsed-by-expand', isHiddenSibling);
        section.toggleAttribute('hidden', isHiddenSibling);
        if (isHiddenSibling) {
          section.setAttribute('aria-hidden', 'true');
        } else {
          section.removeAttribute('aria-hidden');
        }
      }
      Composer._syncExpandButton(key, isExpanded);
    });

    if (next) {
      Composer.setStatus(`${Composer.EXPANDABLE_PANES[next].label} expanded. Press Escape or Revert to restore split.`);
      const btn = document.getElementById(Composer.EXPANDABLE_PANES[next].buttonId);
      btn?.focus({ preventScroll: true });
    } else {
      Composer.setStatus('Split view restored.');
    }
  };

  /**
   * Toggle expand for a pane; expanding another pane switches focus to it.
   * @param {'project-context'|'temp-subgraph'} paneKey
   */
  Composer.toggleExpandedPane = function (paneKey) {
    if (!Composer.EXPANDABLE_PANES[paneKey]) return;
    Composer.setExpandedPane(Composer._expandedPane === paneKey ? null : paneKey);
  };

  /**
   * Return the live CanvasGraph API for a central pane (null if not mounted).
   * @param {'project-context'|'temp-subgraph'} paneKey
   */
  Composer.getCanvasGraph = function (paneKey) {
    return Composer._graphs[paneKey] || null;
  };

  /**
   * Destroy a pane's CanvasGraph instance if present.
   * @param {'project-context'|'temp-subgraph'} paneKey
   */
  Composer.destroyCanvasGraph = function (paneKey) {
    const api = Composer._graphs[paneKey];
    if (api?.destroy) {
      try {
        api.destroy();
      } catch (err) {
        console.warn('Composer.destroyCanvasGraph', paneKey, err);
      }
    }
    Composer._graphs[paneKey] = null;
  };

  /**
   * Mount (or remount) Viz.CanvasGraph in a central pane.
   * Empty `{nodes:[],links:[]}` is valid and must not throw (R11-08).
   * @param {'project-context'|'temp-subgraph'} paneKey
   * @param {{nodes?: Array, links?: Array}} [graph]
   */
  Composer.mountCanvasGraph = function (paneKey, graph) {
    const meta = Composer.EXPANDABLE_PANES[paneKey];
    if (!meta) return null;
    if (!window.Viz?.CanvasGraph?.create) {
      console.error('Composer.mountCanvasGraph: Viz.CanvasGraph unavailable');
      Composer.setStatus('CanvasGraph unavailable.');
      return null;
    }

    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    const links = Array.isArray(graph?.links) ? graph.links : [];
    const generation = ++Composer._graphMountGeneration[paneKey];
    Composer.destroyCanvasGraph(paneKey);

    const stage = document.getElementById(meta.stageId);
    const canvasEl = document.getElementById(meta.canvasId);
    if (!stage || !canvasEl) {
      console.error('Composer.mountCanvasGraph: missing stage/canvas for', paneKey);
      return null;
    }

    const tryMount = (attempts) => {
      if (generation !== Composer._graphMountGeneration[paneKey]) return;
      const rect = stage.getBoundingClientRect();
      // Wait for layout when Composer tab / expand has not sized the stage yet.
      if ((rect.width <= 20 || rect.height <= 20) && attempts < 60) {
        requestAnimationFrame(() => tryMount(attempts + 1));
        return;
      }
      try {
        Composer._graphs[paneKey] = window.Viz.CanvasGraph.create({
          canvas: `#${meta.canvasId}`,
          tooltip: `#${meta.tooltipId}`,
          nodes,
          links,
          variant: 'default',
          nodeDisplay: 'icons',
          linkLabels: false,
          linkDistance: 80,
        });
      } catch (err) {
        console.error('Composer.mountCanvasGraph failed', paneKey, err);
        Composer._graphs[paneKey] = null;
        Composer.setStatus(`${meta.label}: graph mount failed — ${err.message}`);
      }
    };
    tryMount(0);
    return Composer._graphs[paneKey];
  };

  /**
   * Mount both central CanvasGraph viewers (R11-08).
   * Project Context starts empty; Temporary viewer is ready for AW data later.
   */
  Composer.mountCanvasViewers = function () {
    Object.keys(Composer.EXPANDABLE_PANES).forEach((paneKey) => {
      const meta = Composer.EXPANDABLE_PANES[paneKey];
      Composer.mountCanvasGraph(paneKey, meta.initialGraph || { nodes: [], links: [] });
    });
  };

  Composer.bindLayoutControls = function (root) {
    root.querySelectorAll('button[data-composer-left-state]').forEach((btn) => {
      btn.addEventListener('click', () => {
        Composer.setLeftState(btn.dataset.composerLeftState);
      });
    });

    root.querySelector('#composer-right-close')?.addEventListener('click', () => {
      Composer.setRightOpen(false);
    });

    root.querySelectorAll('button[data-composer-expand]').forEach((btn) => {
      btn.addEventListener('click', () => {
        Composer.toggleExpandedPane(btn.dataset.composerExpand);
      });
    });

    if (!Composer._expandEscapeBound) {
      Composer._expandEscapeBound = true;
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !Composer._expandedPane) return;
        const target = event.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        const pane = document.getElementById('pane-composer');
        if (!pane || pane.classList.contains('d-none')) return;
        event.preventDefault();
        Composer.setExpandedPane(null);
      });
    }
  };

  Composer.initPanel = function ($root) {
    const el = $root[0];
    if (el.dataset.initialized) return;
    el.dataset.initialized = 'true';

    Composer.bindLayoutControls(el);
    Composer.setLeftState('partial');
    Composer.setRightOpen(false);
    Composer.setExpandedPane(null);
    Composer.mountCanvasViewers();
    Composer.setStatus('Composer layout ready — CanvasGraph viewers mounted.');
  };

  Widgets.watchDOMForComponent(Composer.selectorPanel, Composer.initPanel);
})(window.jQuery, window.Widgets.Composer, window.Widgets, document, window);
