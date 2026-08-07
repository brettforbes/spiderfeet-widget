window.Widgets = window.Widgets || {};
window.Widgets.ComposerWorkflow = window.Widgets.ComposerWorkflow || {};

/**
 * SPEC-011 AS1 / R11-09 — Collapsing left host for yaml-workflow-widget iframe.
 *
 * Width states (Composer.setLeftState): collapsed (0) | partial (≈3, default) | full (12).
 * - partial / collapsed: `?embed=1` (diagram-only)
 * - full: no embed param (YAML code + diagram)
 *
 * Handshake / setYaml / theme sync land in AS2–AS3.
 */
(function (ComposerWorkflow, Widgets, document, window) {
  'use strict';

  ComposerWorkflow.DEFAULT_BASE_URL = 'http://localhost:4009';
  ComposerWorkflow.FRAME_ID = 'composer-workflow-iframe';
  ComposerWorkflow.SLOT_ID = 'composer-yaml-slot';

  /** @type {HTMLIFrameElement|null} */
  ComposerWorkflow._iframe = null;
  /** @type {'collapsed'|'partial'|'full'|null} */
  ComposerWorkflow._mode = null;

  ComposerWorkflow.defaultBaseUrl = function () {
    const root = document.getElementById('widget-root');
    const fromDom = root?.dataset?.yamlWorkflowUrl;
    if (fromDom && String(fromDom).trim()) {
      return String(fromDom).trim().replace(/\/$/, '');
    }
    return ComposerWorkflow.DEFAULT_BASE_URL;
  };

  /**
   * Build iframe URL for a left-column width state.
   * @param {'collapsed'|'partial'|'full'} state
   * @returns {string}
   */
  ComposerWorkflow.urlForState = function (state) {
    const base = ComposerWorkflow.defaultBaseUrl();
    // Full column shows code + diagram; collapsed keeps last diagram URL in DOM.
    if (state === 'full') {
      return `${base}/`;
    }
    return `${base}/?embed=1`;
  };

  /**
   * Whether state needs the embed (viz-only) URL vs full editor URL.
   * Collapsed keeps the previous mode's document so postMessage still works (AS2).
   * @param {'collapsed'|'partial'|'full'} state
   * @returns {'embed'|'full'}
   */
  ComposerWorkflow._urlModeForState = function (state) {
    if (state === 'full') return 'full';
    return 'embed';
  };

  ComposerWorkflow.getIframe = function () {
    return ComposerWorkflow._iframe || document.getElementById(ComposerWorkflow.FRAME_ID);
  };

  ComposerWorkflow._applyIframeLayout = function (iframe) {
    iframe.classList.add('composer-workflow-iframe');
    iframe.style.border = '0';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.flex = '1 1 auto';
    iframe.style.minHeight = '0';
    iframe.style.display = 'block';
  };

  /**
   * Mount (or reuse) the yaml-workflow-widget iframe in the Composer left slot.
   * Keeps the iframe in the DOM when the column collapses (width 0).
   * @param {{ state?: 'collapsed'|'partial'|'full', src?: string }} [options]
   * @returns {HTMLIFrameElement|null}
   */
  ComposerWorkflow.mount = function (options) {
    const opts = options || {};
    const slot = document.getElementById(ComposerWorkflow.SLOT_ID);
    if (!slot) {
      console.error('ComposerWorkflow.mount: #composer-yaml-slot not found');
      return null;
    }

    const state =
      opts.state ||
      Widgets.Composer?._leftState ||
      document.getElementById('composer-workspace')?.dataset?.composerLeftState ||
      'partial';

    let iframe = ComposerWorkflow.getIframe();
    if (!iframe || !slot.contains(iframe)) {
      slot.replaceChildren();
      iframe = document.createElement('iframe');
      iframe.id = ComposerWorkflow.FRAME_ID;
      iframe.title = 'YAML workflow editor';
      iframe.setAttribute('loading', 'eager');
      iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      ComposerWorkflow._applyIframeLayout(iframe);
      slot.appendChild(iframe);
      ComposerWorkflow._iframe = iframe;
    } else {
      ComposerWorkflow._applyIframeLayout(iframe);
      ComposerWorkflow._iframe = iframe;
    }

    const urlMode = ComposerWorkflow._urlModeForState(state);
    const nextSrc = opts.src || ComposerWorkflow.urlForState(state);
    const currentSrc = iframe.getAttribute('src') || '';
    const needsSrc =
      !currentSrc ||
      currentSrc === 'about:blank' ||
      (urlMode === 'full' && /[?&]embed=1(?:&|$)/.test(currentSrc)) ||
      (urlMode === 'embed' && !/[?&]embed=1(?:&|$)/.test(currentSrc));

    if (needsSrc && iframe.src !== nextSrc) {
      iframe.src = nextSrc;
    }

    ComposerWorkflow._mode = state === 'collapsed' ? ComposerWorkflow._mode || 'partial' : state;
    slot.dataset.composerWorkflowMounted = 'true';
    slot.dataset.composerWorkflowUrlMode = urlMode;

    return iframe;
  };

  /**
   * Sync iframe embed URL with Composer left width state.
   * Collapsed: hide via host layout only — do not destroy or blank the iframe.
   * @param {'collapsed'|'partial'|'full'} state
   */
  ComposerWorkflow.syncWidthState = function (state) {
    if (!state) return;
    const iframe = ComposerWorkflow.getIframe();
    if (!iframe) {
      ComposerWorkflow.mount({ state: state === 'collapsed' ? 'partial' : state });
      return;
    }

    if (state === 'collapsed') {
      // Keep current document; host CSS collapses the column to 0 width.
      const slot = document.getElementById(ComposerWorkflow.SLOT_ID);
      if (slot) slot.dataset.composerWorkflowCollapsed = 'true';
      return;
    }

    const slot = document.getElementById(ComposerWorkflow.SLOT_ID);
    if (slot) slot.dataset.composerWorkflowCollapsed = 'false';

    const urlMode = ComposerWorkflow._urlModeForState(state);
    const nextSrc = ComposerWorkflow.urlForState(state);
    const currentSrc = iframe.getAttribute('src') || '';
    const isEmbed = /[?&]embed=1(?:&|$)/.test(currentSrc);
    const wantsEmbed = urlMode === 'embed';

    if (!currentSrc || currentSrc === 'about:blank' || isEmbed !== wantsEmbed) {
      iframe.src = nextSrc;
    }

    ComposerWorkflow._mode = state;
    if (slot) slot.dataset.composerWorkflowUrlMode = urlMode;
  };

  /**
   * Ensure mount when Composer panel initializes (called from Composer.initPanel).
   */
  ComposerWorkflow.initFromComposer = function () {
    ComposerWorkflow.mount({ state: Widgets.Composer?._leftState || 'partial' });
  };

  /**
   * If Composer already initialized before this module loaded (unlikely when
   * webpack order is correct), mount into the existing panel.
   */
  ComposerWorkflow._bootIfComposerReady = function () {
    const panel = document.querySelector('[data-widget="composer-panel"]');
    if (panel?.dataset?.initialized === 'true' && !ComposerWorkflow.getIframe()) {
      ComposerWorkflow.initFromComposer();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ComposerWorkflow._bootIfComposerReady);
  } else {
    ComposerWorkflow._bootIfComposerReady();
  }
})(window.Widgets.ComposerWorkflow, window.Widgets, document, window);
