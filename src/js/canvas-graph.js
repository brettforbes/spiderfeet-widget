/**
 * Viz.CanvasGraph — canvas-rendered force graph (SPEC-009).
 * AB1: scaffold + zoom/resize + rAF draw loop (static positions; physics = Epic AC).
 */
(function (global) {
  'use strict';

  global.Viz = global.Viz || {};
  const Core = global.Viz.Core;

  function resolveEl(selectorOrEl) {
    if (!selectorOrEl) return null;
    return typeof selectorOrEl === 'string'
      ? document.querySelector(selectorOrEl)
      : selectorOrEl;
  }

  function seedPositions(nodes, width, height) {
    const cx = width / 2;
    const cy = height / 2;
    const n = Math.max(nodes.length, 1);
    nodes.forEach((node, i) => {
      if (typeof node.x === 'number' && typeof node.y === 'number') return;
      const angle = (i / n) * 2 * Math.PI;
      const radius = 40 + (i % 12) * 18;
      node.x = cx + radius * Math.cos(angle);
      node.y = cy + radius * Math.sin(angle);
    });
  }

  function linkEndpoints(link, byId) {
    const s = typeof link.source === 'object' ? link.source : byId.get(link.source);
    const t = typeof link.target === 'object' ? link.target : byId.get(link.target);
    return { s, t };
  }

  const CanvasGraph = {
    variants: ['default', 'sparse', 'dense', 'grouped'],

    create(options) {
      const {
        canvas: canvasSelector,
        tooltip: tooltipSelector,
        nodes: rawNodes,
        links: rawLinks,
        variant = 'default',
        nodeDisplay = 'circles',
        linkLabels = false,
        linkDistance = null,
        onNodeClick,
        onNodeHover,
      } = options;

      const canvasEl = resolveEl(canvasSelector);
      if (!canvasEl || typeof canvasEl.getContext !== 'function') {
        throw new Error('Viz.CanvasGraph.create: canvas element required');
      }
      const ctx = canvasEl.getContext('2d');
      const tooltipEl = tooltipSelector ? resolveEl(tooltipSelector) : null;

      const { nodes, links } = Core.cloneGraph({
        nodes: rawNodes || [],
        links: rawLinks || [],
      });
      nodes.forEach((n) => {
        n.nodeDisplay = nodeDisplay;
      });
      const byId = new Map(nodes.map((n) => [n.id, n]));
      links.forEach((l) => {
        if (typeof l.source !== 'object') l.source = byId.get(l.source) || l.source;
        if (typeof l.target !== 'object') l.target = byId.get(l.target) || l.target;
      });

      let width = 800;
      let height = 500;
      let transform = d3.zoomIdentity;
      let rafId = 0;
      let destroyed = false;

      function applyCanvasSize() {
        const dims = Core.dimensions(canvasEl);
        width = dims.width;
        height = dims.height;
        const dpr = Math.max(window.devicePixelRatio || 1, 1);
        canvasEl.style.width = `${width}px`;
        canvasEl.style.height = `${height}px`;
        canvasEl.width = Math.max(1, Math.floor(width * dpr));
        canvasEl.height = Math.max(1, Math.floor(height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      applyCanvasSize();
      seedPositions(nodes, width, height);

      const zoom = d3
        .zoom()
        .scaleExtent([0.2, 8])
        .on('zoom', (event) => {
          transform = event.transform;
        });
      const canvasSel = d3.select(canvasEl);
      canvasSel.call(zoom);
      canvasSel.on('dblclick.zoom', null);

      function drawStubFrame() {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.restore();

        const dpr = Math.max(window.devicePixelRatio || 1, 1);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.save();
        ctx.translate(transform.x, transform.y);
        ctx.scale(transform.k, transform.k);

        // AB1 stub: simple circles + lines (AB2 replaces with full drawing parity).
        ctx.lineWidth = 1.5 / transform.k;
        ctx.strokeStyle = '#999';
        links.forEach((link) => {
          const { s, t } = linkEndpoints(link, byId);
          if (!s || !t) return;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(t.x, t.y);
          ctx.stroke();
        });

        nodes.forEach((node) => {
          const r = node.r || 8;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
          ctx.fillStyle = node.colour || node.fill || '#3B82F6';
          ctx.fill();
        });

        ctx.restore();
      }

      function loop() {
        if (destroyed) return;
        drawStubFrame();
        rafId = window.requestAnimationFrame(loop);
      }
      rafId = window.requestAnimationFrame(loop);

      const disconnectResize = Core.observeResize(canvasEl.parentElement || canvasEl, () => {
        if (destroyed) return;
        applyCanvasSize();
      });

      // Stash for later epics (AC/AB3); unused in AB1 beyond API surface.
      void variant;
      void linkLabels;
      void linkDistance;
      void onNodeClick;
      void onNodeHover;
      void tooltipEl;

      return {
        nodes,
        links,
        getTransform() {
          return transform;
        },
        restart() {
          /* no physics yet (Epic AC) */
        },
        destroy() {
          destroyed = true;
          if (rafId) window.cancelAnimationFrame(rafId);
          rafId = 0;
          disconnectResize();
          canvasSel.on('.zoom', null);
          canvasSel.on('dblclick.zoom', null);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        },
      };
    },
  };

  global.Viz.CanvasGraph = CanvasGraph;
})(typeof window !== 'undefined' ? window : globalThis);
