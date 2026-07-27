window.Widgets = window.Widgets || {};
window.Widgets.Markdown = window.Widgets.Markdown || {};

/**
 * Minimal, dependency-free Markdown -> HTML renderer.
 *
 * Scope is intentionally small: it covers the constructs used by the CLI
 * profiling "Structure doc" artifacts (nugget_graph_structure.md): headings,
 * paragraphs, fenced code blocks, Mermaid flowcharts, inline code, bold/italic,
 * links, blockquotes, ordered/unordered lists, GitHub-style tables, and
 * horizontal rules.
 *
 * Output is escaped before formatting so raw markdown can never inject markup.
 * Mermaid blocks are extracted before HTML conversion so arrow tokens like
 * `-->` never pass through innerHTML.
 */
(function (Markdown) {
  'use strict';

  const MERMAID_FENCE_RE = /```mermaid\r?\n([\s\S]*?)```/g;

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Inline formatting on already-escaped text.
  function inline(text) {
    let out = text;
    const codeStore = [];
    out = out.replace(/`([^`]+)`/g, (_m, code) => {
      codeStore.push(code);
      return `\u0000CODE${codeStore.length - 1}\u0000`;
    });
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => {
      const safe = /^(https?:|mailto:|#|\/)/i.test(url) ? url : '#';
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    out = out.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
    out = out.replace(/\u0000CODE(\d+)\u0000/g, (_m, i) => `<code>${codeStore[Number(i)]}</code>`);
    return out;
  }

  function renderTable(rows) {
    const splitCells = (line) =>
      line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());

    const header = splitCells(rows[0]);
    const body = rows.slice(2).map(splitCells);
    let html = '<table><thead><tr>';
    header.forEach((c) => {
      html += `<th>${inline(c)}</th>`;
    });
    html += '</tr></thead><tbody>';
    body.forEach((cells) => {
      html += '<tr>';
      cells.forEach((c) => {
        html += `<td>${inline(c)}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function isTableSeparator(line) {
    return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
  }

  let mermaidInitialized = false;
  let mermaidRenderCounter = 0;
  let mermaidLoadPromise = null;

  const MERMAID_SLOT_LINE_RE = /^@@MERMAID-DIAGRAM-(\d+)@@$/;

  function mermaidSlotToken(index) {
    return `@@MERMAID-DIAGRAM-${index}@@`;
  }

  function mermaidSlotMarkup(index) {
    return `<div class="profiling-mermaid-slot" data-mermaid-index="${index}"></div>`;
  }

  function isMermaidSlotLine(line) {
    return MERMAID_SLOT_LINE_RE.test(String(line).trim());
  }

  Markdown.prepare = function (markdown) {
    const blocks = [];
    const stripped = String(markdown || '').replace(MERMAID_FENCE_RE, (_match, source) => {
      const index = blocks.length;
      blocks.push(String(source).trim());
      return `\n\n${mermaidSlotToken(index)}\n\n`;
    });
    return { stripped, blocks };
  };

  Markdown.hydrateMermaidSlots = function (container) {
    if (!container) return;
    container.querySelectorAll('.profiling-mermaid-slot').forEach((slot) => {
      const host = document.createElement('div');
      host.className = 'profiling-mermaid-preview';
      host.dataset.mermaidIndex = slot.dataset.mermaidIndex || '';
      slot.replaceWith(host);
    });
  };

  Markdown.ensureMermaid = function () {
    if (globalThis.mermaid?.render) {
      return Promise.resolve(globalThis.mermaid);
    }
    if (mermaidLoadPromise) {
      return mermaidLoadPromise;
    }

    mermaidLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-mermaid-loader]');
      if (existing) {
        existing.addEventListener('load', () => resolve(globalThis.mermaid), { once: true });
        existing.addEventListener('error', () => reject(new Error('Failed to load Mermaid')), {
          once: true,
        });
        return;
      }

      const script = document.createElement('script');
      script.src = './mermaid.min.js';
      script.dataset.mermaidLoader = 'true';
      script.addEventListener(
        'load',
        () => {
          if (globalThis.mermaid?.render) {
            resolve(globalThis.mermaid);
            return;
          }
          reject(new Error('Mermaid loaded but globalThis.mermaid.render is unavailable'));
        },
        { once: true }
      );
      script.addEventListener('error', () => reject(new Error('Failed to load mermaid.min.js')), {
        once: true,
      });
      document.head.appendChild(script);
    });

    return mermaidLoadPromise;
  };

  Markdown.renderMermaid = async function (container, blocks) {
    if (!container || !blocks?.length) return;

    const hosts = container.querySelectorAll(
      '.profiling-mermaid-preview:not([data-mermaid-rendered])'
    );
    if (!hosts.length) return;

    let mermaid;
    try {
      mermaid = await Markdown.ensureMermaid();
    } catch (err) {
      console.error('Mermaid unavailable', err);
      hosts.forEach((host) => {
        const source = blocks[Number(host.dataset.mermaidIndex)] || '';
        host.innerHTML = `<pre class="mermaid-fallback"><code class="language-mermaid">${escapeHtml(source)}</code></pre>`;
      });
      return;
    }

    const theme =
      document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'default';

    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme,
        securityLevel: 'loose',
        flowchart: { useMaxWidth: true, htmlLabels: false },
      });
      mermaidInitialized = true;
    }

    for (const host of hosts) {
      const source = blocks[Number(host.dataset.mermaidIndex)];
      if (!source) continue;

      const renderId = `profiling-mermaid-${Date.now()}-${mermaidRenderCounter++}`;
      try {
        const result = await mermaid.render(renderId, source);
        host.innerHTML = result.svg;
        result.bindFunctions?.(host);
        host.setAttribute('data-mermaid-rendered', 'true');
      } catch (err) {
        console.error('Mermaid render failed', err);
        host.innerHTML = `<pre class="mermaid-fallback"><code class="language-mermaid">${escapeHtml(source)}</code></pre>`;
        host.setAttribute('data-mermaid-rendered', 'error');
      }
    }
  };

  Markdown.renderDocument = async function (container, markdown, emptyMessage) {
    if (!container) return;
    if (!markdown) {
      container.innerHTML = `<p class="text-body-secondary">${emptyMessage}</p>`;
      return;
    }

    const { stripped, blocks } = Markdown.prepare(markdown);
    container.innerHTML = Markdown.render(stripped);
    Markdown.hydrateMermaidSlots(container);
    await Markdown.renderMermaid(container, blocks);
  };

  Markdown.render = function (markdown) {
    if (!markdown) return '';
    const normalized = markdown.replace(/\r\n/g, '\n');
    const originalLines = normalized.split('\n');
    const escaped = escapeHtml(normalized);
    const lines = escaped.split('\n');
    const html = [];
    let i = 0;
    let listType = null;

    const closeList = () => {
      if (listType) {
        html.push(`</${listType}>`);
        listType = null;
      }
    };

    while (i < lines.length) {
      const line = lines[i];

      const fence = line.match(/^\s*```(.*)$/);
      if (fence) {
        closeList();
        const lang = fence[1].trim();
        const rawBuf = [];
        i += 1;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
          rawBuf.push(originalLines[i] || '');
          i += 1;
        }
        i += 1;
        const cls = lang ? ` class="language-${lang}"` : '';
        html.push(`<pre><code${cls}>${escapeHtml(rawBuf.join('\n'))}</code></pre>`);
        continue;
      }

      if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        closeList();
        const rows = [line, lines[i + 1]];
        i += 2;
        while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
          rows.push(lines[i]);
          i += 1;
        }
        html.push(renderTable(rows));
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        closeList();
        const level = heading[1].length;
        html.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
        i += 1;
        continue;
      }

      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
        closeList();
        html.push('<hr />');
        i += 1;
        continue;
      }

      if (/^\s*>\s?/.test(line)) {
        closeList();
        const buf = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s*>\s?/, ''));
          i += 1;
        }
        html.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
        continue;
      }

      const ul = line.match(/^\s*[-*+]\s+(.*)$/);
      if (ul) {
        if (listType !== 'ul') {
          closeList();
          html.push('<ul>');
          listType = 'ul';
        }
        html.push(`<li>${inline(ul[1].trim())}</li>`);
        i += 1;
        continue;
      }

      const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ol) {
        if (listType !== 'ol') {
          closeList();
          html.push('<ol>');
          listType = 'ol';
        }
        html.push(`<li>${inline(ol[1].trim())}</li>`);
        i += 1;
        continue;
      }

      if (line.trim() === '') {
        closeList();
        i += 1;
        continue;
      }

      const mermaidSlot = line.trim().match(MERMAID_SLOT_LINE_RE);
      if (mermaidSlot) {
        closeList();
        html.push(mermaidSlotMarkup(Number(mermaidSlot[1])));
        i += 1;
        continue;
      }

      closeList();
      const buf = [line];
      i += 1;
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !/^\s*```/.test(lines[i]) &&
        !/^(#{1,6})\s+/.test(lines[i]) &&
        !/^\s*[-*+]\s+/.test(lines[i]) &&
        !/^\s*\d+[.)]\s+/.test(lines[i]) &&
        !/^\s*>\s?/.test(lines[i]) &&
        !isMermaidSlotLine(lines[i])
      ) {
        buf.push(lines[i]);
        i += 1;
      }
      html.push(`<p>${inline(buf.join(' '))}</p>`);
    }

    closeList();
    return html.join('\n');
  };
})(window.Widgets.Markdown);
