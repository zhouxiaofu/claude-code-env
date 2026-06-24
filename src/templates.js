'use strict';

const fs = require('fs');
const path = require('path');

const config = require('./config');
const cache = require('./cache');
const log = require('./util/log');
const expr = require('./util/expr');
const { t } = require('./i18n');

// The template-schema version this cce understands. The remote source URL
// embeds it (`builtin.v${version}.json`) so each cce binary only ever fetches
// the format it can parse; bumping this + publishing a new file is the entire
// upgrade path. Old (pre-versioned-URL) clients keep fetching builtin.json.
const TEMPLATE_SCHEMA_VERSION = 2;

// Official variables allowed inside a source URL (default or user mirror).
// Extend by adding keys here; anything else in a `${...}` is rejected.
const URL_VARS = { version: String(TEMPLATE_SCHEMA_VERSION) };

// Default remote sources for the builtin template file, tried in order. The
// file is served straight from the GitHub repo via jsDelivr (CDN, China-
// friendly) with raw.githubusercontent.com as a fallback. A user-set
// config.template.url overrides BOTH (single source, no fallback). `${version}`
// is substituted before fetching (see substituteUrlVars).
const REMOTE_SOURCES = [
  'https://cdn.jsdelivr.net/gh/zhouxiaofu/claude-code-env@main/templates/builtin.v${version}.json',
  'https://raw.githubusercontent.com/zhouxiaofu/claude-code-env/main/templates/builtin.v${version}.json',
];

const TTL_MS = 3 * 60 * 60 * 1000; // 3h — refetch the default templates at most once every 3 hours
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

// Resolve `${var}` in a source URL against the official URL_VARS (currently just
// version). Reuses the template expression engine in strict mode, so an unknown
// `${foo}` throws — that's the validation for `cce template url`. A URL with no
// `${...}` passes through unchanged.
function substituteUrlVars(url) {
  if (typeof url !== 'string') return url;
  try {
    return expr.render(url, URL_VARS, { strict: true });
  } catch (e) {
    throw new TemplateError(t('template.urlBadVar', { url, reason: e.message }));
  }
}

// The URL we point users at in error/help messages (their override, or the
// primary default), with `${version}` resolved.
function displayUrl(cfg) {
  const raw = (cfg && cfg.template && cfg.template.url) || REMOTE_SOURCES[0];
  try {
    return substituteUrlVars(raw);
  } catch {
    return raw;
  }
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

// Keep only the string-valued keys of an object (env / const.vars / const.env).
function stringMap(obj) {
  const out = {};
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') out[k] = v;
    }
  }
  return out;
}

// Normalize one input node, or null to drop it (tolerant — a malformed node
// must not sink the whole template). type defaults to 'env'.
function normalizeInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const type = typeof raw.type === 'string' ? raw.type : 'env';

  if (type === 'env' || type === 'var') {
    if (typeof raw.name !== 'string' || raw.name === '') return null;
    const node = { type, name: raw.name, description: raw.description ?? null };
    if (typeof raw.default === 'string') node.default = raw.default;
    if (type === 'env' && typeof raw.value === 'string') node.value = raw.value;
    return node;
  }
  if (type === 'const') {
    return { type, vars: stringMap(raw.vars), env: stringMap(raw.env) };
  }
  if (type === 'select') {
    const options = [];
    if (Array.isArray(raw.options)) {
      for (const o of raw.options) {
        const opt = normalizeOption(o);
        if (opt) options.push(opt);
      }
    }
    if (options.length === 0) return null;
    return {
      type,
      name: typeof raw.name === 'string' && raw.name !== '' ? raw.name : null,
      description: raw.description ?? null,
      options,
    };
  }
  return null;
}

function normalizeOption(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.name !== 'string' || raw.name === '') return null;
  return { name: raw.name, label: raw.label ?? null, inputs: normalizeInputs(raw.inputs) };
}

function normalizeInputs(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const n of arr) {
    const node = normalizeInput(n);
    if (node) out.push(node);
  }
  return out;
}

// Coerce one raw template entry into the shape the command layer relies on.
// Tolerant: drops non-string env values and malformed input nodes rather than
// throwing, so one bad field doesn't sink the whole file.
function normalizeTemplate(name, raw, source) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  return {
    name,
    description: raw.description ?? null,
    docs: typeof raw.docs === 'string' ? raw.docs : null,
    nameExpr: typeof raw.name === 'string' ? raw.name : null,
    env: stringMap(raw.env),
    inputs: normalizeInputs(raw.inputs),
    source,
  };
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

  const rawUrls = cfg.template && cfg.template.url ? [cfg.template.url] : REMOTE_SOURCES;
  let lastErr = null;
  for (const rawUrl of rawUrls) {
    let url;
    try {
      url = substituteUrlVars(rawUrl); // resolve ${version}; cache/etag key off the resolved URL
    } catch {
      lastErr = 'url-vars';
      continue;
    }
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
    const r = await fetchRemote(substituteUrlVars(from), null);
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

module.exports = {
  REMOTE_SOURCES,
  TTL_MS,
  TEMPLATE_SCHEMA_VERSION,
  TemplateError,
  userTemplatesPath,
  remoteCachePath,
  displayUrl,
  isUrl,
  substituteUrlVars,
  normalizeTemplate,
  fetchRemote,
  ensureRemoteCache,
  loadTemplates,
  loadFromSource,
};
