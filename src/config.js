'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { t } = require('./i18n');

const CONFIG_VERSION = 1;

const KNOWN_ANTHROPIC_VARS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
];

// How a selected env's `env` reconciles with ~/.claude/settings.json `env`.
const SETTINGS_MODES = ['override', 'merge-cce', 'merge-claude'];
const DEFAULT_SETTINGS_MODE = 'override';

// Self-update behavior on launch.
//   auto   — silently update in the background when a newer version is found
//   prompt — ask (Update now / Skip this version) on the next interactive launch
//   off    — never check at launch (manual `cce update` still works)
const UPDATE_MODES = ['auto', 'prompt', 'off'];
const DEFAULT_UPDATE_MODE = 'auto';

// Allowed env names — mirrors the `envs` patternProperties in schema.json so a
// name created by `cce add` always validates against the schema too: first char
// alphanumeric, rest may add . _ -
const ENV_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isValidEnvName(name) {
  return typeof name === 'string' && ENV_NAME_RE.test(name);
}

function getConfigDir() {
  if (process.env.CCE_CONFIG_HOME) {
    return path.resolve(process.env.CCE_CONFIG_HOME);
  }
  return path.join(os.homedir(), '.claude', 'cce');
}

function getConfigPath() {
  return path.join(getConfigDir(), 'config.json');
}

// Claude Code's own user settings directory. Honors CLAUDE_CONFIG_DIR the same
// way claude does, so cce reconciles against the file claude actually reads.
function getClaudeDir() {
  if (process.env.CLAUDE_CONFIG_DIR) {
    return path.resolve(process.env.CLAUDE_CONFIG_DIR);
  }
  return path.join(os.homedir(), '.claude');
}

function getClaudeSettingsPath() {
  return path.join(getClaudeDir(), 'settings.json');
}

function defaultConfig() {
  return {
    version: CONFIG_VERSION,
    default: null,
    lang: null,
    args: '',
    settingsMode: DEFAULT_SETTINGS_MODE,
    updateMode: DEFAULT_UPDATE_MODE,
    envs: {},
  };
}

function ensureConfigDir() {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function load() {
  const file = getConfigPath();
  if (!fs.existsSync(file)) {
    return defaultConfig();
  }
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(t('config.readFailed', { file, message: e.message }));
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const bak = file + '.bak.' + Date.now();
    fs.writeFileSync(bak, raw);
    throw new Error(t('config.invalidJson', { file, message: e.message, bak }));
  }
  return normalize(parsed);
}

function normalizeMode(value) {
  return SETTINGS_MODES.includes(value) ? value : null;
}

function normalize(cfg) {
  const out = defaultConfig();
  if (cfg && typeof cfg === 'object') {
    if (cfg.version != null) out.version = cfg.version;
    if (typeof cfg.default === 'string' && cfg.default.length > 0) {
      out.default = cfg.default;
    }
    if (typeof cfg.lang === 'string' && cfg.lang.length > 0) {
      out.lang = cfg.lang;
    }
    if (typeof cfg.args === 'string') {
      out.args = cfg.args;
    }
    const rootMode = normalizeMode(cfg.settingsMode);
    if (rootMode) out.settingsMode = rootMode;
    if (UPDATE_MODES.includes(cfg.updateMode)) out.updateMode = cfg.updateMode;
    if (cfg.envs && typeof cfg.envs === 'object') {
      for (const [name, entry] of Object.entries(cfg.envs)) {
        if (!entry || typeof entry !== 'object') continue;
        const norm = {
          description: typeof entry.description === 'string' ? entry.description : '',
          env: entry.env && typeof entry.env === 'object' ? { ...entry.env } : {},
          args: typeof entry.args === 'string' ? entry.args : '',
          argsOverride: entry.argsOverride === true,
        };
        // Per-env settingsMode is optional; null means "inherit the global one".
        const envMode = normalizeMode(entry.settingsMode);
        norm.settingsMode = envMode || null;
        out.envs[name] = norm;
      }
    }
  }
  return out;
}

// Cheap, never-throwing read of just the `lang` field — used to resolve the UI
// language before the full config (and its localized errors) is loaded.
function peekLang() {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.lang === 'string' && parsed.lang) {
      return parsed.lang;
    }
  } catch {
    /* missing / unreadable / invalid — caller falls back to locale detection */
  }
  return null;
}

function save(cfg) {
  ensureConfigDir();
  const file = getConfigPath();
  const normalized = normalize(cfg);
  const content = JSON.stringify(normalized, null, 2) + '\n';
  // Write atomically: write to .tmp then rename, so a crash mid-write doesn't corrupt config.
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content, { mode: 0o600 });
  fs.renameSync(tmp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Windows or FS that doesn't support chmod — ignore.
  }
  return file;
}

function getEnv(cfg, name) {
  if (!name) return null;
  return cfg.envs[name] || null;
}

function listEnvNames(cfg) {
  return Object.keys(cfg.envs).sort();
}

function setDefault(cfg, name) {
  if (name == null || name === '') {
    cfg.default = null;
    return cfg;
  }
  if (!cfg.envs[name]) {
    throw new Error(t('config.envNotExistSimple', { name }));
  }
  cfg.default = name;
  return cfg;
}

// Resolve the effective settings mode for a launch. Precedence (high → low):
//   CLI -m  >  per-env settingsMode  >  global settingsMode  >  default
function resolveSettingsMode({ cliMode = null, entry = null, cfg = null } = {}) {
  if (normalizeMode(cliMode)) return normalizeMode(cliMode);
  if (entry && normalizeMode(entry.settingsMode)) return entry.settingsMode;
  if (cfg && normalizeMode(cfg.settingsMode)) return cfg.settingsMode;
  return DEFAULT_SETTINGS_MODE;
}

module.exports = {
  CONFIG_VERSION,
  KNOWN_ANTHROPIC_VARS,
  SETTINGS_MODES,
  DEFAULT_SETTINGS_MODE,
  UPDATE_MODES,
  DEFAULT_UPDATE_MODE,
  ENV_NAME_RE,
  isValidEnvName,
  getConfigDir,
  getConfigPath,
  getClaudeDir,
  getClaudeSettingsPath,
  defaultConfig,
  ensureConfigDir,
  load,
  save,
  peekLang,
  getEnv,
  listEnvNames,
  setDefault,
  resolveSettingsMode,
};
