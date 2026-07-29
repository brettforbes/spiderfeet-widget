#!/usr/bin/env node
/**
 * AD1 verification: GraphShadows.apply O(n) fix — semantic identity + timing.
 * Usage: node scripts/verify-graph-shadows-ad1.js [fixture.json]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const fixturePath =
  process.argv[2] ||
  path.resolve(
    __dirname,
    '../../spiderfeet/.docs/docs-for-cli-tools/nugget_structure/katana_from_httpx_upside_com_proposed_nuggets_edges.json'
  );

function loadApply(source) {
  const sandbox = { globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.Widgets.GraphShadows.apply;
}

const NEW_SRC = fs.readFileSync(path.join(__dirname, '../src/js/graph-shadows.js'), 'utf8');

const OLD_SRC = NEW_SRC.replace(
  /\/\/ Index edges by source once[\s\S]*?shadowPairs\.forEach\(\(\{ originalId, shadowId \}\) => \{[\s\S]*?\}\);\n/,
  `shadowPairs.forEach(({ originalId, shadowId }) => {
      edges.forEach((edge) => {
        if (edge.source !== originalId) return;
        nextEdges.push({
          ...edge,
          id: \`\${edge.id}::shadow-source::\${shadowId}\`,
          source: shadowId,
          shadow_of: originalId,
        });
      });
    });
`
);

function shouldShadowTarget(target) {
  const kind = String(target.kind || target.nugget_type || '').toUpperCase();
  return kind === 'DESCRIPTOR' || target.is_descriptor === true;
}

function signature(result) {
  const nodeIds = result.nodes.map((n) => n.id).sort();
  const edgeKeys = result.edges
    .map((e) => `${e.id}|${e.source}|${e.target}|${e.relation || e.role || e.name || ''}`)
    .sort();
  return { nodeIds, edgeKeys, shadow_count: result.shadow_meta.shadow_count };
}

const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const graph = {
  nodes: raw.nodes || [],
  edges: raw.edges || raw.links || [],
};
const options = {
  mode: 'descriptors',
  edgeRoles: ['had', 'has_this'],
  shouldShadowTarget,
};

console.log('fixture:', fixturePath);
console.log('input nodes:', graph.nodes.length, 'edges:', graph.edges.length);

const applyOld = loadApply(OLD_SRC);
const applyNew = loadApply(NEW_SRC);

const tOld0 = Date.now();
const oldResult = applyOld(graph, options);
const tOld = Date.now() - tOld0;

const tNew0 = Date.now();
const newResult = applyNew(graph, options);
const tNew = Date.now() - tNew0;

const sigOld = signature(oldResult);
const sigNew = signature(newResult);

const nodesMatch =
  sigOld.nodeIds.length === sigNew.nodeIds.length &&
  sigOld.nodeIds.every((id, i) => id === sigNew.nodeIds[i]);
const edgesMatch =
  sigOld.edgeKeys.length === sigNew.edgeKeys.length &&
  sigOld.edgeKeys.every((k, i) => k === sigNew.edgeKeys[i]);

console.log('old timing ms:', tOld);
console.log('new timing ms:', tNew);
console.log('shadow_count:', sigNew.shadow_count);
console.log('output nodes:', newResult.nodes.length, 'edges:', newResult.edges.length);
console.log('node id sets identical:', nodesMatch);
console.log('edge id/source/target/relation sets identical:', edgesMatch);

if (!nodesMatch || !edgesMatch) {
  const missingNodes = sigOld.nodeIds.filter((id) => !sigNew.nodeIds.includes(id));
  const extraNodes = sigNew.nodeIds.filter((id) => !sigOld.nodeIds.includes(id));
  console.error('MISMATCH nodes missing:', missingNodes.length, 'extra:', extraNodes.length);
  process.exit(1);
}

console.log('AD1 VERIFY PASS');
