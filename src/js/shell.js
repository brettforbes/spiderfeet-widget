window.Widgets = window.Widgets || {};
window.Widgets.Shell = window.Widgets.Shell || {};

(function ($, Shell, Widgets, document, window) {
  'use strict';

  Shell.selector = '#widget-root';

  const HIDE_IDLE_MS = 3000;
  const TOP_EDGE_PX = 24;

  let hideTimer = null;
  let rootEl = null;
  let headerEl = null;

  function measureHeaderHeight() {
    if (!rootEl || !headerEl) return;
    // Measure while visible so translate/margin math stays accurate.
    const wasHidden = rootEl.classList.contains('app-header-hidden');
    if (wasHidden) rootEl.classList.remove('app-header-hidden');
    const h = Math.ceil(headerEl.getBoundingClientRect().height) || 48;
    rootEl.style.setProperty('--app-header-height', `${h}px`);
    if (wasHidden) rootEl.classList.add('app-header-hidden');
  }

  function showHeader() {
    if (!rootEl) return;
    rootEl.classList.remove('app-header-hidden');
    scheduleHide();
  }

  function hideHeader() {
    if (!rootEl || !headerEl) return;
    // Don't steal focus from an open menu / focused control inside the header.
    if (headerEl.contains(document.activeElement)) return;
    measureHeaderHeight();
    rootEl.classList.add('app-header-hidden');
  }

  function clearHideTimer() {
    if (hideTimer != null) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function scheduleHide() {
    clearHideTimer();
    hideTimer = window.setTimeout(() => {
      hideTimer = null;
      hideHeader();
    }, HIDE_IDLE_MS);
  }

  function onPointerNearTop(event) {
    if (typeof event.clientY !== 'number') return;
    if (event.clientY <= TOP_EDGE_PX) {
      showHeader();
    }
  }

  function onFocusIn(event) {
    const t = event.target;
    if (!t || !headerEl) return;
    if (headerEl.contains(t) || (t.closest && t.closest('[data-shell-tab]'))) {
      showHeader();
    }
  }

  function onKeyReveal(event) {
    // Tab / Shift+Tab into chrome, or Alt alone-ish navigation cues.
    if (event.key === 'Tab' || event.key === 'F6') {
      showHeader();
    }
  }

  function bindAutoHide(el) {
    rootEl = el;
    headerEl = el.querySelector('#app-header') || el.querySelector('header');
    if (!headerEl) return;

    measureHeaderHeight();
    scheduleHide();

    window.addEventListener('mousemove', onPointerNearTop, { passive: true });
    window.addEventListener('focusin', onFocusIn, true);
    window.addEventListener('keydown', onKeyReveal, true);
    window.addEventListener('resize', measureHeaderHeight, { passive: true });

    // Interaction inside the header keeps it visible.
    headerEl.addEventListener(
      'mousemove',
      () => {
        showHeader();
      },
      { passive: true }
    );
    headerEl.addEventListener('mouseenter', showHeader);

    window.addEventListener('shell:tab-changed', () => {
      // After navigate: reveal briefly, then re-arm the idle hide (R13-11).
      showHeader();
    });
  }

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

    bindAutoHide(el);

    // Cold start / hard refresh: default tab is Projects.
    // Stale ?tab=composer from a prior Composer open must not steal the landing tab
    // (that left the navbar visible and skipped the Projects → Composer hide cycle).
    let landingTab = 'projects';
    try {
      const url = new URL(window.location.href);
      const requested = url.searchParams.get('tab');
      if (requested && requested !== 'composer') {
        landingTab = requested;
      } else {
        url.searchParams.set('tab', 'projects');
        history.replaceState(
          { tab: 'projects', projectId: url.searchParams.get('project') },
          '',
          url.toString()
        );
        landingTab = 'projects';
      }
    } catch (_err) {
      landingTab = 'projects';
    }
    Shell.activateTab(landingTab);
    // Re-arm auto-hide after landing (R13-11).
    window.setTimeout(() => {
      showHeader();
    }, 0);
  };

  Widgets.watchDOMForComponent(Shell.selector, Shell.init);
})(window.jQuery, window.Widgets.Shell, window.Widgets, document, window);
