/**
 * Viz.CanvasGraph — canvas-rendered force graph (SPEC-009).
 * AB1: scaffold + zoom/resize + rAF draw loop.
 * AB2: node/link drawing parity with Viz.ForceGraph.
 * Physics offload = Epic AC; hit-testing = AB3.
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

  function nodeFill(d, colour) {
    if (d.colour) return d.colour;
    if (d.fill) return d.fill;
    return colour(d.group);
  }

  function linkStroke(l) {
    if (l.role === 'consumed') return '#64748b';
    if (l.role === 'produced') return '#0ea5e9';
    if (l.role === 'had') return '#94a3b8';
    if (l.role === 'contains') return '#64748b';
    if (l.role === 'listens-to') return '#0ea5e9';
    return '#999';
  }

  function linkDash(l) {
    if (l.role === 'consumed' || l.role === 'had') return [4, 3];
    return null;
  }

  /** Match Viz.ForceGraph.formatNuggetTitle line wrapping. */
  function formatNuggetFallbackLines(raw) {
    const words = String(raw || '')
      .split('_')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    if (!words.length) return ['?'];
    if (words.length <= 3) return words;
    const lines = [];
    let buf = '';
    words.forEach((w) => {
      const next = buf ? `${buf} ${w}` : w;
      if (next.length > 12 && buf) {
        lines.push(buf);
        buf = w;
      } else {
        buf = next;
      }
    });
    if (buf) lines.push(buf);
    return lines.slice(0, 4);
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawCenteredLabelText(ctx, lines, size) {
    const lineCount = Math.max(lines.length, 1);
    const fontSize = lineCount > 3 ? 5 : lineCount > 2 ? 5.5 : 6.5;
    const lineHeight = fontSize * 1.05;
    const startY = -((lineCount - 1) * lineHeight) / 2;
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => {
      ctx.fillText(line, 0, startY + i * lineHeight, size - 4);
    });
  }

  function createImageCache() {
    const cache = new Map();
    return {
      get(url) {
        if (!url) return null;
        let entry = cache.get(url);
        if (entry) return entry;
        entry = { img: new Image(), ready: false, failed: false };
        entry.img.decoding = 'async';
        entry.img.onload = () => {
          entry.ready = true;
        };
        entry.img.onerror = () => {
          entry.failed = true;
        };
        entry.img.src = url;
        cache.set(url, entry);
        return entry;
      },
      clear() {
        cache.clear();
      },
    };
  }

  function nodeCollisionRadius(d) {
    if (d.nodeDisplay === 'icons') {
      return d.iconSize ? d.iconSize / 2 : 18;
    }
    return d.r || 8;
  }

  /** Same force variants as viz.force.js / canvas-graph.worker.js (shared for main-thread fallback). */
  const VARIANTS = {
    default(simulation, width, height) {
      simulation
        .force('link', d3.forceLink().id((n) => n.id).distance(80).strength(0.8))
        .force('charge', d3.forceManyBody().strength(-220))
        .force('center', d3.forceCenter(width / 2, height / 2));
    },
    sparse(simulation, width, height) {
      simulation
        .force('link', d3.forceLink().id((n) => n.id).distance(140).strength(0.4))
        .force('charge', d3.forceManyBody().strength(-120))
        .force('center', d3.forceCenter(width / 2, height / 2));
    },
    dense(simulation, width, height) {
      simulation
        .force('link', d3.forceLink().id((n) => n.id).distance(35).strength(0.9))
        .force('charge', d3.forceManyBody().strength(-400))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collide', d3.forceCollide().radius((d) => nodeCollisionRadius(d) + 4));
    },
    grouped(simulation, width, height, nodes) {
      const groups = [...new Set(nodes.map((n) => n.group))];
      const centres = new Map(
        groups.map((g, i) => {
          const angle = (i / groups.length) * 2 * Math.PI;
          return [
            g,
            {
              x: width / 2 + 120 * Math.cos(angle),
              y: height / 2 + 120 * Math.sin(angle),
            },
          ];
        })
      );
      simulation
        .force('link', d3.forceLink().id((n) => n.id).distance(50))
        .force('charge', d3.forceManyBody().strength(-250))
        .force('x', d3.forceX((d) => centres.get(d.group).x).strength(0.12))
        .force('y', d3.forceY((d) => centres.get(d.group).y).strength(0.12));
    },
  };

  function startMainThreadSimulation(nodes, links, variant, width, height, linkDistance) {
    const simulation = d3.forceSimulation(nodes);
    const applyVariant = VARIANTS[variant] || VARIANTS.default;
    applyVariant(simulation, width, height, nodes);
    const linkForce = simulation.force('link');
    if (linkForce) {
      linkForce.links(links);
      if (linkDistance) linkForce.distance(linkDistance);
    }
    return simulation;
  }

  const WORKER_URL = '/workers/canvas-graph.worker.js';

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
      const imageCache = createImageCache();

      const { nodes, links } = Core.cloneGraph({
        nodes: rawNodes || [],
        links: rawLinks || [],
      });
      nodes.forEach((n) => {
        n.nodeDisplay = nodeDisplay;
      });
      const groups = [...new Set(nodes.map((n) => n.group))];
      const colour = Core.colourByGroup(groups);
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

      function drawLabelFallback(d) {
        const size = d.iconSize || 28;
        const fill = d.colour || '#3B82F6';
        const lines = formatNuggetFallbackLines(d.shortLabel || d.label || d.id);
        ctx.save();
        ctx.translate(d.x, d.y);
        if (d.isShadow) ctx.globalAlpha = 0.55;
        drawRoundedRect(ctx, -size / 2, -size / 2, size, size, 4);
        ctx.fillStyle = fill;
        ctx.fill();
        drawCenteredLabelText(ctx, lines, size);
        ctx.restore();
      }

      function drawIconNode(d) {
        const size = d.iconSize || 28;
        const hitR = size / 2;
        if (d.iconLabelFallback || !d.iconUrl) {
          drawLabelFallback(d);
          return;
        }
        const entry = imageCache.get(d.iconUrl);
        if (entry?.failed && d.iconFallbackUrl) {
          const fb = imageCache.get(d.iconFallbackUrl);
          if (fb?.failed || (!fb?.ready && !entry.ready)) {
            drawLabelFallback(d);
            return;
          }
        }
        if (entry?.failed && !d.iconFallbackUrl) {
          drawLabelFallback(d);
          return;
        }
        const readyEntry =
          entry?.ready
            ? entry
            : d.iconFallbackUrl && imageCache.get(d.iconFallbackUrl)?.ready
              ? imageCache.get(d.iconFallbackUrl)
              : null;
        if (!readyEntry) {
          // Placeholder while decoding — coloured rect matching icon bg.
          ctx.save();
          ctx.translate(d.x, d.y);
          if (d.isShadow) ctx.globalAlpha = 0.55;
          if (d.group === 'service') {
            const quarantineRing = Boolean(d.originRing);
            const ringColour = quarantineRing
              ? d.originColour || '#7C3AED'
              : d.fixtureColour || d.colour || '#57534E';
            ctx.beginPath();
            ctx.arc(0, 0, hitR + 4, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = ringColour;
            ctx.lineWidth = 3;
            if (quarantineRing) ctx.setLineDash([5, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
          } else {
            drawRoundedRect(ctx, -size / 2, -size / 2, size, size, 4);
            ctx.fillStyle = d.colour || '#3B82F6';
            ctx.fill();
          }
          ctx.restore();
          return;
        }

        ctx.save();
        ctx.translate(d.x, d.y);
        if (d.isShadow) ctx.globalAlpha = 0.55;
        if (d.group === 'service') {
          const quarantineRing = Boolean(d.originRing);
          const ringColour = quarantineRing
            ? d.originColour || '#7C3AED'
            : d.fixtureColour || d.colour || '#57534E';
          ctx.beginPath();
          ctx.arc(0, 0, hitR + 4, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = ringColour;
          ctx.lineWidth = 3;
          if (quarantineRing) ctx.setLineDash([5, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          drawRoundedRect(ctx, -size / 2, -size / 2, size, size, 4);
          ctx.fillStyle = d.colour || '#3B82F6';
          ctx.fill();
        }
        ctx.drawImage(readyEntry.img, -size / 2, -size / 2, size, size);
        if (d.pinned) {
          ctx.beginPath();
          ctx.arc(0, 0, hitR + (d.group === 'service' ? 4 : 0) + 2, 0, Math.PI * 2);
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.restore();
      }

      function drawCircleNode(d) {
        const r = d.r || 8;
        ctx.save();
        ctx.translate(d.x, d.y);
        if (d.isShadow) ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = nodeFill(d, colour);
        ctx.fill();
        if (d.group === 'service') {
          const quarantineRing = Boolean(d.originRing);
          const ringColour = quarantineRing
            ? d.originColour || '#7C3AED'
            : d.fixtureColour || d.colour || '#57534E';
          ctx.strokeStyle = ringColour;
          ctx.lineWidth = 2.5;
          if (quarantineRing) ctx.setLineDash([5, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (d.pinned) {
          ctx.beginPath();
          ctx.arc(0, 0, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.restore();
      }

      function drawNode(d) {
        if (nodeDisplay === 'icons') drawIconNode(d);
        else drawCircleNode(d);
      }

      function drawFrame() {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.restore();

        const dpr = Math.max(window.devicePixelRatio || 1, 1);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.save();
        ctx.translate(transform.x, transform.y);
        ctx.scale(transform.k, transform.k);

        const invK = 1 / transform.k;
        links.forEach((link) => {
          const { s, t } = linkEndpoints(link, byId);
          if (!s || !t) return;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(t.x, t.y);
          ctx.strokeStyle = linkStroke(link);
          ctx.lineWidth = 1.5 * invK;
          const dash = linkDash(link);
          if (dash) ctx.setLineDash(dash.map((v) => v * invK));
          else ctx.setLineDash([]);
          ctx.stroke();
          ctx.setLineDash([]);

          if (linkLabels) {
            const label = link.label || link.role || '';
            if (!label) return;
            const mx = (s.x + t.x) / 2;
            const my = (s.y + t.y) / 2;
            ctx.fillStyle = '#475569';
            ctx.font = `${9 * invK}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, mx, my);
          }
        });

        nodes.forEach(drawNode);
        ctx.restore();
      }

      function loop() {
        if (destroyed) return;
        drawFrame();
        rafId = window.requestAnimationFrame(loop);
      }
      rafId = window.requestAnimationFrame(loop);

      let worker = null;
      let simulation = null;
      let useWorker = typeof Worker !== 'undefined' && options.forceMainThread !== true;
      let reheatTimer = null;

      function applyPositions(positions) {
        if (!positions || !positions.length) return;
        positions.forEach((p) => {
          const n = byId.get(p.id);
          if (!n) return;
          n.x = p.x;
          n.y = p.y;
        });
      }

      function postWorker(msg) {
        if (worker) worker.postMessage(msg);
      }

      function serializableNodes() {
        return nodes.map((n) => ({
          id: n.id,
          group: n.group,
          r: n.r,
          iconSize: n.iconSize,
          nodeDisplay: n.nodeDisplay,
          fx: n.fx,
          fy: n.fy,
          pinned: n.pinned,
          x: n.x,
          y: n.y,
        }));
      }

      function serializableLinks() {
        return links.map((l) => ({
          source: typeof l.source === 'object' ? l.source.id : l.source,
          target: typeof l.target === 'object' ? l.target.id : l.target,
          role: l.role,
          label: l.label,
          id: l.id,
        }));
      }

      function startWorkerPhysics() {
        worker = new Worker(WORKER_URL);
        worker.onmessage = (event) => {
          const msg = event.data || {};
          if (msg.type === 'tick') applyPositions(msg.positions);
          if (msg.type === 'error') {
            console.warn('CanvasGraph worker error, falling back to main thread:', msg.message);
            stopWorker();
            startMainPhysics();
          }
        };
        worker.onerror = (err) => {
          console.warn('CanvasGraph worker failed, falling back to main thread:', err.message);
          stopWorker();
          startMainPhysics();
        };
        postWorker({
          type: 'init',
          nodes: serializableNodes(),
          links: serializableLinks(),
          variant,
          width,
          height,
          linkDistance,
        });
      }

      function stopWorker() {
        if (!worker) return;
        try {
          worker.postMessage({ type: 'destroy' });
        } catch (_) {
          /* ignore */
        }
        try {
          worker.terminate();
        } catch (_) {
          /* ignore */
        }
        worker = null;
        useWorker = false;
      }

      function startMainPhysics() {
        if (simulation) simulation.stop();
        simulation = startMainThreadSimulation(
          nodes,
          links,
          variant,
          width,
          height,
          linkDistance
        );
      }

      if (useWorker) {
        try {
          startWorkerPhysics();
        } catch (err) {
          console.warn('CanvasGraph Worker unavailable, using main thread:', err.message);
          useWorker = false;
          startMainPhysics();
        }
      } else {
        startMainPhysics();
      }

      const disconnectResize = Core.observeResize(canvasEl.parentElement || canvasEl, () => {
        if (destroyed) return;
        applyCanvasSize();
        if (worker) {
          postWorker({ type: 'resize', width, height });
        } else if (simulation) {
          simulation.force('center', d3.forceCenter(width / 2, height / 2));
          simulation.alpha(0.3).restart();
        }
      });

      void onNodeClick;
      void onNodeHover;
      void tooltipEl;

      return {
        nodes,
        links,
        usingWorker() {
          return Boolean(worker);
        },
        getTransform() {
          return transform;
        },
        pinNode(id, x, y) {
          const n = byId.get(id);
          if (!n) return;
          n.fx = x;
          n.fy = y;
          n.pinned = true;
          if (worker) postWorker({ type: 'pin', id, x, y });
          else if (simulation) simulation.alphaTarget(0.3).restart();
        },
        unpinNode(id) {
          const n = byId.get(id);
          if (!n) return;
          n.fx = null;
          n.fy = null;
          n.pinned = false;
          if (worker) {
            postWorker({ type: 'unpin', id });
          } else if (simulation) {
            simulation.alphaTarget(0.3).restart();
            if (reheatTimer) clearTimeout(reheatTimer);
            reheatTimer = setTimeout(() => {
              if (simulation) simulation.alphaTarget(0);
            }, 400);
          }
        },
        restart() {
          if (worker) postWorker({ type: 'reheat' });
          else if (simulation) simulation.alpha(1).restart();
        },
        destroy() {
          destroyed = true;
          if (rafId) window.cancelAnimationFrame(rafId);
          rafId = 0;
          if (reheatTimer) clearTimeout(reheatTimer);
          disconnectResize();
          imageCache.clear();
          if (simulation) {
            simulation.stop();
            simulation = null;
          }
          stopWorker();
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
