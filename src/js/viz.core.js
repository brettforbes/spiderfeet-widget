/**
 * Viz.Core — shared SVG utilities for HTML5 + D3 v7 visualisations.
 */
(function (global) {
  'use strict';

  global.Viz = global.Viz || {};

  const Core = {
    selectSvg(svgElement) {
      const el =
        typeof svgElement === 'string'
          ? document.querySelector(svgElement)
          : svgElement;
      return d3.select(el);
    },

    clear(svgSelection) {
      svgSelection.selectAll('*').remove();
    },

    dimensions(svgElement, options = {}) {
      const el =
        typeof svgElement === 'string'
          ? document.querySelector(svgElement)
          : svgElement;
      const stage = el?.closest('#viz-stage') || el?.parentElement || el;
      const rect = stage.getBoundingClientRect();
      const measuredW = rect.width > 0 ? rect.width : 0;
      const measuredH = rect.height > 0 ? rect.height : 0;
      const width = options.width ?? (measuredW || 800);
      const height = options.height ?? (measuredH || 500);
      const margin = {
        top: 20,
        right: 30,
        bottom: 40,
        left: 50,
        ...options.margin,
      };
      return {
        width,
        height,
        margin,
        innerWidth: width - margin.left - margin.right,
        innerHeight: height - margin.top - margin.bottom,
      };
    },

    observeResize(element, callback) {
      const target =
        typeof element === 'string' ? document.querySelector(element) : element;
      if (!target || typeof ResizeObserver === 'undefined') {
        window.addEventListener('resize', callback);
        return () => window.removeEventListener('resize', callback);
      }
      const observer = new ResizeObserver(() => callback());
      observer.observe(target);
      return () => observer.disconnect();
    },

    cloneGraph({ nodes, links }) {
      return {
        nodes: nodes.map((n) => ({ ...n })),
        links: links.map((l) => ({ ...l })),
      };
    },

    colourByGroup(groups) {
      return d3.scaleOrdinal(d3.schemeTableau10).domain(groups);
    },
  };

  global.Viz.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
