window.Widgets = window.Widgets || {};
window.Widgets.ComposerWorkflow = window.Widgets.ComposerWorkflow || {};

/**
 * SPEC-011 AS1–AS3 / R11-09–R11-11 — Collapsing left host for yaml-workflow-widget
 * iframe + HOST_PROTOCOL handshake (ready → setTheme + setYaml; yamlChanged /
 * validationResult) + bidirectional theme sync (Widgets.Theme ↔ setTheme /
 * themeChanged).
 *
 * Width states (Composer.setLeftState): collapsed (0) | partial (≈3, default) | full (12).
 * - partial / collapsed: `?embed=1` (diagram-only)
 * - full: no embed param (YAML code + diagram)
 */
(function (ComposerWorkflow, Widgets, document, window) {
  'use strict';

  ComposerWorkflow.DEFAULT_BASE_URL = 'http://localhost:4009';
  ComposerWorkflow.FRAME_ID = 'composer-workflow-iframe';
  ComposerWorkflow.SLOT_ID = 'composer-yaml-slot';
  ComposerWorkflow.PROTOCOL_VERSION = '1.0.0';

  /**
   * Canonical-ish default when no project workflow YAML is loaded yet.
   * Shape matches yaml-workflow-widget `12A2_Workflow_YAML_Example.yaml`.
   */
  ComposerWorkflow.DEFAULT_WORKFLOW_YAML = [
    'apiVersion: spiderfeet.workflow/v1',
    'kind: Workflow',
    'id: workflow--composer-default',
    '',
    'info:',
    '  name: Composer default',
    '  description: >',
    '    Default workflow loaded into the Composer YAML editor (SPEC-011 AS2).',
    '  author: SpiderFeet',
    '',
    'steps:',
    '  - id: sfp_cli_netdiscover',
    '    uses: tool.netdiscover',
    '    needs: []',
    '    input:',
    '      type: none',
    '    config:',
    '      argv:',
    '        - "-P"',
    '        - "$step.files.output"',
    '      files:',
    '        output:',
    '          mode: auto',
    '          format: line_text',
    '      capture:',
    '        family: structured_native',
    '        adapter: netdiscover',
    '    output:',
    '      vars: none',
    '    context:',
    '      export: scan_graph',
    '',
  ].join('\n');

  /** @type {HTMLIFrameElement|null} */
  ComposerWorkflow._iframe = null;
  /** @type {'collapsed'|'partial'|'full'|null} */
  ComposerWorkflow._mode = null;
  /** @type {boolean} */
  ComposerWorkflow._ready = false;
  /** @type {string|null} */
  ComposerWorkflow._protocolVersion = null;
  /** @type {string} */
  ComposerWorkflow._yaml = ComposerWorkflow.DEFAULT_WORKFLOW_YAML;
  /** @type {{ ok: boolean, diagnostics?: Array }|null} */
  ComposerWorkflow._lastValidation = null;
  /** @type {boolean} */
  ComposerWorkflow._listening = false;
  /** @type {boolean} */
  ComposerWorkflow._themeListening = false;
  /** @type {string|null} */
  ComposerWorkflow._expectedOrigin = null;
  /** @type {'light'|'dark'|null} last theme pushed to (or accepted from) the iframe */
  ComposerWorkflow._syncedTheme = null;

  ComposerWorkflow.defaultBaseUrl = function () {
    const root = document.getElementById('widget-root');
    const fromDom = root?.dataset?.yamlWorkflowUrl;
    if (fromDom && String(fromDom).trim()) {
      return String(fromDom).trim().replace(/\/$/, '');
    }
    return ComposerWorkflow.DEFAULT_BASE_URL;
  };

  ComposerWorkflow._widgetOrigin = function () {
    try {
      return new URL(ComposerWorkflow.defaultBaseUrl()).origin;
    } catch (_err) {
      return null;
    }
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
   * Collapsed keeps the previous mode's document so postMessage still works.
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

  ComposerWorkflow.isReady = function () {
    return !!ComposerWorkflow._ready;
  };

  ComposerWorkflow.getWorkflowYaml = function () {
    return ComposerWorkflow._yaml;
  };

  ComposerWorkflow.getLastValidation = function () {
    return ComposerWorkflow._lastValidation;
  };

  /**
   * Parse an inbound host/widget message (object or JSON string).
   * @param {unknown} raw
   * @returns {{ type: string, payload: *, requestId?: string, target?: string }|null}
   */
  ComposerWorkflow._parseMessage = function (raw) {
    let data = raw;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (_err) {
        return null;
      }
    }
    if (!data || typeof data !== 'object') return null;
    const type = data.type || data.action;
    if (!type || typeof type !== 'string') return null;
    return {
      type,
      payload: data.payload !== undefined ? data.payload : data,
      requestId: data.requestId ?? data.payload?.requestId,
      target: data.target,
    };
  };

  /**
   * Post a HOST_PROTOCOL command into the yaml-workflow-widget iframe.
   * @param {string} type
   * @param {object|string} [payload]
   * @param {string} [requestId]
   * @returns {boolean}
   */
  ComposerWorkflow.postToWidget = function (type, payload, requestId) {
    const iframe = ComposerWorkflow.getIframe();
    if (!iframe?.contentWindow) return false;
    const msg = {
      type,
      action: type,
      payload: payload === undefined ? {} : payload,
      target: 'iframe',
    };
    if (requestId) msg.requestId = requestId;
    const targetOrigin = ComposerWorkflow._expectedOrigin || '*';
    try {
      iframe.contentWindow.postMessage(msg, targetOrigin === 'null' ? '*' : targetOrigin);
      return true;
    } catch (err) {
      console.warn('ComposerWorkflow.postToWidget failed', type, err);
      return false;
    }
  };

  ComposerWorkflow._currentTheme = function () {
    if (Widgets.Theme && typeof Widgets.Theme.get === 'function') {
      const theme = Widgets.Theme.get();
      if (theme === 'dark' || theme === 'light') return theme;
    }
    const root = document.getElementById('widget-root');
    const attr = root?.getAttribute('data-bs-theme');
    if (attr === 'dark' || attr === 'light') return attr;
    return 'light';
  };

  /**
   * Normalize a theme token to light|dark.
   * @param {unknown} theme
   * @returns {'light'|'dark'|null}
   */
  ComposerWorkflow._normalizeTheme = function (theme) {
    if (theme === 'dark' || theme === 'light') return theme;
    return null;
  };

  /**
   * Push theme into the yaml-workflow-widget iframe (R11-11).
   * @param {'light'|'dark'} [theme]
   * @param {{ force?: boolean }} [options]
   * @returns {boolean}
   */
  ComposerWorkflow.pushTheme = function (theme, options) {
    const next = ComposerWorkflow._normalizeTheme(theme) || ComposerWorkflow._currentTheme();
    const force = !!(options && options.force);
    if (!ComposerWorkflow._ready) {
      ComposerWorkflow._syncedTheme = next;
      return false;
    }
    if (!force && ComposerWorkflow._syncedTheme === next) {
      return true;
    }
    ComposerWorkflow._syncedTheme = next;
    return ComposerWorkflow.postToWidget('setTheme', { theme: next });
  };

  /**
   * Host navbar / Theme.toggle → re-theme the embedded editor.
   * Skip when the change originated from the iframe (themeChanged → apply).
   * @param {CustomEvent} event
   */
  ComposerWorkflow._onShellThemeChanged = function (event) {
    if (event?.detail?.fromWorkflow) return;
    const theme = ComposerWorkflow._normalizeTheme(event?.detail?.theme);
    if (!theme) return;
    ComposerWorkflow.pushTheme(theme, { force: true });
  };

  /**
   * Push current theme + YAML after `ready` (R11-10 handshake).
   */
  ComposerWorkflow._pushHandshake = function () {
    if (!ComposerWorkflow._ready) return;
    ComposerWorkflow.pushTheme(ComposerWorkflow._currentTheme(), { force: true });
    ComposerWorkflow.postToWidget('setYaml', { yaml: ComposerWorkflow._yaml || '' });
    if (Widgets.Composer?.setStatus) {
      Widgets.Composer.setStatus('Workflow editor: theme + YAML pushed after ready.');
    }
  };

  /**
   * Mark the iframe as not ready (e.g. after src reload). Next `ready` re-handshakes.
   */
  ComposerWorkflow._markNotReady = function () {
    ComposerWorkflow._ready = false;
    ComposerWorkflow._protocolVersion = null;
    ComposerWorkflow._lastValidation = null;
    const slot = document.getElementById(ComposerWorkflow.SLOT_ID);
    if (slot) slot.dataset.composerWorkflowReady = 'false';
  };

  /**
   * Store workflow YAML and push via setYaml when the editor is ready.
   * @param {string} yaml
   * @param {{ force?: boolean }} [options]
   */
  ComposerWorkflow.setWorkflowYaml = function (yaml, options) {
    const next = typeof yaml === 'string' ? yaml : '';
    const force = !!(options && options.force);
    if (!force && next === ComposerWorkflow._yaml && ComposerWorkflow._ready) {
      return;
    }
    ComposerWorkflow._yaml = next;
    if (ComposerWorkflow._ready) {
      ComposerWorkflow.postToWidget('setYaml', { yaml: next });
    }
  };

  /**
   * Resolve YAML from Composer/project workflow objects when present.
   * @returns {string|null}
   */
  ComposerWorkflow._resolveYamlFromComposer = function () {
    const selected =
      Widgets.Composer?.selectedWorkflow ||
      Widgets.Composer?.currentWorkflow ||
      null;
    if (selected && typeof selected === 'object') {
      const fromWf =
        selected.workflow_yaml ||
        selected.yaml ||
        selected.body ||
        null;
      if (typeof fromWf === 'string' && fromWf.trim()) return fromWf;
    }
    const project = Widgets.Composer?.selectedProject;
    if (project && typeof project === 'object') {
      if (typeof project.workflow_yaml === 'string' && project.workflow_yaml.trim()) {
        return project.workflow_yaml;
      }
      const workflows = Array.isArray(project.workflows) ? project.workflows : [];
      for (let i = 0; i < workflows.length; i += 1) {
        const wf = workflows[i];
        const y = wf?.workflow_yaml || wf?.yaml;
        if (typeof y === 'string' && y.trim()) return y;
      }
    }
    return null;
  };

  /**
   * Refresh `_yaml` from Composer selection when available; keep default otherwise.
   */
  ComposerWorkflow.syncYamlFromComposer = function () {
    const resolved = ComposerWorkflow._resolveYamlFromComposer();
    if (resolved != null) {
      ComposerWorkflow.setWorkflowYaml(resolved);
    }
  };

  ComposerWorkflow._dispatch = function (name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_err) {
      /* ignore */
    }
  };

  ComposerWorkflow._handleWidgetMessage = function (event) {
    const expected = ComposerWorkflow._expectedOrigin || ComposerWorkflow._widgetOrigin();
    if (expected && event.origin && event.origin !== expected) {
      return;
    }

    const data = ComposerWorkflow._parseMessage(event.data);
    if (!data || data.target !== 'parent') return;

    switch (data.type) {
      case 'ready': {
        ComposerWorkflow._ready = true;
        ComposerWorkflow._protocolVersion =
          (data.payload && data.payload.version) || ComposerWorkflow.PROTOCOL_VERSION;
        const slot = document.getElementById(ComposerWorkflow.SLOT_ID);
        if (slot) slot.dataset.composerWorkflowReady = 'true';
        ComposerWorkflow.syncYamlFromComposer();
        ComposerWorkflow._pushHandshake();
        ComposerWorkflow._dispatch('composer-workflow:ready', {
          version: ComposerWorkflow._protocolVersion,
        });
        break;
      }
      case 'validationResult': {
        const ok = !!(data.payload && data.payload.ok);
        ComposerWorkflow._lastValidation = {
          ok,
          diagnostics: Array.isArray(data.payload?.diagnostics)
            ? data.payload.diagnostics
            : [],
        };
        if (Widgets.Composer?.setStatus) {
          Widgets.Composer.setStatus(
            ok
              ? 'Workflow YAML valid.'
              : 'Workflow YAML invalid — see editor diagnostics.'
          );
        }
        ComposerWorkflow._dispatch('composer-workflow:validation-result', {
          ...ComposerWorkflow._lastValidation,
        });
        break;
      }
      case 'yamlChanged': {
        const yaml =
          typeof data.payload === 'string'
            ? data.payload
            : data.payload?.yaml;
        if (typeof yaml === 'string') {
          ComposerWorkflow._yaml = yaml;
        }
        ComposerWorkflow._dispatch('composer-workflow:yaml-changed', {
          yaml: ComposerWorkflow._yaml,
        });
        if (Widgets.Composer?.setStatus) {
          Widgets.Composer.setStatus('Workflow YAML updated from editor.');
        }
        break;
      }
      case 'themeChanged': {
        // Iframe applied a theme (host setTheme echo or editor UI) — sync shell.
        const raw =
          typeof data.payload === 'string'
            ? data.payload
            : data.payload?.theme;
        const theme = ComposerWorkflow._normalizeTheme(raw);
        if (!theme) break;
        ComposerWorkflow._syncedTheme = theme;
        if (Widgets.Theme && typeof Widgets.Theme.apply === 'function') {
          if (Widgets.Theme.get() !== theme) {
            Widgets.Theme.apply(theme, { fromWorkflow: true });
          }
        }
        ComposerWorkflow._dispatch('composer-workflow:theme-changed', { theme });
        break;
      }
      default:
        break;
    }
  };

  ComposerWorkflow._ensureListening = function () {
    if (ComposerWorkflow._listening) return;
    ComposerWorkflow._listening = true;
    window.addEventListener('message', ComposerWorkflow._handleWidgetMessage);
    ComposerWorkflow._ensureThemeListening();
  };

  ComposerWorkflow._ensureThemeListening = function () {
    if (ComposerWorkflow._themeListening) return;
    ComposerWorkflow._themeListening = true;
    window.addEventListener('shell:theme-changed', ComposerWorkflow._onShellThemeChanged);
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

    ComposerWorkflow._ensureListening();
    ComposerWorkflow._expectedOrigin = ComposerWorkflow._widgetOrigin();

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
      ComposerWorkflow._markNotReady();
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
      ComposerWorkflow._markNotReady();
      iframe.src = nextSrc;
    }

    ComposerWorkflow._mode = state === 'collapsed' ? ComposerWorkflow._mode || 'partial' : state;
    slot.dataset.composerWorkflowMounted = 'true';
    slot.dataset.composerWorkflowUrlMode = urlMode;
    slot.dataset.composerWorkflowReady = ComposerWorkflow._ready ? 'true' : 'false';

    // YAML may already be on Composer from project open before mount.
    ComposerWorkflow.syncYamlFromComposer();

    return iframe;
  };

  /**
   * Sync iframe embed URL with Composer left width state.
   * Collapsed: hide via host layout only — do not destroy or blank the iframe.
   * @param {'collapsed'|'partial'|'full'} state
   */
  ComposerWorkflow.syncWidthState = function (state) {
    if (!state) return;
    ComposerWorkflow._ensureListening();
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
      ComposerWorkflow._markNotReady();
      iframe.src = nextSrc;
    }

    ComposerWorkflow._mode = state;
    if (slot) {
      slot.dataset.composerWorkflowUrlMode = urlMode;
      slot.dataset.composerWorkflowReady = ComposerWorkflow._ready ? 'true' : 'false';
    }
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
