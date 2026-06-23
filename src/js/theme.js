window.Widgets = window.Widgets || {};
window.Widgets.Theme = window.Widgets.Theme || {};

(function (Theme, Widgets, document, window) {
  'use strict';

  const STORAGE_KEY = 'spiderfeet-widget-theme';
  Theme.selectorRoot = '#widget-root';
  Theme.selectorToggle = '[data-action="toggle-theme"]';

  Theme.getStored = function () {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch (_err) {
      /* private mode */
    }
    return null;
  };

  Theme.getPreferred = function () {
    const stored = Theme.getStored();
    if (stored) return stored;
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  };

  Theme.get = function () {
    const root = document.querySelector(Theme.selectorRoot);
    const current = root?.getAttribute('data-bs-theme');
    if (current === 'light' || current === 'dark') return current;
    return Theme.getPreferred();
  };

  Theme.apply = function (theme, meta = {}) {
    const next = theme === 'dark' ? 'dark' : 'light';
    const root = document.querySelector(Theme.selectorRoot);
    if (root) root.setAttribute('data-bs-theme', next);

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (_err) {
      /* ignore */
    }

    document.querySelectorAll(Theme.selectorToggle).forEach((btn) => {
      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = next === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
      }
      btn.setAttribute('aria-label', next === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      btn.setAttribute('title', next === 'dark' ? 'Light mode' : 'Dark mode');
    });

    if (!meta.fromViewer && window.Widgets.DataViewer?.syncTheme) {
      window.Widgets.DataViewer.syncTheme(next);
    }

    window.dispatchEvent(new CustomEvent('shell:theme-changed', { detail: { theme: next } }));
    return next;
  };

  Theme.toggle = function () {
    return Theme.apply(Theme.get() === 'dark' ? 'light' : 'dark');
  };

  Theme.init = function ($root) {
    const el = $root[0];
    if (el.dataset.themeInitialized === 'true') return;
    el.dataset.themeInitialized = 'true';

    Theme.apply(Theme.getPreferred());

    el.querySelectorAll(Theme.selectorToggle).forEach((btn) => {
      btn.addEventListener('click', () => Theme.toggle());
    });
  };

  Widgets.watchDOMForComponent(Theme.selectorRoot, Theme.init);
})(window.Widgets.Theme, window.Widgets, document, window);
