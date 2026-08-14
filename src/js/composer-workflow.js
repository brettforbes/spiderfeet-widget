window.Widgets = window.Widgets || {};
window.Widgets.ComposerWorkflow = window.Widgets.ComposerWorkflow || {};

/**
 * SPEC-011 AS1–AS3 / AT1 / AU1 / R11-09–R11-12 / R11-14 — Collapsing left host
 * for yaml-workflow-widget iframe + HOST_PROTOCOL handshake (ready → setTheme +
 * setYaml; yamlChanged / validationResult / stepSelected) + bidirectional
 * theme sync (Widgets.Theme ↔ setTheme / themeChanged) + CliScanApp option →
 * step config.argv → setYaml round-trip.
 *
 * Width states (Composer.setLeftState): collapsed (0) | partial (≈3, default) | full (12).
 * - partial / collapsed: `?embed=1` (diagram-only)
 * - full: no embed param (YAML code + diagram)
 */
(function (ComposerWorkflow, Widgets, document, window) {
  'use strict';

  ComposerWorkflow.DEFAULT_BASE_URL = 'http://localhost:4009';
  ComposerWorkflow.FRAME_ID = 'composer-workflow-iframe';
  ComposerWorkflow.SLOT_ID = 'composer-yaml-slot';
  ComposerWorkflow.PROTOCOL_VERSION = '1.0.0';

  /** Subset of yaml-workflow-widget HOST_MSG used by the Composer host. */
  ComposerWorkflow.HOST_MSG = {
    SET_YAML: 'setYaml',
    SET_THEME: 'setTheme',
    SELECT_STEP: 'selectStep',
    SET_EDIT_MODE: 'setEditMode',
    OPEN_SETTINGS: 'openSettings',
    RESET_VIEW: 'resetView',
    SET_STEP_STATUSES: 'setStepStatuses',
  };

  /**
   * Canonical-ish default when no project workflow YAML is loaded yet.
   * Shape matches yaml-workflow-widget `12A2_Workflow_YAML_Example.yaml`.
   */
  ComposerWorkflow.DEFAULT_WORKFLOW_YAML = [
    'apiVersion: spiderfeet.workflow/v1',
    'kind: Workflow',
    'id: workflow--composer-default',
    '',
    'info:',
    '  name: Composer default',
    '  description: >',
    '    Default workflow loaded into the Composer YAML editor (SPEC-011 AS2).',
    '  author: SpiderFeet',
    '',
    'steps:',
    '  - id: sfp_cli_netdiscover',
    '    uses: tool.netdiscover',
    '    needs: []',
    '    input:',
    '      type: none',
    '    config:',
    '      argv:',
    '        - "-P"',
    '        - "$step.files.output"',
    '      files:',
    '        output:',
    '          mode: auto',
    '          format: line_text',
    '      capture:',
    '        family: structured_native',
    '        adapter: netdiscover',
    '    output:',
    '      vars: none',
    '    context:',
    '      export: scan_graph',
    '',
  ].join('\n');

  /** @type {HTMLIFrameElement|null} */
  ComposerWorkflow._iframe = null;
  /** @type {'collapsed'|'partial'|'full'|null} */
  ComposerWorkflow._mode = null;
  /** @type {boolean} */
  ComposerWorkflow._ready = false;
  /** @type {string|null} */
  ComposerWorkflow._protocolVersion = null;
  /** @type {string} */
  ComposerWorkflow._yaml = ComposerWorkflow.DEFAULT_WORKFLOW_YAML;
  /** @type {{ ok: boolean, diagnostics?: Array }|null} */
  ComposerWorkflow._lastValidation = null;
  /** @type {boolean} */
  ComposerWorkflow._listening = false;
  /** @type {boolean} */
  ComposerWorkflow._themeListening = false;
  /** @type {string|null} */
  ComposerWorkflow._expectedOrigin = null;
  /** @type {'light'|'dark'|null} last theme pushed to (or accepted from) the iframe */
  ComposerWorkflow._syncedTheme = null;
  /** R13-17 — host Workflow Bar edit state (mirrored from iframe). */
  ComposerWorkflow._editing = false;
  ComposerWorkflow._chromeBound = false;

  ComposerWorkflow.defaultBaseUrl = function () {
    const root = document.getElementById('widget-root');
    const fromDom = root?.dataset?.yamlWorkflowUrl;
    if (fromDom && String(fromDom).trim()) {
      return String(fromDom).trim().replace(/\/$/, '');
    }
    return ComposerWorkflow.DEFAULT_BASE_URL;
  };

  ComposerWorkflow._widgetOrigin = function () {
    try {
      return new URL(ComposerWorkflow.defaultBaseUrl()).origin;
    } catch (_err) {
      return null;
    }
  };

  /**
   * Build iframe URL for a left-column width state.
   * @param {'collapsed'|'partial'|'full'} state
   * @returns {string}
   */
  ComposerWorkflow.urlForState = function (state) {
    const base = ComposerWorkflow.defaultBaseUrl();
    // Full column shows code + diagram; collapsed keeps last diagram URL in DOM.
    if (state === 'full') {
      return `${base}/`;
    }
    return `${base}/?embed=1`;
  };

  /**
   * Whether state needs the embed (viz-only) URL vs full editor URL.
   * Collapsed keeps the previous mode's document so postMessage still works.
   * @param {'collapsed'|'partial'|'full'} state
   * @returns {'embed'|'full'}
   */
  ComposerWorkflow._urlModeForState = function (state) {
    if (state === 'full') return 'full';
    return 'embed';
  };

  ComposerWorkflow.getIframe = function () {
    return ComposerWorkflow._iframe || document.getElementById(ComposerWorkflow.FRAME_ID);
  };

  ComposerWorkflow.isReady = function () {
    return !!ComposerWorkflow._ready;
  };

  ComposerWorkflow.getWorkflowYaml = function () {
    return ComposerWorkflow._yaml;
  };

  ComposerWorkflow.getLastValidation = function () {
    return ComposerWorkflow._lastValidation;
  };

  /**
   * Ask the editor to select a step node (host → iframe).
   * @param {string} stepId
   * @returns {boolean}
   */
  ComposerWorkflow.selectStep = function (stepId) {
    if (!stepId || typeof stepId !== 'string') return false;
    return ComposerWorkflow.postToWidget('selectStep', { stepId });
  };

  /**
   * Lightweight parse of workflow `steps[]` for id + uses + needs (AT1 / SPEC-015).
   * Avoids a YAML dependency; enough for SpiderFeet workflow step lists.
   * @param {string} [yaml]
   * @returns {Array<{ id: string, uses: string|null, needs: string[] }>}
   */
  ComposerWorkflow.parseWorkflowSteps = function (yaml) {
    const steps = [];
    const lines = String(yaml ?? '').split(/\r?\n/);
    let inSteps = false;
    /** @type {{ id: string, uses: string|null, needs: string[], _inNeedsList?: boolean }|null} */
    let current = null;

    const stripScalar = (raw) =>
      String(raw || '')
        .trim()
        .replace(/^['"]|['"]$/g, '');

    const splitInlineList = (inner) =>
      String(inner || '')
        .split(',')
        .map((part) => stripScalar(part))
        .filter(Boolean);

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^steps:\s*(?:#.*)?$/.test(line)) {
        inSteps = true;
        continue;
      }
      // Leave steps on the next top-level mapping key. Do NOT treat column-0
      // sequence items (`- id: …`) as leaving — TypeDB-stored / dump-style YAML
      // often writes the steps list unindented under `steps:`.
      if (
        inSteps &&
        line.length &&
        !/^\s/.test(line) &&
        !/^#/.test(line) &&
        !/^-/.test(line)
      ) {
        break;
      }
      if (!inSteps) continue;

      const idMatch = line.match(/^\s*-\s*id:\s*(.+?)\s*(?:#.*)?$/);
      if (idMatch) {
        if (current) {
          delete current._inNeedsList;
          steps.push(current);
        }
        current = { id: stripScalar(idMatch[1]), uses: null, needs: [] };
        continue;
      }
      if (!current) continue;

      if (current._inNeedsList) {
        const needItem = line.match(/^\s+-\s+(.+?)\s*(?:#.*)?$/);
        if (needItem) {
          current.needs.push(stripScalar(needItem[1]));
          continue;
        }
        // Left the needs list (next key or next step item).
        current._inNeedsList = false;
      }

      // `uses` may be indented under the step or (rarely) flush left after `- id`.
      const usesMatch = line.match(/^\s*uses:\s*(.+?)\s*(?:#.*)?$/);
      if (usesMatch) {
        current.uses = stripScalar(usesMatch[1]);
        continue;
      }

      const needsInline = line.match(/^\s*needs:\s*\[(.*)\]\s*(?:#.*)?$/);
      if (needsInline) {
        current.needs = splitInlineList(needsInline[1]);
        current._inNeedsList = false;
        continue;
      }
      if (/^\s*needs:\s*(?:#.*)?$/.test(line)) {
        current.needs = [];
        current._inNeedsList = true;
      }
    }
    if (current) {
      delete current._inNeedsList;
      steps.push(current);
    }
    return steps;
  };

  /**
   * Map `uses: tool.<id>` (or bare tool id) to CliScanApp toolId.
   * @param {string|null|undefined} uses
   * @returns {string|null}
   */
  ComposerWorkflow.toolIdFromUses = function (uses) {
    if (!uses || typeof uses !== 'string') return null;
    const trimmed = uses.trim();
    if (!trimmed) return null;
    const m = trimmed.match(/^tool\.(.+)$/i);
    return m ? m[1] : trimmed;
  };

  /**
   * Classify a diagram stepId from yaml-workflow-widget (R11-12 special ids).
   * @param {string} stepId
   * @returns {{
   *   kind: 'empty'|'special'|'subtask'|'step',
   *   stepId: string,
   *   parentId?: string,
   *   subtask?: string,
   *   label: string
   * }}
   */
  ComposerWorkflow.classifyStepId = function (stepId) {
    if (!stepId || typeof stepId !== 'string') {
      return { kind: 'empty', stepId: '', label: 'No step selected' };
    }
    const id = stepId.trim();
    if (!id) {
      return { kind: 'empty', stepId: '', label: 'No step selected' };
    }
    if (id.startsWith('__')) {
      const labels = {
        __workflow_start__: 'Workflow start',
        __workflow_target__: 'Workflow target',
        __workflow_end__: 'Workflow end',
      };
      let label = labels[id];
      if (!label && id.startsWith('__ctxcol_')) {
        label = 'Context collector';
      }
      if (!label) label = 'Workflow chrome node';
      return { kind: 'special', stepId: id, label };
    }
    const sub = id.match(/^(.*)__(input|config|context|output)$/);
    if (sub) {
      return {
        kind: 'subtask',
        stepId: id,
        parentId: sub[1],
        subtask: sub[2],
        label: `${sub[1]} · ${sub[2]}`,
      };
    }
    return { kind: 'step', stepId: id, label: id };
  };

  /**
   * Resolve stepSelected → tool binding from current workflow YAML.
   * @param {string} stepId
   * @param {string} [yaml]
   * @returns {{
   *   classified: ReturnType<typeof ComposerWorkflow.classifyStepId>,
   *   step: { id: string, uses: string|null }|null,
   *   toolId: string|null,
   *   openTool: boolean
   * }}
   */
  /**
   * @param {string} stepId
   * @param {string} [yaml]
   * @param {{ uses?: string|null, toolId?: string|null }} [hints] from diagram node when host YAML parse lags
   */
  ComposerWorkflow.resolveStepSelection = function (stepId, yaml, hints) {
    const classified = ComposerWorkflow.classifyStepId(stepId);
    if (classified.kind === 'empty' || classified.kind === 'special') {
      return { classified, step: null, toolId: null, openTool: false };
    }
    const lookupId = classified.kind === 'subtask' ? classified.parentId : classified.stepId;
    const steps = ComposerWorkflow.parseWorkflowSteps(
      yaml != null ? yaml : ComposerWorkflow.getWorkflowYaml()
    );
    let step = steps.find((s) => s.id === lookupId) || null;
    let toolId = step ? ComposerWorkflow.toolIdFromUses(step.uses) : null;
    // Diagram node already carries uses — prefer when YAML parse missed the step.
    if (!toolId && hints) {
      const fromHint =
        ComposerWorkflow.toolIdFromUses(hints.uses) ||
        (typeof hints.toolId === 'string' && hints.toolId.trim()
          ? hints.toolId.trim()
          : null);
      if (fromHint) {
        toolId = fromHint;
        if (!step) {
          step = {
            id: lookupId,
            uses: hints.uses || `tool.${fromHint}`,
          };
        } else if (!step.uses && hints.uses) {
          step = Object.assign({}, step, { uses: hints.uses });
        }
      }
    }
    return {
      classified,
      step,
      toolId,
      openTool: !!(toolId && step),
    };
  };

  /**
   * Resolve the workflow step id that owns config.argv (parent for subtasks).
   * @param {string} stepId
   * @returns {string}
   */
  ComposerWorkflow.argvOwnerStepId = function (stepId) {
    const classified = ComposerWorkflow.classifyStepId(stepId);
    if (classified.kind === 'subtask') return classified.parentId || '';
    if (classified.kind === 'step') return classified.stepId || '';
    return '';
  };

  /**
   * Unquote a YAML scalar (simple single/double quotes).
   * @param {string} raw
   * @returns {string}
   */
  ComposerWorkflow._unquoteYamlScalar = function (raw) {
    const s = String(raw ?? '').trim();
    if (
      (s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))
    ) {
      try {
        if (s.startsWith('"')) return JSON.parse(s);
      } catch (_err) {
        /* fall through */
      }
      return s.slice(1, -1);
    }
    return s;
  };

  /**
   * Format one argv list item for workflow YAML.
   * @param {string} token
   * @param {string} itemIndent whitespace before `- `
   * @returns {string}
   */
  ComposerWorkflow._formatArgvYamlItem = function (token, itemIndent) {
    return `${itemIndent}- ${JSON.stringify(String(token))}`;
  };

  /**
   * Locate the `argv:` block for a step id inside workflow YAML.
   * @param {string} yaml
   * @param {string} stepId
   * @returns {{
   *   argv: string[],
   *   argvLineIndex: number,
   *   listStart: number,
   *   listEnd: number,
   *   itemIndent: string,
   *   lines: string[]
   * }|null}
   */
  ComposerWorkflow._locateStepArgvBlock = function (yaml, stepId) {
    if (!stepId || typeof stepId !== 'string') return null;
    const lines = String(yaml ?? '').split(/\r?\n/);
    let inSteps = false;
    let inStep = false;
    let stepIndent = '';
    let argvLineIndex = -1;
    let argvIndent = '';

    const idRe = new RegExp(
      `^(\\s*)-\\s*id:\\s*${stepId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:#.*)?$`
    );

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^steps:\s*(?:#.*)?$/.test(line)) {
        inSteps = true;
        inStep = false;
        continue;
      }
      // Allow column-0 `- id:` list items (TypeDB dump style).
      if (
        inSteps &&
        line.length &&
        !/^\s/.test(line) &&
        !/^#/.test(line) &&
        !/^-/.test(line)
      ) {
        break;
      }
      if (!inSteps) continue;

      const idMatch = line.match(idRe);
      if (idMatch) {
        inStep = true;
        stepIndent = idMatch[1] || '';
        argvLineIndex = -1;
        continue;
      }

      if (!inStep) continue;

      // Next step at same list indent ends this step.
      if (new RegExp(`^${stepIndent}-\\s*id:\\s*`).test(line)) {
        break;
      }

      const argvMatch = line.match(/^(\s*)argv:\s*(?:#.*)?$/);
      if (argvMatch) {
        argvLineIndex = i;
        argvIndent = argvMatch[1] || '';
        break;
      }
    }

    if (argvLineIndex < 0) return null;

    const listStart = argvLineIndex + 1;
    let listEnd = listStart;
    const argv = [];
    // Workflow YAML often uses same-indent sequences:
    //   argv:
    //   - -dL
    // not the nested form `argv:\n      - -dL`.
    let itemIndent = `${argvIndent}  `;

    for (let j = listStart; j < lines.length; j += 1) {
      const line = lines[j];
      if (!line.trim() || /^\s*#/.test(line)) {
        listEnd = j + 1;
        continue;
      }
      const itemMatch = line.match(/^(\s*)-\s+(.+?)\s*(?:#.*)?$/);
      if (itemMatch) {
        const ind = itemMatch[1] || '';
        if (ind.length < argvIndent.length) break;
        if (argv.length === 0) itemIndent = ind;
        argv.push(ComposerWorkflow._unquoteYamlScalar(itemMatch[2]));
        listEnd = j + 1;
        continue;
      }
      // Sibling key under config (e.g. `files:`) — end of argv list.
      const keyIndent = (line.match(/^(\s*)\S/) || [])[1];
      if (keyIndent != null && keyIndent.length <= argvIndent.length) break;
      break;
    }

    return {
      argv,
      argvLineIndex,
      listStart,
      listEnd,
      itemIndent,
      lines,
    };
  };

  /**
   * Read `config.argv` for a workflow step (lightweight, no YAML lib).
   * @param {string} [yaml]
   * @param {string} stepId
   * @returns {string[]}
   */
  ComposerWorkflow.parseStepArgv = function (yaml, stepId) {
    const block = ComposerWorkflow._locateStepArgvBlock(
      yaml != null ? yaml : ComposerWorkflow.getWorkflowYaml(),
      stepId
    );
    return block ? block.argv.slice() : [];
  };

  /**
   * Merge CliScanApp argv tokens with prior workflow argv.
   * - Prefer prior token order so Scan edits do not reshuffle YAML argv.
   * - Re-insert missing `$…` placeholders after their previous neighbour.
   * @param {string[]} oldArgv
   * @param {string[]} newTokens
   * @returns {string[]}
   */
  ComposerWorkflow.mergeArgvPreservingPlaceholders = function (oldArgv, newTokens) {
    const incoming = Array.isArray(newTokens) ? newTokens.map(String) : [];
    const prior = Array.isArray(oldArgv) ? oldArgv.map(String) : [];
    if (!prior.length) return incoming;

    const incomingSet = new Set(incoming);
    const result = [];
    const used = new Set();

    const takeValue = (flagIdxInIncoming) => {
      const next = incoming[flagIdxInIncoming + 1];
      if (next == null) return null;
      if (next.startsWith('-') && !next.startsWith('-$') && next.length > 1) return null;
      return next;
    };

    prior.forEach((tok, idx) => {
      if (used.has(tok) && !tok.startsWith('$')) return;
      if (tok.startsWith('-') && !tok.startsWith('-$')) {
        if (!incomingSet.has(tok)) return;
        result.push(tok);
        used.add(tok);
        const oldNext = idx + 1 < prior.length ? prior[idx + 1] : null;
        const incIdx = incoming.indexOf(tok);
        const newVal = incIdx >= 0 ? takeValue(incIdx) : null;
        if (newVal != null) {
          result.push(newVal);
          used.add(newVal);
        } else if (
          oldNext &&
          oldNext.startsWith('$') &&
          incomingSet.has(oldNext)
        ) {
          result.push(oldNext);
          used.add(oldNext);
        }
        return;
      }
      if (tok.startsWith('$')) {
        if (incomingSet.has(tok) && !used.has(tok)) {
          result.push(tok);
          used.add(tok);
        }
        return;
      }
      if (incomingSet.has(tok) && !used.has(tok)) {
        result.push(tok);
        used.add(tok);
      }
    });

    incoming.forEach((tok, idx) => {
      if (used.has(tok)) return;
      if (tok.startsWith('-') && !tok.startsWith('-$')) {
        result.push(tok);
        used.add(tok);
        const val = takeValue(idx);
        if (val != null && !used.has(val)) {
          result.push(val);
          used.add(val);
        }
        return;
      }
      if (!tok.startsWith('$')) {
        result.push(tok);
        used.add(tok);
      }
    });

    // Final placeholder rescue for any `$…` dropped above.
    prior.forEach((tok, idx) => {
      if (!tok.startsWith('$') || used.has(tok) || !incomingSet.has(tok)) return;
      const prev = idx > 0 ? prior[idx - 1] : null;
      if (prev != null) {
        const prevIdx = result.lastIndexOf(prev);
        if (prevIdx >= 0) {
          result.splice(prevIdx + 1, 0, tok);
          used.add(tok);
          return;
        }
      }
      result.push(tok);
      used.add(tok);
    });

    return result;
  };

  /**
   * Replace a step's `config.argv` list in workflow YAML text.
   * @param {string} yaml
   * @param {string} stepId
   * @param {string[]} argvTokens
   * @returns {string|null} next YAML, or null if the argv block was not found
   */
  ComposerWorkflow.patchStepArgv = function (yaml, stepId, argvTokens) {
    const block = ComposerWorkflow._locateStepArgvBlock(yaml, stepId);
    if (!block) return null;
    const tokens = Array.isArray(argvTokens) ? argvTokens.map(String) : [];
    const newList = tokens.map((t) =>
      ComposerWorkflow._formatArgvYamlItem(t, block.itemIndent)
    );
    const nextLines = block.lines
      .slice(0, block.listStart)
      .concat(newList)
      .concat(block.lines.slice(block.listEnd));
    return nextLines.join('\n');
  };

  /**
   * Apply CliScanApp option argv to a step and push via setYaml (R11-14).
   * @param {string} stepId diagram or parent step id
   * @param {string[]} argvTokens from CliScanApp.buildArgvTokens
   * @returns {{ ok: boolean, stepId?: string, argv?: string[], yaml?: string, reason?: string }}
   */
  ComposerWorkflow.applyStepOptionArgv = function (stepId, argvTokens) {
    const ownerId = ComposerWorkflow.argvOwnerStepId(stepId) || stepId;
    if (!ownerId) {
      return { ok: false, reason: 'no-step' };
    }
    const yaml = ComposerWorkflow.getWorkflowYaml() || '';
    const oldArgv = ComposerWorkflow.parseStepArgv(yaml, ownerId);
    const merged = ComposerWorkflow.mergeArgvPreservingPlaceholders(oldArgv, argvTokens || []);
    const next = ComposerWorkflow.patchStepArgv(yaml, ownerId, merged);
    if (next == null) {
      return { ok: false, stepId: ownerId, reason: 'argv-block-missing', argv: merged };
    }
    if (next === yaml) {
      return { ok: true, stepId: ownerId, argv: merged, yaml: next, unchanged: true };
    }
    ComposerWorkflow.setWorkflowYaml(next);
    return { ok: true, stepId: ownerId, argv: merged, yaml: next };
  };

  /**
   * Parse an inbound host/widget message (object or JSON string).
   * @param {unknown} raw
   * @returns {{ type: string, payload: *, requestId?: string, target?: string }|null}
   */
  ComposerWorkflow._parseMessage = function (raw) {
    let data = raw;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (_err) {
        return null;
      }
    }
    if (!data || typeof data !== 'object') return null;
    const type = data.type || data.action;
    if (!type || typeof type !== 'string') return null;
    return {
      type,
      payload: data.payload !== undefined ? data.payload : data,
      requestId: data.requestId ?? data.payload?.requestId,
      target: data.target,
    };
  };

  /**
   * Post a HOST_PROTOCOL command into the yaml-workflow-widget iframe.
   * @param {string} type
   * @param {object|string} [payload]
   * @param {string} [requestId]
   * @returns {boolean}
   */
  ComposerWorkflow.postToWidget = function (type, payload, requestId) {
    const iframe = ComposerWorkflow.getIframe();
    if (!iframe?.contentWindow) return false;
    const msg = {
      type,
      action: type,
      payload: payload === undefined ? {} : payload,
      target: 'iframe',
    };
    if (requestId) msg.requestId = requestId;
    const targetOrigin = ComposerWorkflow._expectedOrigin || '*';
    try {
      iframe.contentWindow.postMessage(msg, targetOrigin === 'null' ? '*' : targetOrigin);
      return true;
    } catch (err) {
      console.warn('ComposerWorkflow.postToWidget failed', type, err);
      return false;
    }
  };

  ComposerWorkflow._currentTheme = function () {
    if (Widgets.Theme && typeof Widgets.Theme.get === 'function') {
      const theme = Widgets.Theme.get();
      if (theme === 'dark' || theme === 'light') return theme;
    }
    const root = document.getElementById('widget-root');
    const attr = root?.getAttribute('data-bs-theme');
    if (attr === 'dark' || attr === 'light') return attr;
    return 'light';
  };

  /**
   * Normalize a theme token to light|dark.
   * @param {unknown} theme
   * @returns {'light'|'dark'|null}
   */
  ComposerWorkflow._normalizeTheme = function (theme) {
    if (theme === 'dark' || theme === 'light') return theme;
    return null;
  };

  /**
   * Push theme into the yaml-workflow-widget iframe (R11-11).
   * @param {'light'|'dark'} [theme]
   * @param {{ force?: boolean }} [options]
   * @returns {boolean}
   */
  ComposerWorkflow.pushTheme = function (theme, options) {
    const next = ComposerWorkflow._normalizeTheme(theme) || ComposerWorkflow._currentTheme();
    const force = !!(options && options.force);
    if (!ComposerWorkflow._ready) {
      ComposerWorkflow._syncedTheme = next;
      return false;
    }
    if (!force && ComposerWorkflow._syncedTheme === next) {
      return true;
    }
    ComposerWorkflow._syncedTheme = next;
    return ComposerWorkflow.postToWidget('setTheme', { theme: next });
  };

  /**
   * Host navbar / Theme.toggle → re-theme the embedded editor.
   * Skip when the change originated from the iframe (themeChanged → apply).
   * @param {CustomEvent} event
   */
  ComposerWorkflow._onShellThemeChanged = function (event) {
    if (event?.detail?.fromWorkflow) return;
    const theme = ComposerWorkflow._normalizeTheme(event?.detail?.theme);
    if (!theme) return;
    ComposerWorkflow.pushTheme(theme, { force: true });
  };

  /**
   * Push current theme + YAML after `ready` (R11-10 handshake).
   */
  ComposerWorkflow._pushHandshake = function () {
    if (!ComposerWorkflow._ready) return;
    ComposerWorkflow.pushTheme(ComposerWorkflow._currentTheme(), { force: true });
    ComposerWorkflow.postToWidget('setYaml', { yaml: ComposerWorkflow._yaml || '' });
    const leftState =
      ComposerWorkflow._mode || Widgets.Composer?._leftState || 'partial';
    if (leftState === 'full') {
      ComposerWorkflow.setLayoutMode('fullscreen');
    } else {
      ComposerWorkflow.setLayoutMode('default');
    }
    if (Widgets.Composer?.setStatus) {
      Widgets.Composer.setStatus('Workflow editor: theme + YAML pushed after ready.');
    }
  };

  /**
   * Mark the iframe as not ready (e.g. after src reload). Next `ready` re-handshakes.
   */
  ComposerWorkflow._markNotReady = function () {
    ComposerWorkflow._ready = false;
    ComposerWorkflow._protocolVersion = null;
    ComposerWorkflow._lastValidation = null;
    const slot = document.getElementById(ComposerWorkflow.SLOT_ID);
    if (slot) slot.dataset.composerWorkflowReady = 'false';
  };

  /**
   * Store workflow YAML and push via setYaml when the editor is ready.
   * @param {string} yaml
   * @param {{ force?: boolean }} [options]
   */
  ComposerWorkflow.setWorkflowYaml = function (yaml, options) {
    const next = typeof yaml === 'string' ? yaml : '';
    const force = !!(options && options.force);
    if (!force && next === ComposerWorkflow._yaml && ComposerWorkflow._ready) {
      return;
    }
    ComposerWorkflow._yaml = next;
    if (ComposerWorkflow._ready) {
      ComposerWorkflow.postToWidget('setYaml', { yaml: next });
    }
  };

  /**
   * Resolve YAML from Composer/project workflow objects when present.
   * @returns {string|null}
   */
  ComposerWorkflow._resolveYamlFromComposer = function () {
    const selected =
      Widgets.Composer?.selectedWorkflow ||
      Widgets.Composer?.currentWorkflow ||
      null;
    if (selected && typeof selected === 'object') {
      const fromWf =
        selected.workflow_yaml ||
        selected.yaml ||
        selected.body ||
        null;
      if (typeof fromWf === 'string' && fromWf.trim()) return fromWf;
    }
    const project = Widgets.Composer?.selectedProject;
    if (project && typeof project === 'object') {
      if (typeof project.workflow_yaml === 'string' && project.workflow_yaml.trim()) {
        return project.workflow_yaml;
      }
      const workflows = Array.isArray(project.workflows) ? project.workflows : [];
      for (let i = 0; i < workflows.length; i += 1) {
        const wf = workflows[i];
        const y = wf?.workflow_yaml || wf?.yaml;
        if (typeof y === 'string' && y.trim()) return y;
      }
    }
    return null;
  };

  /**
   * Refresh `_yaml` from Composer selection when available; keep default otherwise.
   */
  ComposerWorkflow.syncYamlFromComposer = function () {
    const resolved = ComposerWorkflow._resolveYamlFromComposer();
    if (resolved != null) {
      ComposerWorkflow.setWorkflowYaml(resolved);
      return;
    }
    // No project / empty table → empty diagram (no default sample YAML).
    if (!Widgets.Composer?.selectedProject && !Widgets.Composer?.selectedProjectId) {
      ComposerWorkflow.setWorkflowYaml('', { force: true });
    }
  };

  ComposerWorkflow._dispatch = function (name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_err) {
      /* ignore */
    }
  };

  /**
   * Contrast ink for a #RRGGBB background (Composer status legend swatches).
   * @param {string} hex
   * @returns {'#222'|'#fff'}
   */
  ComposerWorkflow._contrastInk = function (hex) {
    const m = String(hex || '').trim().match(/^#([0-9a-fA-F]{6})$/);
    if (!m) return '#222';
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const y = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return y > 0.55 ? '#222' : '#fff';
  };

  /**
   * Apply YAML DSL status colors to Composer title-bar legend badges.
   * @param {{ waiting?: string, running?: string, complete?: string, failed?: string }|null|undefined} colors
   */
  ComposerWorkflow.applyStatusLegendColors = function (colors) {
    const legend = document.getElementById('composer-status-legend');
    if (!legend || !colors || typeof colors !== 'object') return;
    const keys = ['waiting', 'running', 'complete', 'failed'];
    keys.forEach((key) => {
      const hex = colors[key];
      if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex.trim())) return;
      const value = hex.trim().toLowerCase();
      legend.style.setProperty(`--composer-status-${key}`, value);
      legend.style.setProperty(
        `--composer-status-${key}-ink`,
        ComposerWorkflow._contrastInk(value)
      );
    });
  };

  ComposerWorkflow._handleWidgetMessage = function (event) {
    const expected = ComposerWorkflow._expectedOrigin || ComposerWorkflow._widgetOrigin();
    if (expected && event.origin && event.origin !== expected) {
      return;
    }

    const data = ComposerWorkflow._parseMessage(event.data);
    if (!data || data.target !== 'parent') return;

    switch (data.type) {
      case 'ready': {
        ComposerWorkflow._ready = true;
        ComposerWorkflow._protocolVersion =
          (data.payload && data.payload.version) || ComposerWorkflow.PROTOCOL_VERSION;
        const slot = document.getElementById(ComposerWorkflow.SLOT_ID);
        if (slot) slot.dataset.composerWorkflowReady = 'true';
        ComposerWorkflow.syncYamlFromComposer();
        ComposerWorkflow._pushHandshake();
        ComposerWorkflow._dispatch('composer-workflow:ready', {
          version: ComposerWorkflow._protocolVersion,
        });
        break;
      }
      case 'validationResult': {
        const ok = !!(data.payload && data.payload.ok);
        ComposerWorkflow._lastValidation = {
          ok,
          diagnostics: Array.isArray(data.payload?.diagnostics)
            ? data.payload.diagnostics
            : [],
        };
        if (Widgets.Composer?.setStatus) {
          Widgets.Composer.setStatus(
            ok
              ? 'Workflow YAML valid.'
              : 'Workflow YAML invalid — see editor diagnostics.'
          );
        }
        ComposerWorkflow._dispatch('composer-workflow:validation-result', {
          ...ComposerWorkflow._lastValidation,
        });
        break;
      }
      case 'yamlChanged': {
        const yaml =
          typeof data.payload === 'string'
            ? data.payload
            : data.payload?.yaml;
        if (typeof yaml === 'string') {
          ComposerWorkflow._yaml = yaml;
        }
        ComposerWorkflow._dispatch('composer-workflow:yaml-changed', {
          yaml: ComposerWorkflow._yaml,
        });
        if (Widgets.Composer?.setStatus) {
          Widgets.Composer.setStatus('Workflow YAML updated from editor.');
        }
        break;
      }
      case 'themeChanged': {
        // Iframe applied a theme (host setTheme echo or editor UI) — sync shell.
        const raw =
          typeof data.payload === 'string'
            ? data.payload
            : data.payload?.theme;
        const theme = ComposerWorkflow._normalizeTheme(raw);
        if (!theme) break;
        ComposerWorkflow._syncedTheme = theme;
        if (Widgets.Theme && typeof Widgets.Theme.apply === 'function') {
          if (Widgets.Theme.get() !== theme) {
            Widgets.Theme.apply(theme, { fromWorkflow: true });
          }
        }
        ComposerWorkflow._dispatch('composer-workflow:theme-changed', { theme });
        break;
      }
      case 'statusColorsChanged': {
        // YAML DSL settings → Composer title-bar status legend (SPEC-017).
        const colors =
          data.payload && typeof data.payload.colors === 'object'
            ? data.payload.colors
            : data.payload;
        ComposerWorkflow.applyStatusLegendColors(colors);
        ComposerWorkflow._dispatch('composer-workflow:status-colors-changed', {
          theme: data.payload?.theme,
          colors,
        });
        break;
      }
      case 'stepSelected': {
        // Diagram click → host right slide-in (R11-12 / AT1).
        const stepId =
          typeof data.payload === 'string'
            ? data.payload
            : data.payload?.stepId;
        const id = typeof stepId === 'string' ? stepId : '';
        const resolved = ComposerWorkflow.resolveStepSelection(id);
        if (Widgets.Composer?.handleStepSelected) {
          Widgets.Composer.handleStepSelected(id, resolved);
        }
        ComposerWorkflow._dispatch('composer-workflow:step-selected', {
          stepId: id,
          _handledByComposer: true,
          ...resolved,
        });
        break;
      }
      case 'editModeChanged': {
        const editing = !!(
          data.payload &&
          (data.payload.editing === true ||
            data.payload.editing === 'true' ||
            data.payload.editMode === true)
        );
        ComposerWorkflow._setEditingUi(editing);
        ComposerWorkflow._dispatch('composer-workflow:edit-mode-changed', {
          editing,
        });
        break;
      }
      case 'openCliUi': {
        const payload =
          typeof data.payload === 'string'
            ? { stepId: data.payload }
            : data.payload || {};
        const id = typeof payload.stepId === 'string' ? payload.stepId : '';
        if (id && Widgets.Composer?.handleStepSelected) {
          const resolved = ComposerWorkflow.resolveStepSelection(id, null, {
            uses: payload.uses || null,
            toolId: payload.toolId || null,
          });
          Widgets.Composer.handleStepSelected(id, resolved);
        }
        ComposerWorkflow._dispatch('composer-workflow:open-cli-ui', {
          stepId: id,
          uses: payload.uses || null,
          toolId: payload.toolId || null,
        });
        break;
      }
      default:
        break;
    }
  };

  ComposerWorkflow._setEditingUi = function (editing) {
    ComposerWorkflow._editing = !!editing;
    const btn = document.getElementById('composer-workflow-edit-toggle');
    if (!btn) return;
    btn.dataset.editing = ComposerWorkflow._editing ? 'true' : 'false';
    btn.setAttribute('aria-pressed', ComposerWorkflow._editing ? 'true' : 'false');
    btn.title = ComposerWorkflow._editing ? 'Exit edit mode' : 'Edit workflow';
    btn.setAttribute(
      'aria-label',
      ComposerWorkflow._editing ? 'Exit edit mode' : 'Edit workflow'
    );
    const icon = btn.querySelector('[data-edit-icon]') || btn.querySelector('i');
    if (icon) {
      icon.classList.toggle('fa-pencil', !ComposerWorkflow._editing);
      icon.classList.toggle('fa-glasses', ComposerWorkflow._editing);
    }
  };

  ComposerWorkflow.setEditMode = function (editing) {
    const want = !!editing;
    ComposerWorkflow._setEditingUi(want);
    return ComposerWorkflow.postToWidget('setEditMode', { editing: want });
  };

  ComposerWorkflow.toggleEditMode = function () {
    return ComposerWorkflow.setEditMode(!ComposerWorkflow._editing);
  };

  ComposerWorkflow.openSettings = function () {
    return ComposerWorkflow.postToWidget('openSettings', {});
  };

  ComposerWorkflow.resetView = function () {
    return ComposerWorkflow.postToWidget('resetView', {});
  };

  ComposerWorkflow.setLayoutMode = function (mode) {
    return ComposerWorkflow.postToWidget('setLayoutMode', {
      mode: mode || 'default',
    });
  };

  /**
   * SPEC-015 R15-13 / SPEC-018 R18-15 — push live step status map into the DAG iframe.
   * Replace-semantics: pass `{}` / null / undefined to clear.
   * Values may be legacy strings or `{ status, input_done?, input_total? }` objects for i/n badges.
   * No-ops safely before iframe `ready`.
   * @param {Record<string, 'waiting'|'running'|'complete'|'failed'|{ status: 'waiting'|'running'|'complete'|'failed', input_done?: number, input_total?: number }>|null|undefined} statuses
   * @returns {boolean}
   */
  ComposerWorkflow.setStepStatuses = function (statuses) {
    if (!ComposerWorkflow._ready) return false;
    const map =
      statuses && typeof statuses === 'object' && !Array.isArray(statuses)
        ? statuses
        : {};
    return ComposerWorkflow.postToWidget(
      ComposerWorkflow.HOST_MSG.SET_STEP_STATUSES,
      { statuses: map }
    );
  };

  ComposerWorkflow.bindChromeControls = function () {
    if (ComposerWorkflow._chromeBound) return;
    const editBtn = document.getElementById('composer-workflow-edit-toggle');
    const settingsBtn = document.getElementById('composer-workflow-settings');
    const resetBtn = document.getElementById('composer-workflow-reset-view');
    if (!editBtn && !settingsBtn && !resetBtn) return;
    ComposerWorkflow._chromeBound = true;
    editBtn?.addEventListener('click', () => {
      ComposerWorkflow.toggleEditMode();
    });
    settingsBtn?.addEventListener('click', () => {
      ComposerWorkflow.openSettings();
    });
    resetBtn?.addEventListener('click', () => {
      ComposerWorkflow.resetView();
    });
    ComposerWorkflow._setEditingUi(ComposerWorkflow._editing);
  };

  ComposerWorkflow._ensureListening = function () {
    if (ComposerWorkflow._listening) return;
    ComposerWorkflow._listening = true;
    window.addEventListener('message', ComposerWorkflow._handleWidgetMessage);
    ComposerWorkflow._ensureThemeListening();
  };

  ComposerWorkflow._ensureThemeListening = function () {
    if (ComposerWorkflow._themeListening) return;
    ComposerWorkflow._themeListening = true;
    window.addEventListener('shell:theme-changed', ComposerWorkflow._onShellThemeChanged);
  };

  ComposerWorkflow._applyIframeLayout = function (iframe) {
    iframe.classList.add('composer-workflow-iframe');
    iframe.style.border = '0';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.flex = '1 1 auto';
    iframe.style.minHeight = '0';
    iframe.style.display = 'block';
  };

  /**
   * Mount (or reuse) the yaml-workflow-widget iframe in the Composer left slot.
   * Keeps the iframe in the DOM when the column collapses (width 0).
   * @param {{ state?: 'collapsed'|'partial'|'full', src?: string }} [options]
   * @returns {HTMLIFrameElement|null}
   */
  ComposerWorkflow.mount = function (options) {
    const opts = options || {};
    const slot = document.getElementById(ComposerWorkflow.SLOT_ID);
    if (!slot) {
      console.error('ComposerWorkflow.mount: #composer-yaml-slot not found');
      return null;
    }

    ComposerWorkflow._ensureListening();
    ComposerWorkflow._expectedOrigin = ComposerWorkflow._widgetOrigin();

    const state =
      opts.state ||
      Widgets.Composer?._leftState ||
      document.getElementById('composer-workspace')?.dataset?.composerLeftState ||
      'partial';

    let iframe = ComposerWorkflow.getIframe();
    if (!iframe || !slot.contains(iframe)) {
      slot.replaceChildren();
      iframe = document.createElement('iframe');
      iframe.id = ComposerWorkflow.FRAME_ID;
      iframe.title = 'YAML workflow editor';
      iframe.setAttribute('loading', 'eager');
      iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      ComposerWorkflow._applyIframeLayout(iframe);
      slot.appendChild(iframe);
      ComposerWorkflow._iframe = iframe;
      ComposerWorkflow._markNotReady();
    } else {
      ComposerWorkflow._applyIframeLayout(iframe);
      ComposerWorkflow._iframe = iframe;
    }

    const urlMode = ComposerWorkflow._urlModeForState(state);
    const nextSrc = opts.src || ComposerWorkflow.urlForState(state);
    const currentSrc = iframe.getAttribute('src') || '';
    const needsSrc =
      !currentSrc ||
      currentSrc === 'about:blank' ||
      (urlMode === 'full' && /[?&]embed=1(?:&|$)/.test(currentSrc)) ||
      (urlMode === 'embed' && !/[?&]embed=1(?:&|$)/.test(currentSrc));

    if (needsSrc && iframe.src !== nextSrc) {
      ComposerWorkflow._markNotReady();
      iframe.src = nextSrc;
    }

    ComposerWorkflow._mode = state === 'collapsed' ? ComposerWorkflow._mode || 'partial' : state;
    slot.dataset.composerWorkflowMounted = 'true';
    slot.dataset.composerWorkflowUrlMode = urlMode;
    slot.dataset.composerWorkflowReady = ComposerWorkflow._ready ? 'true' : 'false';

    // YAML may already be on Composer from project open before mount.
    ComposerWorkflow.syncYamlFromComposer();

    return iframe;
  };

  /**
   * Sync iframe embed URL with Composer left width state.
   * Collapsed: hide via host layout only — do not destroy or blank the iframe.
   * @param {'collapsed'|'partial'|'full'} state
   */
  ComposerWorkflow.syncWidthState = function (state) {
    if (!state) return;
    ComposerWorkflow._ensureListening();
    const iframe = ComposerWorkflow.getIframe();
    if (!iframe) {
      ComposerWorkflow.mount({ state: state === 'collapsed' ? 'partial' : state });
      return;
    }

    if (state === 'collapsed') {
      // Keep current document; host CSS collapses the column to 0 width.
      const slot = document.getElementById(ComposerWorkflow.SLOT_ID);
      if (slot) slot.dataset.composerWorkflowCollapsed = 'true';
      return;
    }

    const slot = document.getElementById(ComposerWorkflow.SLOT_ID);
    if (slot) slot.dataset.composerWorkflowCollapsed = 'false';

    const urlMode = ComposerWorkflow._urlModeForState(state);
    const nextSrc = ComposerWorkflow.urlForState(state);
    const currentSrc = iframe.getAttribute('src') || '';
    const isEmbed = /[?&]embed=1(?:&|$)/.test(currentSrc);
    const wantsEmbed = urlMode === 'embed';

    if (!currentSrc || currentSrc === 'about:blank' || isEmbed !== wantsEmbed) {
      ComposerWorkflow._markNotReady();
      iframe.src = nextSrc;
    }

    ComposerWorkflow._mode = state;
    if (slot) {
      slot.dataset.composerWorkflowUrlMode = urlMode;
      slot.dataset.composerWorkflowReady = ComposerWorkflow._ready ? 'true' : 'false';
    }

    // After URL settle / if already ready, push layout: full = 50/50 code + 100% diagram.
    if (ComposerWorkflow._ready) {
      if (state === 'full') {
        ComposerWorkflow.setLayoutMode('fullscreen');
      } else {
        ComposerWorkflow.setLayoutMode('default');
        ComposerWorkflow.resetView();
      }
    }
  };

  /**
   * Ensure mount when Composer panel initializes (called from Composer.initPanel).
   */
  ComposerWorkflow.initFromComposer = function () {
    ComposerWorkflow.bindChromeControls();
    ComposerWorkflow.mount({ state: Widgets.Composer?._leftState || 'partial' });
  };

  /**
   * If Composer already initialized before this module loaded (unlikely when
   * webpack order is correct), mount into the existing panel.
   */
  ComposerWorkflow._bootIfComposerReady = function () {
    const panel = document.querySelector('[data-widget="composer-panel"]');
    if (panel?.dataset?.initialized === 'true' && !ComposerWorkflow.getIframe()) {
      ComposerWorkflow.initFromComposer();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ComposerWorkflow._bootIfComposerReady);
  } else {
    ComposerWorkflow._bootIfComposerReady();
  }
})(window.Widgets.ComposerWorkflow, window.Widgets, document, window);
