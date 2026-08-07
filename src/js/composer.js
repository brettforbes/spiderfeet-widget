window.Widgets = window.Widgets || {};
window.Widgets.Composer = window.Widgets.Composer || {};

/**
 * SPEC-011 AR1 / R11-06 — Composer pane shell: 12-col left, central split viewers, right slide-in.
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

  Composer._leftState = 'partial';
  Composer._rightOpen = false;

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

  Composer.bindLayoutControls = function (root) {
    root.querySelectorAll('button[data-composer-left-state]').forEach((btn) => {
      btn.addEventListener('click', () => {
        Composer.setLeftState(btn.dataset.composerLeftState);
      });
    });

    root.querySelector('#composer-right-close')?.addEventListener('click', () => {
      Composer.setRightOpen(false);
    });
  };

  Composer.initPanel = function ($root) {
    const el = $root[0];
    if (el.dataset.initialized) return;
    el.dataset.initialized = 'true';

    Composer.bindLayoutControls(el);
    Composer.setLeftState('partial');
    Composer.setRightOpen(false);
    Composer.setStatus('Composer layout ready.');
  };

  Widgets.watchDOMForComponent(Composer.selectorPanel, Composer.initPanel);
})(window.jQuery, window.Widgets.Composer, window.Widgets, document, window);
