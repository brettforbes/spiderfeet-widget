globalThis.Widgets = globalThis.Widgets || {};
globalThis.Widgets.GraphShadows = globalThis.Widgets.GraphShadows || {};

(function (GraphShadows) {
  'use strict';

  function createShadowNode(target, shadowId, originalId, mode) {
    const node = {
      ...target,
      id: shadowId,
      shadow_of: originalId,
      is_shadow: true,
    };
    const meta = target.meta ? { ...target.meta } : {};
    meta.shadow_of = originalId;
    meta.shadow_mode = mode;
    node.meta = meta;
    return node;
  }

  GraphShadows.apply = function (graph, options) {
    const nodes = (graph?.nodes || []).map((node) => ({ ...node }));
    const edges = (graph?.edges || graph?.links || []).map((edge, index) => ({
      ...edge,
      id: edge.id || `edge-${index}`,
    }));
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const edgeRoles = new Set(options.edgeRoles || []);
    const shouldShadowTarget = options.shouldShadowTarget || (() => false);

    const targetCounts = new Map();
    edges.forEach((edge) => {
      const relation = edge.relation || edge.role || edge.name;
      const target = byId.get(edge.target);
      if (!edgeRoles.has(relation) || !target || !shouldShadowTarget(target, edge)) return;
      targetCounts.set(edge.target, (targetCounts.get(edge.target) || 0) + 1);
    });

    const shadowNodes = [];
    const shadowPairs = [];
    const shadowedTargets = new Set();
    const nextEdges = edges.map((edge) => {
      const relation = edge.relation || edge.role || edge.name;
      const target = byId.get(edge.target);
      if (!edgeRoles.has(relation) || !target || !shouldShadowTarget(target, edge)) return edge;
      if ((targetCounts.get(edge.target) || 0) < 2) return edge;

      const shadowId = `${edge.target}::shadow::${edge.source}::${edge.id}`;
      shadowedTargets.add(edge.target);
      shadowPairs.push({ originalId: edge.target, shadowId });
      shadowNodes.push(createShadowNode(target, shadowId, edge.target, options.mode || 'shadow'));
      return { ...edge, target: shadowId, shadow_of: edge.target };
    });

    shadowPairs.forEach(({ originalId, shadowId }) => {
      edges.forEach((edge) => {
        if (edge.source !== originalId) return;
        nextEdges.push({
          ...edge,
          id: `${edge.id}::shadow-source::${shadowId}`,
          source: shadowId,
          shadow_of: originalId,
        });
      });
    });

    const referenced = new Set();
    nextEdges.forEach((edge) => {
      referenced.add(edge.source);
      referenced.add(edge.target);
    });

    return {
      ...graph,
      nodes: nodes
        .filter((node) => !shadowedTargets.has(node.id) || referenced.has(node.id))
        .concat(shadowNodes),
      edges: nextEdges,
      links: nextEdges,
      shadow_meta: {
        mode: options.mode || 'shadow',
        shadow_count: shadowNodes.length,
        shadowed_targets: Array.from(shadowedTargets).sort((a, b) => a.localeCompare(b)),
      },
    };
  };
})(globalThis.Widgets.GraphShadows);
