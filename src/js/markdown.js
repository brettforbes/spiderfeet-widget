window.Widgets = window.Widgets || {};
window.Widgets.Markdown = window.Widgets.Markdown || {};

/**
 * Minimal, dependency-free Markdown -> HTML renderer.
 *
 * Scope is intentionally small: it covers the constructs used by the CLI
 * profiling "Structure doc" artifacts (nugget_graph_structure.md): headings,
 * paragraphs, fenced code blocks, inline code, bold/italic, links, blockquotes,
 * ordered/unordered lists, GitHub-style tables, and horizontal rules.
 *
 * Output is escaped before formatting so raw markdown can never inject markup.
 */
(function (Markdown) {
  'use strict';

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
    // inline code first so its contents are not further formatted
    const codeStore = [];
    out = out.replace(/`([^`]+)`/g, (_m, code) => {
      codeStore.push(code);
      return `\u0000CODE${codeStore.length - 1}\u0000`;
    });
    // links [text](url)
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => {
      const safe = /^(https?:|mailto:|#|\/)/i.test(url) ? url : '#';
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    // bold then italic
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    out = out.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
    // restore inline code
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

  Markdown.render = function (markdown) {
    if (!markdown) return '';
    const escaped = escapeHtml(markdown.replace(/\r\n/g, '\n'));
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

      // fenced code block
      const fence = line.match(/^\s*```(.*)$/);
      if (fence) {
        closeList();
        const lang = fence[1].trim();
        const buf = [];
        i += 1;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
          buf.push(lines[i]);
          i += 1;
        }
        i += 1; // skip closing fence
        const cls = lang ? ` class="language-${lang}"` : '';
        html.push(`<pre><code${cls}>${buf.join('\n')}</code></pre>`);
        continue;
      }

      // table
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

      // headings
      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        closeList();
        const level = heading[1].length;
        html.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
        i += 1;
        continue;
      }

      // horizontal rule
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
        closeList();
        html.push('<hr />');
        i += 1;
        continue;
      }

      // blockquote
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

      // unordered list
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

      // ordered list
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

      // blank line
      if (line.trim() === '') {
        closeList();
        i += 1;
        continue;
      }

      // paragraph (gather consecutive non-empty, non-special lines)
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
        !/^\s*>\s?/.test(lines[i])
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
