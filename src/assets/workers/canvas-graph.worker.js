/**
 * CanvasGraph physics worker (SPEC-009 / AC1).
 * Classic worker — importScripts('/vendor.js') for global d3.
 */
/* global importScripts, d3 */

'use strict';

try {
  // Full vendor.js touches document on load (Bootstrap/etc). Use a slim d3 UMD
  // that loads cleanly in a classic Worker (validated: force* APIs only needed).
  importScripts('./canvas-graph-worker-vendor.js');
} catch (err) {
  self.postMessage({
    type: 'error',
    message: 'importScripts(canvas-graph-worker-vendor.js) failed: ' + (err && err.message ? err.message : String(err)),
  });
}

function nodeCollisionRadius(d) {
  if (d.nodeDisplay === 'icons') {
    return d.iconSize ? d.iconSize / 2 : 18;
  }
  return d.r || 8;
}

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

let simulation = null;
let nodes = [];
let links = [];
let width = 800;
let height = 500;
let lastPost = 0;
let reheatTimer = null;

function stopSimulation() {
  if (simulation) {
    simulation.stop();
    simulation = null;
  }
  if (reheatTimer) {
    clearTimeout(reheatTimer);
    reheatTimer = null;
  }
}

function postTick(force) {
  const now = Date.now();
  if (!force && now - lastPost < 16) return;
  lastPost = now;
  const positions = nodes.map((n) => ({ id: n.id, x: n.x, y: n.y }));
  self.postMessage({ type: 'tick', positions: positions });
}

function startSimulation(msg) {
  stopSimulation();
  if (typeof d3 === 'undefined' || !d3.forceSimulation) {
    self.postMessage({ type: 'error', message: 'd3.forceSimulation unavailable after importScripts' });
    return;
  }
  width = msg.width || 800;
  height = msg.height || 500;
  nodes = (msg.nodes || []).map((n) => ({ ...n }));
  links = (msg.links || []).map((l) => ({ ...l }));
  const variant = msg.variant || 'default';

  simulation = d3.forceSimulation(nodes);
  const applyVariant = VARIANTS[variant] || VARIANTS.default;
  applyVariant(simulation, width, height, nodes);
  const linkForce = simulation.force('link');
  if (linkForce) {
    linkForce.links(links);
    if (msg.linkDistance) linkForce.distance(msg.linkDistance);
  }
  simulation.on('tick', () => postTick(false));
  postTick(true);
}

function findNode(id) {
  return nodes.find((n) => n.id === id);
}

self.onmessage = function (event) {
  const msg = event.data || {};
  switch (msg.type) {
    case 'init':
      startSimulation(msg);
      break;
    case 'pin': {
      const n = findNode(msg.id);
      if (!n || !simulation) break;
      n.fx = msg.x;
      n.fy = msg.y;
      n.pinned = true;
      simulation.alphaTarget(0.3).restart();
      break;
    }
    case 'unpin': {
      const n = findNode(msg.id);
      if (!n || !simulation) break;
      n.fx = null;
      n.fy = null;
      n.pinned = false;
      simulation.alphaTarget(0.3).restart();
      if (reheatTimer) clearTimeout(reheatTimer);
      reheatTimer = setTimeout(() => {
        if (simulation) simulation.alphaTarget(0);
      }, 400);
      break;
    }
    case 'reheat':
      if (!simulation) break;
      simulation.alphaTarget(0.3).restart();
      if (reheatTimer) clearTimeout(reheatTimer);
      reheatTimer = setTimeout(() => {
        if (simulation) simulation.alphaTarget(0);
      }, 400);
      break;
    case 'resize':
      width = msg.width || width;
      height = msg.height || height;
      if (!simulation) break;
      if (simulation.force('center')) {
        simulation.force('center', d3.forceCenter(width / 2, height / 2));
      }
      simulation.alpha(0.3).restart();
      break;
    case 'destroy':
      stopSimulation();
      nodes = [];
      links = [];
      break;
    default:
      break;
  }
};

self.postMessage({ type: 'ready' });
