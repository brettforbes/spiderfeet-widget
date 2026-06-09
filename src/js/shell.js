window.Widgets = window.Widgets || {};
window.Widgets.Shell = window.Widgets.Shell || {};

(function ($, Shell, Widgets, document, window) {
  'use strict';

  Shell.selector = '#widget-root';

  Shell.activateTab = function (tabId) {
    document.querySelectorAll('[data-shell-tab]').forEach((btn) => {
      const active = btn.dataset.shellTab === tabId;
      btn.classList.toggle('active', active);
      btn.classList.toggle('text-white', active);
      btn.classList.toggle('text-white-50', !active);
      btn.setAttribute('aria-current', active ? 'page' : 'false');
    });

    document.querySelectorAll('[data-shell-pane]').forEach((pane) => {
      const show = pane.dataset.shellPane === tabId;
      pane.classList.toggle('show', show);
      pane.classList.toggle('active', show);
      pane.classList.toggle('d-none', !show);
    });

    window.dispatchEvent(new CustomEvent('shell:tab-changed', { detail: { tabId } }));
  };

  Shell.init = function ($root) {
    const el = $root[0];
    if (el.dataset.shellInitialized) return;
    el.dataset.shellInitialized = 'true';

    el.querySelectorAll('[data-shell-tab]').forEach((btn) => {
      if (btn.disabled) return;
      btn.addEventListener('click', () => {
        Shell.activateTab(btn.dataset.shellTab);
      });
    });
  };

  Widgets.watchDOMForComponent(Shell.selector, Shell.init);
})(window.jQuery, window.Widgets.Shell, window.Widgets, document, window);
