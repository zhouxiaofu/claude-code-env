'use strict';

// Tokenize a CLI-style string into tokens. Designed to be friendly to
// Windows paths: backslashes are ALWAYS literal (no POSIX escape), only
// quoting groups tokens.
//
// Rules:
//  - Whitespace (outside quotes) splits tokens
//  - Single quotes preserve everything literally up to the next single quote
//  - Double quotes preserve everything literally up to the next double quote
//  - Backslashes are literal everywhere — they NEVER escape the next char
//
// This is closer to Windows cmd.exe behavior than POSIX shell, which is
// what users intuitively expect when pasting `--add-dir D:\My Code\proj`
// from PowerShell into config.
function tokenize(str) {
  if (!str || typeof str !== 'string') return [];
  const tokens = [];
  let current = '';
  let hasCurrent = false;          // distinguish "" from "no token yet"
  let mode = 'plain';              // 'plain' | 'single' | 'double'

  const push = () => {
    if (hasCurrent) {
      tokens.push(current);
      current = '';
      hasCurrent = false;
    }
  };

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (mode === 'single') {
      if (c === "'") { mode = 'plain'; }
      else { current += c; hasCurrent = true; }
      continue;
    }
    if (mode === 'double') {
      if (c === '"') { mode = 'plain'; }
      else { current += c; hasCurrent = true; }
      continue;
    }
    // plain
    if (c === "'") { mode = 'single'; hasCurrent = true; continue; }
    if (c === '"') { mode = 'double'; hasCurrent = true; continue; }
    if (/\s/.test(c)) { push(); continue; }
    current += c;
    hasCurrent = true;
  }
  push();
  return tokens;
}

// Render an argv token array back into a shell-readable single-line string.
// Tokens containing whitespace or quote chars get wrapped in double quotes,
// with any inner double-quote replaced by ""  (cmd.exe style).
function quoteArgs(tokens) {
  if (!tokens || tokens.length === 0) return '';
  return tokens.map((t) => {
    if (t === '') return '""';
    if (/[\s"']/.test(t)) {
      // Wrap in double quotes; double up any inner double-quote
      return '"' + String(t).replace(/"/g, '""') + '"';
    }
    return t;
  }).join(' ');
}

/**
 * Build the layered view of claude args. Each layer carries its source
 * label, the original (verbatim) source string, and the tokenized form.
 *
 * Pure concat semantics — layers append in order, no dedup. Claude itself
 * handles duplicate flags (last-wins for most, stack for repeatables).
 *
 * Override rules:
 *  - `overrideArg !== null` (CLI -A) → only the override layer survives.
 *  - `envEntry.argsOverride === true` → env layer replaces global layer
 *    (CLI -a can still append on top).
 */
function buildLayers({ globalArgs = '', envEntry = null, mergeArgs = [], overrideArg = null } = {}) {
  if (overrideArg !== null) {
    return [{ source: 'CLI -A', raw: overrideArg, tokens: tokenize(overrideArg) }];
  }

  const layers = [];
  const envArgs = envEntry?.args || '';
  const envOverride = envEntry?.argsOverride === true;

  if (!envOverride && globalArgs) {
    layers.push({ source: 'global', raw: globalArgs, tokens: tokenize(globalArgs) });
  }
  if (envArgs) {
    layers.push({ source: 'env', raw: envArgs, tokens: tokenize(envArgs) });
  }
  for (const cli of mergeArgs) {
    if (cli !== '') {
      layers.push({ source: 'CLI -a', raw: cli, tokens: tokenize(cli) });
    }
  }
  return layers;
}

function flattenLayers(layers) {
  return layers.flatMap((l) => l.tokens);
}

function buildClaudeArgs(opts) {
  return flattenLayers(buildLayers(opts));
}

module.exports = {
  tokenize,
  buildLayers,
  flattenLayers,
  buildClaudeArgs,
  quoteArgs,
};
