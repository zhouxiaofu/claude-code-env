'use strict';

// Tiny zero-dependency i18n layer. Two catalogs (en is source of truth),
// `t(key, params)` looks up the current language and falls back to en, then
// to the raw key. Language is resolved once at startup by cli.js.

const CATALOGS = {
  en: require('./en'),
  'zh-CN': require('./zh-CN'),
};

const DEFAULT_LANG = 'en';
const SUPPORTED = Object.keys(CATALOGS);

let currentLang = DEFAULT_LANG;

// Map a raw locale-ish string to one of our supported langs, or null.
//   zh, zh-CN, zh_CN, zh-Hans, zh-TW → zh-CN (we only ship one Chinese catalog)
//   en, en-US, en_GB                 → en
function normalizeLang(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase().replace(/_/g, '-');
  if (!s) return null;
  if (s === 'zh-cn') return 'zh-CN';
  if (s.startsWith('zh')) return 'zh-CN';
  if (s.startsWith('en')) return 'en';
  return null;
}

// Best-effort detection from the OS locale / env, no config involved.
function detectFromLocale() {
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale;
    const fromIntl = normalizeLang(loc);
    if (fromIntl) return fromIntl;
  } catch {
    /* Intl may be unavailable in stripped runtimes */
  }
  return normalizeLang(
    process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG
  );
}

// Resolve the effective language. Precedence (high → low):
//   CCE_LANG env  >  config `lang`  >  OS locale  >  en
// (Per-run override is the CCE_LANG env var — cce deliberately keeps no
// non-launch CLI flags beyond -h/-v; persistent choice is `cce lang`.)
function resolveLang({ configLang = null } = {}) {
  return (
    normalizeLang(process.env.CCE_LANG) ||
    normalizeLang(configLang) ||
    detectFromLocale() ||
    DEFAULT_LANG
  );
}

function setLang(lang) {
  const n = normalizeLang(lang) || DEFAULT_LANG;
  currentLang = SUPPORTED.includes(n) ? n : DEFAULT_LANG;
  return currentLang;
}

function getLang() {
  return currentLang;
}

function t(key, params) {
  const cat = CATALOGS[currentLang] || CATALOGS[DEFAULT_LANG];
  let s = cat[key];
  if (s === undefined) s = CATALOGS[DEFAULT_LANG][key];
  if (s === undefined) return key;
  if (params) {
    s = s.replace(/\{(\w+)\}/g, (m, k) =>
      params[k] !== undefined && params[k] !== null ? String(params[k]) : ''
    );
  }
  return s;
}

// Resolve a possibly-multilingual value (used by templates' descriptions) to a
// single display string for the current UI language. Accepts:
//   - a plain string  → returned as-is (back-compat with single-language data)
//   - an object keyed by lang, e.g. { en: '…', 'zh-CN': '…' }
// Fallback chain for the object form: current lang → en → first non-empty value.
// null / non-object / an object with no non-empty string values → '' (caller
// should then render nothing).
function localize(value, lang = currentLang) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const entries = Object.entries(value).filter(
    ([, v]) => typeof v === 'string' && v.trim() !== ''
  );
  if (entries.length === 0) return '';
  const map = Object.fromEntries(entries);
  if (map[lang]) return map[lang];
  if (map[DEFAULT_LANG]) return map[DEFAULT_LANG];
  return entries[0][1];
}

module.exports = {
  t,
  localize,
  setLang,
  getLang,
  resolveLang,
  normalizeLang,
  detectFromLocale,
  SUPPORTED,
  DEFAULT_LANG,
};
