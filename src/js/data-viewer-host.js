/**
 * Reusable Data Viewer host helper for tabbed (or pane) embeds.
 *
 * Usage (new page / tab):
 *   const viewer = DataViewerHost.create({
 *     instanceId: 'data-viewer-maps',
 *     iframe: '#data-viewer-maps',
 *     tabButton: '#maps-tab-data-viewer',
 *     importExportRoot: '/maps/exports',
 *     onFullscreen: (detail) => { ... },
 *     // or shorthand — applies data-viewer-host-fullscreen* layout automatically:
 *     fullscreenRoot: '#profiling-view-detail',
 *     structuredTabButton: '#profiling-tab-structured',
 *     tabListSelector: '#profiling-exam-tabs',
 *   });
 *   viewer.setPayload({ content: xml, filename: 'scan.xml' });
 */
window.Widgets = window.Widgets || {};
window.Widgets.DataViewerHost = window.Widgets.DataViewerHost || {};

(function (Host, DataViewer, document, window) {
  'use strict';

  Host.VISIBLE_RELOAD_DELAY_MS = 150;
  Host._bindings = new Map();

  Host._resolveElement = function (target) {
    if (!target) return null;
    if (typeof target === 'string') return document.querySelector(target);
    return target;
  };

  Host.create = function (config) {
    const instanceId = config.instanceId;
    if (!instanceId) throw new Error('DataViewerHost.create requires instanceId');

    const iframe = Host._resolveElement(config.iframe);
    if (!iframe) throw new Error(`DataViewerHost: iframe not found for ${instanceId}`);

    const prior = Host._bindings.get(instanceId);
    if (prior && prior.iframe === iframe) {
      Object.assign(prior.config, config);
      prior._register();
      return prior.api;
    }
    if (prior) Host.destroy(instanceId);

    const binding = {
      instanceId,
      iframe,
      config: { ...config },
      _lastPayload: null,
      api: null,
      _tabListener: null,
      _readyListener: null,
      _fullscreenListener: null,
    };

    binding._register = function () {
      DataViewer.register(instanceId, iframe, {
        src: config.src || DataViewer.defaultSrc(),
        importExportRoot: config.importExportRoot || '',
        toolsMenuEnabled: config.toolsMenuEnabled !== false,
        fileIoMode: config.fileIoMode || 'delegated',
      });
    };

    binding._setPayload = function (payload) {
      binding._lastPayload = payload;
      if (!payload?.content) {
        DataViewer.clear(instanceId);
        return;
      }
      DataViewer.setData(instanceId, payload);
    };

    binding._reloadWhenVisible = function () {
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          DataViewer.reload(instanceId);
          if (binding._lastPayload?.content) {
            binding._setPayload(binding._lastPayload);
          }
        }, Host.VISIBLE_RELOAD_DELAY_MS);
      });
    };

    binding.api = {
      instanceId,
      ensure: () => binding._register(),
      setPayload: (payload) => binding._setPayload(payload),
      clear: () => DataViewer.clear(instanceId),
      reset: () => DataViewer.reset(instanceId),
      reloadWhenVisible: () => binding._reloadWhenVisible(),
      destroy: () => Host.destroy(instanceId),
    };

    if (config.tabButton) {
      const tab = Host._resolveElement(config.tabButton);
      if (tab) {
        binding._tab = tab;
        binding._tabListener = () => binding._reloadWhenVisible();
        tab.addEventListener('shown.bs.tab', binding._tabListener);
      }
    }

    if (!config.onFullscreen && config.fullscreenRoot) {
      config.onFullscreen = Host.createFullscreenHandler({
        instanceId,
        root: config.fullscreenRoot,
        widgetRoot: config.fullscreenWidgetRoot,
        structuredTabButton: config.structuredTabButton,
        tabListSelector: config.tabListSelector,
      });
    }

    binding._readyListener = (event) => {
      if (event.detail?.instanceId !== instanceId) return;
      if (window.Widgets.Theme?.get && DataViewer.syncTheme) {
        DataViewer.syncTheme(window.Widgets.Theme.get());
      }
      config.onReady?.(binding.api);
      if (binding._lastPayload?.content) binding._setPayload(binding._lastPayload);
    };
    window.addEventListener('data-viewer:ready', binding._readyListener);

    if (config.onFullscreen) {
      binding._fullscreenListener = (event) => {
        if (event.detail?.instanceId !== instanceId) return;
        config.onFullscreen(event.detail);
      };
      window.addEventListener('data-viewer:fullscreen-changed', binding._fullscreenListener);
    }

    binding._register();
    Host._bindings.set(instanceId, binding);
    Host._ensureThemeListener();
    return binding.api;
  };

  Host.get = function (instanceId) {
    return Host._bindings.get(instanceId)?.api || null;
  };

  /**
   * Tear down a binding created by Host.create: removes the window-level
   * 'data-viewer:ready' / 'data-viewer:fullscreen-changed' listeners and the
   * tab's 'shown.bs.tab' listener, then unmounts the underlying DataViewer
   * instance. Without this, callers that rebuild their DOM (innerHTML = '')
   * and re-call Host.create with a fresh iframe element (same instanceId)
   * leak a full set of window listeners every time — the prior binding's
   * `iframe !== iframe` check never reuses it, so a brand new binding (and
   * new listeners) is created on top of the still-attached old ones.
   */
  Host.destroy = function (instanceId) {
    const binding = Host._bindings.get(instanceId);
    if (!binding) return;
    if (binding._readyListener) window.removeEventListener('data-viewer:ready', binding._readyListener);
    if (binding._fullscreenListener) window.removeEventListener('data-viewer:fullscreen-changed', binding._fullscreenListener);
    if (binding._tab && binding._tabListener) binding._tab.removeEventListener('shown.bs.tab', binding._tabListener);
    Host._bindings.delete(instanceId);
    DataViewer.unmount(instanceId);
  };

  Host.inferFormat = function (payload) {
    return DataViewer.inferFormat(payload);
  };

  /**
   * Standard host reaction to data-viewer-fullscreen-changed.
   * Graph target: expand embed root, hide chrome marked data-viewer-chrome~="graph",
   * ensure structuredTabButton is active. Browser target: also hide widget navbar.
   * On exit, restores the exam sub-tab that was active before graph fullscreen.
   */
  Host.createFullscreenHandler = function (options) {
    const instanceId = options.instanceId;
    const root = options.root;
    const widgetRoot = options.widgetRoot || '#widget-root';
    const structuredTabButton = options.structuredTabButton || null;
    const tabListSelector = options.tabListSelector || null;
    let priorExamTab = null;

    const showBootstrapTab = function (button) {
      if (!button || !window.bootstrap?.Tab) return;
      window.bootstrap.Tab.getOrCreateInstance(button).show();
    };

    return function onFullscreen(detail) {
      if (!detail || detail.instanceId !== instanceId) return;

      const rootEl = Host._resolveElement(root);
      if (!rootEl) return;

      const widgetEl = Host._resolveElement(widgetRoot);
      const isFullscreen = !!detail.fullscreen;
      const isBrowser = detail.target === 'browser';
      const isGraph = !isBrowser;

      rootEl.classList.toggle('data-viewer-host-fullscreen', isFullscreen);
      const expandGraphLayout = isFullscreen && (isGraph || isBrowser);
      rootEl.classList.toggle('data-viewer-host-fullscreen-graph', expandGraphLayout);
      rootEl.classList.toggle('data-viewer-host-fullscreen-browser', isFullscreen && isBrowser);
      if (widgetEl) {
        widgetEl.classList.toggle('data-viewer-host-fullscreen-browser', isFullscreen && isBrowser);
      }

      if (expandGraphLayout) {
        const structuredBtn = Host._resolveElement(structuredTabButton);
        if (structuredBtn) {
          const tabList = tabListSelector
            ? Host._resolveElement(tabListSelector)
            : structuredBtn.closest('[role="tablist"]');
          const active = tabList?.querySelector('.nav-link.active, [role="tab"].active');
          if (active && active !== structuredBtn) priorExamTab = active;
          if (!structuredBtn.classList.contains('active')) showBootstrapTab(structuredBtn);
        }
        return;
      }

      if (priorExamTab) {
        showBootstrapTab(priorExamTab);
        priorExamTab = null;
      }
    };
  };

  Host._ensureThemeListener = function () {
    if (window.__spiderfeetDataViewerThemeBound) return;
    window.__spiderfeetDataViewerThemeBound = true;
    window.addEventListener('shell:theme-changed', (event) => {
      const theme = event.detail?.theme;
      if (theme && DataViewer.syncTheme) {
        DataViewer.syncTheme(theme);
      }
    });
  };
})(window.Widgets.DataViewerHost, window.Widgets.DataViewer, document, window);
