'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const config = require('./config');
const log = require('./util/log');
const { expandEnvVars } = require('./util/expand');
const { parseJson } = require('./util/json');
const { t } = require('./i18n');

const { KNOWN_ANTHROPIC_VARS } = config;

// Orphaned temp settings (from a crashed/killed session) older than this get
// swept on the next launch. Generous enough to never touch a live session.
const ORPHAN_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h

function getTmpDir() {
  return path.join(config.getConfigDir(), 'tmp');
}

// Read the `env` block out of Claude Code's own ~/.claude/settings.json.
// Never throws — a missing/invalid file is treated as an empty env (with a
// one-line warning so the user knows reconciliation skipped it).
function readUserEnv() {
  const file = config.getClaudeSettingsPath();
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return {}; // not existing is normal, no warning
  }
  try {
    const parsed = parseJson(raw);
    if (parsed && typeof parsed.env === 'object' && parsed.env) {
      return parsed.env;
    }
    return {};
  } catch (e) {
    log.warn(t('settings.readWarn', { file, message: e.message }));
    return {};
  }
}

/**
 * Merge the root/global `env` under a selected env's `env`. The selected env
 * overrides the global layer key-by-key; a value of '' / null / undefined in
 * the selected env REMOVES that key entirely — letting an env drop a global
 * var it doesn't want. Deletion keys off the raw value (before ${VAR}
 * expansion).
 *
 * @returns {object} the merged env (raw values, not yet expanded)
 */
function mergeEntryEnv(globalEnv = {}, entryEnv = {}) {
  const merged = { ...(globalEnv || {}) };
  for (const [k, v] of Object.entries(entryEnv || {})) {
    if (v === '' || v === null || v === undefined) {
      delete merged[k];
    } else {
      merged[k] = v;
    }
  }
  return merged;
}

/**
 * Compute the `env` object to write into the temp settings file that is passed
 * to `claude --settings`. That file is a HIGHER-precedence layer that MERGES
 * over the user's ~/.claude/settings.json, so for any key:
 *   effective[k] = (k in tempEnv) ? tempEnv[k] : userEnv[k]
 *
 * `globalEnv` (config root `env`) is merged under `entryEnv` first (see
 * mergeEntryEnv), then the result is ${VAR}-expanded and reconciled per mode:
 *   override     → tempEnv = entryEnv, plus stale anthropic keys present only
 *                  in userEnv get neutralized to "" (claude treats "" as unset).
 *   merge-cce    → tempEnv = entryEnv (entry wins; user-only keys fall through).
 *   merge-claude → tempEnv = entryEnv minus keys also in userEnv (so the user's
 *                  settings.json value wins on every conflict).
 *
 * @returns {{ tempEnv: object, neutralized: string[] }}
 */
function reconcileEnv({ entryEnv = {}, globalEnv = {}, userEnv = {}, mode = config.DEFAULT_SETTINGS_MODE, parentEnv = process.env }) {
  const merged = mergeEntryEnv(globalEnv, entryEnv);
  const expanded = {};
  for (const [k, v] of Object.entries(merged)) {
    expanded[k] = expandEnvVars(v, parentEnv);
  }

  const tempEnv = {};
  const neutralized = [];

  if (mode === 'merge-claude') {
    for (const [k, v] of Object.entries(expanded)) {
      if (!(k in userEnv)) tempEnv[k] = v;
    }
    return { tempEnv, neutralized };
  }

  // override + merge-cce both start from the full entry env.
  Object.assign(tempEnv, expanded);

  if (mode === 'override') {
    for (const k of KNOWN_ANTHROPIC_VARS) {
      if (k in userEnv && !(k in expanded)) {
        tempEnv[k] = ''; // neutralize stale provider key the entry doesn't define
        neutralized.push(k);
      }
    }
  }

  return { tempEnv, neutralized };
}

// Write the reconciled env to a unique temp settings file and return its path.
// Unique per-process name keeps concurrent cce sessions from clashing.
function writeTempSettings(tempEnv) {
  const dir = getTmpDir();
  fs.mkdirSync(dir, { recursive: true });
  const name = `settings-${process.pid}-${crypto.randomBytes(4).toString('hex')}.json`;
  const file = path.join(dir, name);
  const content = JSON.stringify({ env: tempEnv }, null, 2) + '\n';
  fs.writeFileSync(file, content, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* Windows / FS without chmod — ignore */
  }
  return file;
}

function cleanupTempSettings(file) {
  if (!file) return;
  try {
    fs.unlinkSync(file);
  } catch {
    /* already gone — fine */
  }
}

// Delete temp settings left behind by sessions that never got to clean up
// (SIGKILL, power loss, ...). Only touches files older than the max age so a
// concurrent live session is never affected. Best-effort, never throws.
function sweepOrphans() {
  const dir = getTmpDir();
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  const now = Date.now();
  for (const name of entries) {
    if (!/^settings-.*\.json$/.test(name)) continue;
    const p = path.join(dir, name);
    try {
      const st = fs.statSync(p);
      if (now - st.mtimeMs > ORPHAN_MAX_AGE_MS) fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

/**
 * High-level helper: given the selected env entry and resolved mode, build the
 * temp settings file (if there's anything to write) and return its path plus
 * the keys that were neutralized. Returns { file: null } when nothing needs to
 * be written (then no `--settings` flag should be added).
 */
function prepareSettings({ entry, globalEnv = {}, mode, parentEnv = process.env }) {
  const entryEnv = (entry && entry.env) || {};
  const userEnv = readUserEnv();
  const { tempEnv, neutralized } = reconcileEnv({ entryEnv, globalEnv, userEnv, mode, parentEnv });

  if (Object.keys(tempEnv).length === 0) {
    return { file: null, neutralized, tempEnv };
  }
  const file = writeTempSettings(tempEnv);
  return { file, neutralized, tempEnv };
}

module.exports = {
  getTmpDir,
  readUserEnv,
  mergeEntryEnv,
  reconcileEnv,
  writeTempSettings,
  cleanupTempSettings,
  sweepOrphans,
  prepareSettings,
};
