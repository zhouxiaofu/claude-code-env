'use strict';

// Single machine-managed cache file (~/.claude/cce/cache.json) shared by every
// cce subsystem. NEVER store user-edited settings here — those live in
// config.json. This file is throwaway state: it can be deleted at any time and
// will be rebuilt on the next run.
//
// Sections:
//   update   — self-update bookkeeping (was the old update-check.json)
//   template — remote-template fetch metadata (when/etag/from-where); the
//              template payload itself lives next door in templates.remote.json.

const fs = require('fs');
const path = require('path');

const config = require('./config');

function getCachePath() {
  return path.join(config.getConfigDir(), 'cache.json');
}

function defaultCache() {
  return {
    update: {
      lastCheckAt: 0,
      latestVersion: null,
      skippedVersion: null,
      autoUpdatePending: null,
      autoUpdateAttemptedAt: 0,
    },
    template: {
      fetchedAt: 0,
      etag: null,
      sourceUrl: null,
    },
  };
}

// Merge only known, correctly-typed fields from `src` into `dst` (in place).
// Numeric fields (default 0) accept numbers; the rest are string-or-null.
function mergeTyped(dst, src) {
  if (!src || typeof src !== 'object') return;
  for (const k of Object.keys(dst)) {
    if (!(k in src)) continue;
    const v = src[k];
    if (typeof dst[k] === 'number') {
      if (typeof v === 'number') dst[k] = v;
    } else if (v === null || typeof v === 'string') {
      dst[k] = v;
    }
  }
}

function read() {
  const base = defaultCache();
  try {
    const parsed = JSON.parse(fs.readFileSync(getCachePath(), 'utf8'));
    if (parsed && typeof parsed === 'object') {
      mergeTyped(base.update, parsed.update);
      mergeTyped(base.template, parsed.template);
    }
  } catch {
    /* missing / unreadable / invalid — caller gets fresh defaults */
  }
  return base;
}

// Shallow-merge `patch` into one section and persist atomically. Best-effort:
// any failure (read-only FS, etc.) is swallowed.
function writeSection(section, patch) {
  const cur = read();
  cur[section] = { ...cur[section], ...patch };
  try {
    config.ensureConfigDir();
    const file = getCachePath();
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cur, null, 2) + '\n');
    fs.renameSync(tmp, file);
  } catch {
    /* best effort */
  }
  return cur[section];
}

function readUpdate() {
  return read().update;
}
function writeUpdate(patch) {
  return writeSection('update', patch);
}
function readTemplate() {
  return read().template;
}
function writeTemplate(patch) {
  return writeSection('template', patch);
}

module.exports = {
  getCachePath,
  defaultCache,
  read,
  readUpdate,
  writeUpdate,
  readTemplate,
  writeTemplate,
};
