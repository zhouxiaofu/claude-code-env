'use strict';

const fs = require('fs');
const path = require('path');

const config = require('./config');
const cache = require('./cache');
const log = require('./util/log');
const { t } = require('./i18n');

// Default remote sources for the builtin template file, tried in order. The
// file is served straight from the GitHub repo via jsDelivr (CDN, China-
// friendly) with raw.githubusercontent.com as a fallback. A user-set
// config.template.url overrides BOTH (single source, no fallback).
const REMOTE_SOURCES = [
  'https://cdn.jsdelivr.net/gh/zhouxiaofu/claude-code-env@main/templates/builtin.json',
  'https://raw.githubusercontent.com/zhouxiaofu/claude-code-env/main/templates/builtin.json',
];

const TTL_MS = 24 * 60 * 60 * 1000; // 24h — refetch the default templates at most once a day
const FETCH_TIMEOUT_MS = 5000;

// Raised for user-facing template problems (network failure with no cache,
// bad JSON, missing --from file, wrong shape). The command layer prints
// `.message` and exits non-zero.
class TemplateError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'TemplateError';
  }
}

// User-authored templates, sitting next to config.json. Always layered on top
// of the default (remote) templates.
function userTemplatesPath() {
  return path.join(config.getConfigDir(), 'templates.json');
}

// Locally-cached copy of the remote default templates (same shape as the remote
// builtin.json, so a manual download can be dropped straight in here).
function remoteCachePath() {
  return path.join(config.getConfigDir(), 'templates.remote.json');
}

function isUrl(s) {
  return typeof s === 'string' && /^https?:\/\//i.test(s);
}

// The URL we point users at in error/help messages (their override, or the
// primary default).
function displayUrl(cfg) {
  return (cfg && cfg.template && cfg.template.url) || REMOTE_SOURCES[0];
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw);
}

function writeFileAtomic(file, content) {
  config.ensureConfigDir();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// Coerce one raw template entry into the shape the command layer relies on.
// Tolerant: drops non-string env values and malformed required items rather
// than throwing, so one bad field doesn't sink the whole file.
function normalizeTemplate(name, raw, source) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const env = {};
  if (raw.env && typeof raw.env === 'object' && !Array.isArray(raw.env)) {
    for (const [k, v] of Object.entries(raw.env)) {
      if (typeof v === 'string') env[k] = v;
    }
  }

  const required = [];
  if (Array.isArray(raw.required)) {
    for (const it of raw.required) {
      if (!it || typeof it !== 'object') continue;
      if (typeof it.name !== 'string' || it.name === '') continue;
      const item = { name: it.name, description: it.description ?? null };
      if (typeof it.default === 'string') item.default = it.default;
      required.push(item);
    }
  }

  return { name, description: raw.description ?? null, env, required, source };
}

// --- remote fetch ----------------------------------------------------------

async function fetchRemote(url, etag) {
  if (typeof fetch !== 'function') return { error: 'no-fetch' };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers = { accept: 'application/json' };
    if (etag) headers['if-none-match'] = etag;
    const res = await fetch(url, { signal: ac.signal, headers });
    if (res.status === 304) return { notModified: true };
    if (!res.ok) return { error: 'http-' + res.status };
    const text = await res.text();
    return { ok: true, text, etag: res.headers.get('etag') };
  } catch (e) {
    return { error: e && e.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Make sure the local remote-template cache is present and (unless offline /
 * fresh) up to date. Pure side-effects on disk + cache.json — the caller reads
 * the payload from remoteCachePath() afterwards.
 *
 * @returns {{ attempted, fetchFailed, usedStale, hasFile, error? }}
 */
async function ensureRemoteCache({ cfg, refresh = false }) {
  const offline = cfg.template && cfg.template.offline === true;
  const file = remoteCachePath();
  const hasFile = fs.existsSync(file);
  const st = cache.readTemplate();

  // Offline (and not an explicit refresh): never touch the network.
  if (offline && !refresh) {
    return { attempted: false, fetchFailed: false, usedStale: false, hasFile };
  }

  const fresh = hasFile && st.fetchedAt && Date.now() - st.fetchedAt < TTL_MS;
  if (fresh && !refresh) {
    return { attempted: false, fetchFailed: false, usedStale: false, hasFile };
  }

  const urls = cfg.template && cfg.template.url ? [cfg.template.url] : REMOTE_SOURCES;
  let lastErr = null;
  for (const url of urls) {
    const etag = url === st.sourceUrl ? st.etag : null;
    const r = await fetchRemote(url, etag);
    if (r.notModified) {
      cache.writeTemplate({ fetchedAt: Date.now() });
      return { attempted: true, fetchFailed: false, usedStale: false, hasFile: true };
    }
    if (r.ok) {
      let parsed;
      try {
        parsed = JSON.parse(r.text);
      } catch {
        lastErr = 'parse';
        continue;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        lastErr = 'shape';
        continue;
      }
      writeFileAtomic(file, r.text);
      cache.writeTemplate({ fetchedAt: Date.now(), etag: r.etag || null, sourceUrl: url });
      return { attempted: true, fetchFailed: false, usedStale: false, hasFile: true };
    }
    lastErr = r.error;
  }

  // Every source failed. Fall back to a stale cache if we have one.
  return { attempted: true, fetchFailed: true, usedStale: hasFile, hasFile, error: lastErr };
}

// --- loading + merging ------------------------------------------------------

function addAll(map, data, source) {
  for (const [name, raw] of Object.entries(data)) {
    const tpl = normalizeTemplate(name, raw, source);
    if (tpl) map.set(name, tpl);
  }
}

// Read one explicit `--from` source (file path or http(s) URL). One-time: never
// written to the cache. Throws TemplateError on any problem.
async function loadFromSource(from) {
  if (isUrl(from)) {
    const r = await fetchRemote(from, null);
    if (!r.ok) throw new TemplateError(t('template.fromFetchFailed', { src: from, reason: r.error || 'network' }));
    let parsed;
    try {
      parsed = JSON.parse(r.text);
    } catch (e) {
      throw new TemplateError(t('add.fileParseFailed', { file: from, message: e.message }));
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new TemplateError(t('add.fileBadShape', { file: from }));
    }
    return parsed;
  }
  // File path.
  const file = path.resolve(from);
  let data;
  try {
    data = readJson(file);
  } catch (e) {
    throw new TemplateError(t('add.fileParseFailed', { file, message: e.message }));
  }
  if (data == null) throw new TemplateError(t('add.fileNotFound', { file }));
  if (typeof data !== 'object' || Array.isArray(data)) throw new TemplateError(t('add.fileBadShape', { file }));
  return data;
}

/**
 * Load + merge templates into a Map(name → template). Layers, low → high:
 *   1. base: `from` source (one-time path/url) OR the default remote/cache
 *   2. user templates.json (always overlays the base)
 *
 * @param {object} opts
 * @param {string|null} opts.from        --from path/url (skips the remote default)
 * @param {boolean}     opts.refresh     force a remote refetch (ignores TTL/offline)
 * @param {boolean}     opts.allowFetch  false = cache-only, never network, never
 *                                        throw on emptiness (used by completion)
 * @param {object|null} opts.cfg         preloaded config (optional)
 */
async function loadTemplates({ from = null, refresh = false, allowFetch = true, cfg = null } = {}) {
  if (!cfg) cfg = config.load();

  const merged = new Map();
  let ctx = { attempted: false, fetchFailed: false, usedStale: false, hasFile: false };

  // Layer 1: base source.
  if (from) {
    addAll(merged, await loadFromSource(from), from);
  } else {
    if (allowFetch) {
      ctx = await ensureRemoteCache({ cfg, refresh });
      if (ctx.usedStale) log.warn(t('template.usingStale'));
    }
    let data = null;
    try {
      data = readJson(remoteCachePath());
    } catch {
      /* corrupt cache file — treated as absent */
    }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      addAll(merged, data, remoteCachePath());
    }
  }

  // Layer 2: user templates.json (optional).
  let userData = null;
  try {
    userData = readJson(userTemplatesPath());
  } catch (e) {
    throw new TemplateError(t('add.fileParseFailed', { file: userTemplatesPath(), message: e.message }));
  }
  if (userData && typeof userData === 'object' && !Array.isArray(userData)) {
    addAll(merged, userData, userTemplatesPath());
  }

  if (merged.size === 0 && allowFetch) {
    throw emptyError(ctx, { from, cfg });
  }
  return merged;
}

function emptyError(ctx, { from, cfg }) {
  if (from) {
    return new TemplateError(t('template.fromEmpty', { src: from }));
  }
  const offline = cfg.template && cfg.template.offline === true;
  if (offline) {
    return new TemplateError(t('template.offlineNoCache', { url: displayUrl(cfg), path: remoteCachePath() }));
  }
  if (ctx.fetchFailed) {
    return new TemplateError(t('template.fetchFailed', {
      url: displayUrl(cfg),
      path: remoteCachePath(),
      reason: ctx.error || 'network',
    }));
  }
  return new TemplateError(t('template.none', { url: displayUrl(cfg) }));
}

// Pure: assemble the final env to store, merging the user's answers (keyed by
// required-field name) over the template's fixed env. Answers win on collision.
function buildEnvFromTemplate(tpl, answers) {
  const env = { ...tpl.env };
  for (const item of tpl.required) {
    if (Object.prototype.hasOwnProperty.call(answers, item.name)) {
      env[item.name] = answers[item.name];
    }
  }
  return env;
}

module.exports = {
  REMOTE_SOURCES,
  TTL_MS,
  TemplateError,
  userTemplatesPath,
  remoteCachePath,
  displayUrl,
  isUrl,
  normalizeTemplate,
  fetchRemote,
  ensureRemoteCache,
  loadTemplates,
  loadFromSource,
  buildEnvFromTemplate,
};
