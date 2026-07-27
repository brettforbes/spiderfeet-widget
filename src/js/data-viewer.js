window.Widgets = window.Widgets || {};
window.Widgets.DataViewer = window.Widgets.DataViewer || {};

(function (DataViewer, Widgets, document, window) {
  'use strict';

  DataViewer.PROTOCOL_VERSION = 1;
  DataViewer.MODE_SET_DELAY_MS = 120;
  DataViewer.SUPPORTED_FORMATS = ['json', 'yaml', 'xml', 'csv'];

  /** @type {Map<string, object>} */
  DataViewer._instances = new Map();

  DataViewer.viewerOrigin = function (viewerUrl) {
    try {
      return new URL(viewerUrl).origin;
    } catch (_err) {
      return '*';
    }
  };

  DataViewer.defaultSrc = function () {
    const root = document.getElementById('widget-root');
    return root?.dataset?.dataViewerUrl || 'http://localhost:3000/widget';
  };

  DataViewer._currentTheme = function () {
    return Widgets.Theme?.get?.() || 'light';
  };

  DataViewer._normalizeFormat = function (format) {
    const fmt = String(format || '').toLowerCase();
    if (fmt === 'yml') return 'yaml';
    if (fmt === 'jsonl') return 'json';
    return DataViewer.SUPPORTED_FORMATS.includes(fmt) ? fmt : null;
  };

  /**
   * Infer viewer format from explicit hint, filename, then content sniffing.
   * Aligns with json-yaml-xml-csv-widget Embed_prompt format detection.
   */
  DataViewer.inferFormat = function ({ content, filename, format } = {}) {
    const hinted = DataViewer._normalizeFormat(format);
    if (hinted) return hinted;

    if (filename) {
      const fromName = DataViewer._formatFromFilename(filename);
      const ext = (filename.split('.').pop() || '').toLowerCase();
      if (fromName !== 'json' || ext === 'json' || ext === 'jsonl') {
        return fromName;
      }
    }

    const trimmed = String(content || '').trim();
    if (!trimmed) return 'json';
    if (trimmed.startsWith('<?xml') || /^<\?xml[\s>]/i.test(trimmed)) return 'xml';
    if (trimmed.startsWith('<') && trimmed.includes('</')) return 'xml';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
    if (trimmed.startsWith('---') || /^[\w.-]+:\s/m.test(trimmed)) return 'yaml';

    const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length > 1 && lines.every((line) => line.includes(','))) return 'csv';

    return 'json';
  };

  DataViewer.resolvePayload = function ({ content, filename, format, options } = {}) {
    const body = content == null ? '' : String(content);
    const resolvedFormat = DataViewer.inferFormat({ content: body, filename, format });
    return {
      content: body,
      format: resolvedFormat,
      filename: filename || DataViewer._defaultFilename(resolvedFormat),
      options: { ...(options || {}), theme: options?.theme || DataViewer._currentTheme() },
    };
  };

  DataViewer._post = function (state, payload) {
    const iframe = state.iframe;
    if (!iframe?.contentWindow) return;
    const origin = state.viewerOrigin || '*';
    // Always route with the frameId the viewer actually reported (may be null
    // for cross-origin embeds). Per-iframe targeting is guaranteed by posting
    // to this iframe's contentWindow, so a null frameId is safe even with
    // multiple viewer instances on one page.
    const frameId = state.remoteFrameIdKnown ? state.remoteFrameId : state.instanceId;
    iframe.contentWindow.postMessage(
      {
        protocolVersion: DataViewer.PROTOCOL_VERSION,
        ...payload,
        frameId,
      },
      origin
    );
  };

  DataViewer._enqueue = function (state, fn) {
    if (state.ready) fn();
    else state.queue.push(fn);
  };

  DataViewer._flushQueue = function (state) {
    state.queue.splice(0).forEach((fn) => fn());
  };

  DataViewer._configure = function (state, themeOverride) {
    const theme =
      themeOverride === 'dark' || themeOverride === 'light'
        ? themeOverride
        : state.options.theme || DataViewer._currentTheme();
    state.options.theme = theme;
    DataViewer._post(state, {
      type: 'data-viewer-configure',
      frameId: state.instanceId,
      toolsMenuEnabled: state.options.toolsMenuEnabled !== false,
      importExportRoot: state.options.importExportRoot || '',
      fileIoMode: state.options.fileIoMode || 'delegated',
      parentOrigin: window.location.origin,
      theme,
    });
  };

  DataViewer._markReady = function (state) {
    if (state.ready) return;
    state.ready = true;
    DataViewer._configure(state);
    DataViewer._flushQueue(state);
    window.dispatchEvent(
      new CustomEvent('data-viewer:ready', { detail: { instanceId: state.instanceId } })
    );
  };

  /**
   * Handle a `data-viewer-ready` (typed or legacy bare-string). Records the
   * frameId the viewer reported so every subsequent message uses it, then
   * marks ready (first time) or re-delivers pending content (if a forced
   * fallback already marked ready with the wrong frameId).
   */
  DataViewer._onReadyFrom = function (state, reportedFrameId) {
    state.remoteFrameId = reportedFrameId;
    state.remoteFrameIdKnown = true;
    if (!state.ready) {
      DataViewer._markReady(state);
    } else {
      DataViewer._configure(state);
      if (state.pendingData?.content) DataViewer._deliverPending(state);
    }
  };

  /**
   * Resilient handshake. The viewer posts `data-viewer-ready` once, when its
   * React app mounts. If the host JS finishes executing AFTER that (slow vendor
   * bundle, throttled hidden iframe, etc.) the single ready can be missed and
   * queued messages would never flush. To beat the race we:
   *   - force readiness a short time after the iframe loads, and
   *   - re-deliver pending content a few times (idempotent renders) so a drop
   *     before the viewer finished mounting still recovers.
   * Real `data-viewer-ready` is still honoured and short-circuits all of this.
   */
  DataViewer.HANDSHAKE_FALLBACK_MS = [700, 1600, 3200, 5000];

  DataViewer._armHandshake = function (state) {
    if (state._handshakeArmed) return;
    state._handshakeArmed = true;

    const attempt = () => {
      if (!state.iframe?.contentWindow) return;
      if (!state.ready) {
        DataViewer._markReady(state);
      } else if (state.pendingData?.content) {
        DataViewer._deliverPending(state);
      }
    };

    DataViewer.HANDSHAKE_FALLBACK_MS.forEach((delay) => {
      window.setTimeout(attempt, delay);
    });

    // Re-arm on (re)load so navigation inside the iframe re-syncs content.
    state.iframe.addEventListener('load', () => {
      DataViewer.HANDSHAKE_FALLBACK_MS.forEach((delay) => {
        window.setTimeout(attempt, delay);
      });
    });
  };

  DataViewer._deliverPending = function (state) {
    const pending = state.pendingData;
    if (!pending?.content) return;

    const resolved = DataViewer.resolvePayload(pending);
    state.pendingData = resolved;

    DataViewer._post(state, {
      type: 'data-viewer-set-mode',
      frameId: state.instanceId,
      format: resolved.format,
      clear: false,
    });

    window.setTimeout(() => {
      DataViewer._post(state, {
        type: 'data-viewer-set',
        frameId: state.instanceId,
        content: resolved.content,
        format: resolved.format,
        filename: resolved.filename,
        options: resolved.options,
      });
    }, DataViewer.MODE_SET_DELAY_MS);
  };

  DataViewer._defaultFilename = function (format) {
    const ext = format === 'yaml' ? 'yaml' : format;
    return `import.${ext}`;
  };

  DataViewer._onMessage = function (event) {
    for (const state of DataViewer._instances.values()) {
      if (event.source !== state.iframe.contentWindow) continue;
      const origin = state.viewerOrigin;
      if (origin !== '*' && event.origin !== origin) continue;

      const data = event.data;
      if (typeof data === 'string' && data === state.instanceId) {
        DataViewer._onReadyFrom(state, data);
        continue;
      }

      if (!data || typeof data !== 'object') continue;
      if (data.frameId && data.frameId !== state.instanceId) continue;

      if (data.type === 'data-viewer-ready') {
        DataViewer._onReadyFrom(state, data.frameId ?? null);
        continue;
      }

      switch (data.type) {
        case 'data-viewer-theme-changed':
          if (Widgets.Theme?.apply && data.theme) {
            Widgets.Theme.apply(data.theme, { fromViewer: true });
          }
          window.dispatchEvent(
            new CustomEvent('data-viewer:theme-changed', {
              detail: { instanceId: state.instanceId, theme: data.theme },
            })
          );
          break;
        case 'data-viewer-fullscreen-changed':
          window.dispatchEvent(
            new CustomEvent('data-viewer:fullscreen-changed', {
              detail: {
                instanceId: state.instanceId,
                fullscreen: !!data.fullscreen,
                target: data.target || 'graph',
              },
            })
          );
          break;
        case 'data-viewer-import-request':
          window.dispatchEvent(
            new CustomEvent('data-viewer:import-request', {
              detail: {
                instanceId: state.instanceId,
                importExportRoot: data.importExportRoot,
              },
            })
          );
          DataViewer._handleImportRequest(state);
          break;
        case 'data-viewer-export':
          window.dispatchEvent(
            new CustomEvent('data-viewer:export', { detail: { ...data, instanceId: state.instanceId } })
          );
          DataViewer._handleExport(data);
          break;
        case 'data-viewer-cleared':
          window.dispatchEvent(
            new CustomEvent('data-viewer:cleared', { detail: { instanceId: state.instanceId } })
          );
          break;
        case 'data-viewer-format-changed':
          window.dispatchEvent(
            new CustomEvent('data-viewer:format-changed', {
              detail: { instanceId: state.instanceId, format: data.format },
            })
          );
          break;
        default:
          break;
      }
    }
  };

  if (!window.__spiderfeetDataViewerMessageBound) {
    window.__spiderfeetDataViewerMessageBound = true;
    window.addEventListener('message', (event) => DataViewer._onMessage(event));
  }

  DataViewer._handleImportRequest = function (state) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.jsonl,.yaml,.yml,.xml,.csv,.txt';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        DataViewer.setData(state.instanceId, {
          content: String(reader.result ?? ''),
          filename: file.name,
        });
      };
      reader.readAsText(file);
    });
    input.click();
  };

  DataViewer._handleExport = function (data) {
    const content = data.content || '';
    const name = (data.suggestedFilename || 'data-viewer-export').split(/[/\\]/).pop();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name || `export.${data.format || 'json'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  DataViewer._formatFromFilename = function (name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (ext === 'yml') return 'yaml';
    if (ext === 'jsonl') return 'json';
    if (DataViewer.SUPPORTED_FORMATS.includes(ext)) return ext;
    return 'json';
  };

  DataViewer._applyIframeLayout = function (iframe) {
    iframe.style.border = '0';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.flex = '1 1 auto';
    iframe.style.minHeight = '0';
    iframe.style.display = 'block';
    const allow = iframe.getAttribute('allow') || '';
    if (!/\bfullscreen\b/i.test(allow)) {
      iframe.setAttribute('allow', allow ? `${allow}; fullscreen` : 'fullscreen');
    }
  };

  DataViewer._createState = function (instanceId, iframe, options) {
    const viewerUrl = options.src || iframe.getAttribute('src') || iframe.src || '';
    const state = {
      instanceId,
      iframe,
      viewerOrigin: options.viewerOrigin || DataViewer.viewerOrigin(viewerUrl),
      ready: false,
      queue: [],
      pendingData: null,
      // The viewer reports its own frameId in `data-viewer-ready`. Cross-origin
      // embeds cannot read `window.frameElement`, so the viewer's frameId is
      // null and it rejects any message whose frameId does not match. We must
      // echo back exactly what the viewer reported, not our local iframe id.
      remoteFrameId: instanceId,
      remoteFrameIdKnown: false,
      options: {
        toolsMenuEnabled: options.toolsMenuEnabled !== false,
        importExportRoot: options.importExportRoot || '',
        fileIoMode: options.fileIoMode || 'delegated',
        theme: options.theme || DataViewer._currentTheme(),
      },
      unmount: null,
    };
    iframe.id = instanceId;
    iframe.dataset.viewerOrigin = state.viewerOrigin;
    DataViewer._applyIframeLayout(iframe);
    DataViewer._instances.set(instanceId, state);
    DataViewer._armHandshake(state);
    return state;
  };

  DataViewer.register = function (instanceId, iframe, options = {}) {
    if (!iframe) return instanceId;

    const viewerUrl = options.src || iframe.getAttribute('src') || DataViewer.defaultSrc();
    if (viewerUrl && (!iframe.getAttribute('src') || iframe.getAttribute('src') === 'about:blank')) {
      iframe.src = viewerUrl;
    }

    const existing = DataViewer._instances.get(instanceId);
    if (existing && existing.iframe === iframe) {
      Object.assign(existing.options, options);
      if (viewerUrl) {
        existing.viewerOrigin = options.viewerOrigin || DataViewer.viewerOrigin(viewerUrl);
        existing.iframe.dataset.viewerOrigin = existing.viewerOrigin;
      }
      if (existing.ready) DataViewer._configure(existing);
      return instanceId;
    }
    existing?.unmount?.();

    const state = DataViewer._createState(instanceId, iframe, { ...options, src: viewerUrl });
    state.unmount = () => {
      DataViewer._instances.delete(instanceId);
    };
    return instanceId;
  };

  DataViewer.mount = function (container, options = {}) {
    const instanceId = options.instanceId;
    if (!container || !instanceId) return null;

    const iframe = document.createElement('iframe');
    iframe.title = options.title || 'Data Viewer';
    iframe.className = options.iframeClass || 'data-viewer-iframe';
    iframe.src = options.src || DataViewer.defaultSrc();
    container.appendChild(iframe);

    DataViewer.register(instanceId, iframe, options);
    return instanceId;
  };

  DataViewer.isReady = function (instanceId) {
    return !!DataViewer._instances.get(instanceId)?.ready;
  };

  DataViewer.configure = function (instanceId, options = {}) {
    const state = DataViewer._instances.get(instanceId);
    if (!state) return;
    Object.assign(state.options, options);
    if (state.ready) DataViewer._configure(state);
  };

  DataViewer.setMode = function (instanceId, format, clear = false) {
    const state = DataViewer._instances.get(instanceId);
    if (!state) return;
    const resolved = DataViewer._normalizeFormat(format) || 'json';
    DataViewer._enqueue(state, () => {
      DataViewer._post(state, {
        type: 'data-viewer-set-mode',
        frameId: instanceId,
        format: resolved,
        clear,
      });
    });
  };

  /**
   * Load content into a viewer instance. Format is inferred when omitted.
   * @param {string} instanceId
   * @param {{ content?: string, format?: string, filename?: string, options?: object }} payload
   */
  DataViewer.setData = function (instanceId, payload = {}) {
    const state = DataViewer._instances.get(instanceId);
    if (!state) return;

    if (!payload.content) {
      state.pendingData = null;
      DataViewer.clear(instanceId);
      return;
    }

    state.pendingData = DataViewer.resolvePayload(payload);
    DataViewer._enqueue(state, () => DataViewer._deliverPending(state));
  };

  DataViewer.reload = function (instanceId) {
    const state = DataViewer._instances.get(instanceId);
    if (!state?.pendingData?.content || !state.ready) return;
    DataViewer._deliverPending(state);
  };

  DataViewer.clear = function (instanceId) {
    const state = DataViewer._instances.get(instanceId);
    if (!state) return;
    state.pendingData = null;
    DataViewer._enqueue(state, () => {
      DataViewer._post(state, {
        type: 'data-viewer-clear',
        frameId: instanceId,
      });
    });
  };

  DataViewer.reset = function (instanceId) {
    const state = DataViewer._instances.get(instanceId);
    if (!state) return;
    DataViewer._enqueue(state, () => {
      DataViewer._post(state, {
        type: 'data-viewer-reset',
        frameId: instanceId,
      });
    });
  };

  DataViewer.setTheme = function (instanceId, theme) {
    const state = DataViewer._instances.get(instanceId);
    if (!state) return;
    const next = theme === 'dark' ? 'dark' : 'light';
    state.options.theme = next;
    DataViewer._enqueue(state, () => {
      DataViewer._configure(state, next);
      DataViewer._post(state, {
        type: 'data-viewer-theme',
        theme: next,
      });
    });
  };

  DataViewer.syncTheme = function (theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    DataViewer._instances.forEach((_state, instanceId) => {
      DataViewer.setTheme(instanceId, next);
    });
  };

  DataViewer.setThemeAll = function (theme) {
    DataViewer.syncTheme(theme);
  };

  DataViewer.setFullscreen = function (instanceId, fullscreen, target = 'graph') {
    const state = DataViewer._instances.get(instanceId);
    if (!state) return;
    DataViewer._enqueue(state, () => {
      DataViewer._post(state, {
        type: 'data-viewer-fullscreen',
        frameId: instanceId,
        fullscreen: !!fullscreen,
        target,
      });
    });
  };

  DataViewer.unmount = function (instanceId) {
    const state = DataViewer._instances.get(instanceId);
    if (!state) return;
    state.unmount?.();
    state.iframe?.remove();
  };

  DataViewer.bind = function (iframe, viewerUrl, frameId, options = {}) {
    if (iframe && viewerUrl) iframe.src = viewerUrl;
    return DataViewer.register(frameId, iframe, { src: viewerUrl, ...options });
  };
})(window.Widgets.DataViewer, window.Widgets, document, window);
