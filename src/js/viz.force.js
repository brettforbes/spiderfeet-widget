/**
 * Viz.ForceGraph — force-directed graph factory with layout variants.
 */
(function (global) {
  'use strict';

  global.Viz = global.Viz || {};
  const Core = global.Viz.Core;

  const VARIANTS = {
    default(simulation, width, height) {
      simulation
        .force('link', d3.forceLink().id((d) => d.id).distance(80).strength(0.8))
        .force('charge', d3.forceManyBody().strength(-220))
        .force('center', d3.forceCenter(width / 2, height / 2));
    },

    sparse(simulation, width, height) {
      simulation
        .force('link', d3.forceLink().id((d) => d.id).distance(140).strength(0.4))
        .force('charge', d3.forceManyBody().strength(-120))
        .force('center', d3.forceCenter(width / 2, height / 2));
    },

    dense(simulation, width, height) {
      simulation
        .force('link', d3.forceLink().id((d) => d.id).distance(35).strength(0.9))
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
        .force('link', d3.forceLink().id((d) => d.id).distance(50))
        .force('charge', d3.forceManyBody().strength(-250))
        .force('x', d3.forceX((d) => centres.get(d.group).x).strength(0.12))
        .force('y', d3.forceY((d) => centres.get(d.group).y).strength(0.12));
    },
  };

  function nodeCollisionRadius(d) {
    if (d.nodeDisplay === 'icons') {
      return d.iconSize ? d.iconSize / 2 : 18;
    }
    return d.r || 8;
  }

  function dragBehaviour(simulation) {
    return d3
      .drag()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
  }

  function neighbourSet(nodeId, links) {
    const set = new Set([nodeId]);
    links.forEach((l) => {
      const sid = l.source.id ?? l.source;
      const tid = l.target.id ?? l.target;
      if (sid === nodeId) set.add(tid);
      if (tid === nodeId) set.add(sid);
    });
    return set;
  }

  function nodeFill(d, colour) {
    if (d.colour) return d.colour;
    if (d.fill) return d.fill;
    return colour(d.group);
  }

  function linkStroke(l) {
    if (l.role === 'consumed') return '#64748b';
    if (l.role === 'produced') return '#0ea5e9';
    return '#999';
  }

  function linkDash(l) {
    return l.role === 'consumed' ? '4 3' : null;
  }

  function appendNodeShape(nodeSel, colour, nodeDisplay) {
    nodeSel.each(function (d) {
      const group = d3.select(this);
      group.selectAll('circle, image, rect').remove();

      if (nodeDisplay === 'icons' && d.iconUrl) {
        const size = d.iconSize || 28;
        const hitR = size / 2;
        const isService = d.group === 'service';
        if (isService) {
          const quarantineRing = Boolean(d.originRing);
          const ringColour = quarantineRing
            ? d.originColour || '#7C3AED'
            : d.fixtureColour || d.colour || '#57534E';
          const ringPad = 4;
          group
            .append('circle')
            .attr('class', 'node-icon-ring')
            .attr('r', hitR + ringPad)
            .attr('fill', '#ffffff')
            .attr('stroke', ringColour)
            .attr('stroke-width', 3)
            .attr('stroke-dasharray', quarantineRing ? '5 3' : null)
            .attr('pointer-events', 'none');
        } else {
          group
            .append('rect')
            .attr('class', 'node-icon-bg')
            .attr('width', size)
            .attr('height', size)
            .attr('rx', 4)
            .attr('x', -size / 2)
            .attr('y', -size / 2)
            .attr('fill', d.colour || '#3B82F6')
            .attr('pointer-events', 'none');
        }
        group
          .append('circle')
          .attr('class', 'node-hit')
          .attr('r', isService ? hitR + 4 : hitR)
          .attr('fill', 'rgba(0,0,0,0.001)')
          .attr('stroke', 'none');
        const image = group
          .append('image')
          .attr('class', 'node-icon')
          .attr('href', d.iconUrl)
          .attr('width', size)
          .attr('height', size)
          .attr('x', -size / 2)
          .attr('y', -size / 2)
          .attr('pointer-events', 'none');
        if (d.iconFallbackUrl) {
          image.on('error', function () {
            const el = d3.select(this);
            if (el.attr('href') !== d.iconFallbackUrl) {
              el.attr('href', d.iconFallbackUrl);
            }
          });
        }
        return;
      }

      const circle = group
        .append('circle')
        .attr('class', 'node-circle node-hit')
        .attr('r', d.r || 8)
        .attr('fill', nodeFill(d, colour));
      if (d.group === 'service') {
        const quarantineRing = Boolean(d.originRing);
        const ringColour = quarantineRing
          ? d.originColour || '#7C3AED'
          : d.fixtureColour || d.colour || '#57534E';
        circle
          .attr('stroke', ringColour)
          .attr('stroke-width', 2.5)
          .attr('stroke-dasharray', quarantineRing ? '5 3' : null);
      }
    });
  }

  const ForceGraph = {
    variants: Object.keys(VARIANTS),

    create(options) {
      const {
        svg: svgSelector,
        tooltip: tooltipSelector,
        nodes: rawNodes,
        links: rawLinks,
        variant = 'default',
        nodeDisplay = 'circles',
        onNodeClick,
        onNodeHover,
      } = options;

      const svgEl = document.querySelector(svgSelector);
      const { width, height } = Core.dimensions(svgEl);
      const svg = Core.selectSvg(svgEl);
      Core.clear(svg);
      svg
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');

      const { nodes, links } = Core.cloneGraph({ nodes: rawNodes, links: rawLinks });
      nodes.forEach((n) => {
        n.nodeDisplay = nodeDisplay;
      });
      const groups = [...new Set(nodes.map((n) => n.group))];
      const colour = Core.colourByGroup(groups);

      const rootG = svg.append('g').attr('class', 'graph-root');
      const zoom = d3
        .zoom()
        .scaleExtent([0.2, 8])
        .on('zoom', (event) => rootG.attr('transform', event.transform));
      svg.call(zoom);

      const simulation = d3.forceSimulation(nodes);
      const applyVariant = VARIANTS[variant] || VARIANTS.default;
      applyVariant(simulation, width, height, nodes);
      simulation.force('link').links(links);

      const link = rootG
        .append('g')
        .attr('class', 'links')
        .selectAll('line')
        .data(links)
        .join('line')
        .attr('class', 'link')
        .attr('stroke', linkStroke)
        .attr('stroke-dasharray', linkDash)
        .attr('stroke-width', 1.5);

      const node = rootG
        .append('g')
        .attr('class', 'nodes')
        .selectAll('g')
        .data(nodes)
        .join('g')
        .attr('class', (d) => `node node-${d.group}`)
        .call(dragBehaviour(simulation));

      appendNodeShape(node, colour, nodeDisplay);

      const tooltipEl = tooltipSelector
        ? document.querySelector(tooltipSelector)
        : null;

      function resetHighlight() {
        node.classed('dimmed', false);
        link.classed('dimmed', false);
      }

      node
        .on('mouseover', (event, d) => {
          const adj = neighbourSet(d.id, links);
          node.classed('dimmed', (n) => !adj.has(n.id));
          link.classed('dimmed', (l) => {
            const sid = l.source.id ?? l.source;
            const tid = l.target.id ?? l.target;
            return !(sid === d.id || tid === d.id);
          });
          if (tooltipEl) {
            tooltipEl.hidden = false;
            const meta = d.meta || {};
            tooltipEl.innerHTML = [
              `<strong>${d.label || d.id}</strong>`,
              `kind: ${d.group}`,
              meta.fixture_category ? `fixture: ${meta.fixture_category}` : null,
              meta.service_origin ? `origin: ${meta.service_origin}` : null,
              meta.service_state ? `state: ${meta.service_state}` : null,
            ]
              .filter(Boolean)
              .join('<br/>');
          }
          onNodeHover?.(event, d);
        })
        .on('mousemove', (event) => {
          if (!tooltipEl) return;
          const stage = svgEl.parentElement;
          const bounds = stage.getBoundingClientRect();
          tooltipEl.style.left = `${event.clientX - bounds.left + 12}px`;
          tooltipEl.style.top = `${event.clientY - bounds.top + 12}px`;
        })
        .on('mouseout', () => {
          resetHighlight();
          if (tooltipEl) tooltipEl.hidden = true;
        })
        .on('click', (event, d) => onNodeClick?.(event, d));

      simulation.on('tick', () => {
        link
          .attr('x1', (d) => d.source.x)
          .attr('y1', (d) => d.source.y)
          .attr('x2', (d) => d.target.x)
          .attr('y2', (d) => d.target.y);
        node.attr('transform', (d) => `translate(${d.x},${d.y})`);
      });

      const disconnectResize = Core.observeResize(svgEl.parentElement, () => {
        const dims = Core.dimensions(svgEl);
        svg.attr('viewBox', `0 0 ${dims.width} ${dims.height}`);
        simulation.force('center', d3.forceCenter(dims.width / 2, dims.height / 2));
        simulation.alpha(0.3).restart();
      });

      return {
        simulation,
        restart() {
          simulation.alpha(1).restart();
        },
        destroy() {
          simulation.stop();
          disconnectResize();
          svg.on('.zoom', null);
          Core.clear(svg);
        },
      };
    },
  };

  global.Viz.ForceGraph = ForceGraph;
})(typeof window !== 'undefined' ? window : globalThis);
