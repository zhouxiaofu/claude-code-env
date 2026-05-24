'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

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

function getConfigDir() {
  if (process.env.CCE_CONFIG_HOME) {
    return path.resolve(process.env.CCE_CONFIG_HOME);
  }
  return path.join(os.homedir(), '.claude', 'cce');
}

function getConfigPath() {
  return path.join(getConfigDir(), 'config.json');
}

function defaultConfig() {
  return {
    version: CONFIG_VERSION,
    default: null,
    args: '',
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
    throw new Error(`Failed to read config at ${file}: ${e.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const bak = file + '.bak.' + Date.now();
    fs.writeFileSync(bak, raw);
    throw new Error(
      `Config at ${file} is not valid JSON: ${e.message}\nA backup of the broken file was saved at ${bak}. Please fix it or run \`cce edit\`.`
    );
  }
  return normalize(parsed);
}

function normalize(cfg) {
  const out = defaultConfig();
  if (cfg && typeof cfg === 'object') {
    if (cfg.version != null) out.version = cfg.version;
    if (typeof cfg.default === 'string' && cfg.default.length > 0) {
      out.default = cfg.default;
    }
    if (typeof cfg.args === 'string') {
      out.args = cfg.args;
    }
    if (cfg.envs && typeof cfg.envs === 'object') {
      for (const [name, entry] of Object.entries(cfg.envs)) {
        if (!entry || typeof entry !== 'object') continue;
        out.envs[name] = {
          description: typeof entry.description === 'string' ? entry.description : '',
          env: entry.env && typeof entry.env === 'object' ? { ...entry.env } : {},
          args: typeof entry.args === 'string' ? entry.args : '',
          argsOverride: entry.argsOverride === true,
        };
      }
    }
  }
  return out;
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

function setEnv(cfg, name, entry) {
  cfg.envs[name] = {
    description: entry.description || '',
    env: entry.env || {},
  };
  return cfg;
}

function removeEnv(cfg, name) {
  if (!cfg.envs[name]) return false;
  delete cfg.envs[name];
  if (cfg.default === name) cfg.default = null;
  return true;
}

function setDefault(cfg, name) {
  if (name == null || name === '') {
    cfg.default = null;
    return cfg;
  }
  if (!cfg.envs[name]) {
    throw new Error(`Env "${name}" does not exist`);
  }
  cfg.default = name;
  return cfg;
}

module.exports = {
  CONFIG_VERSION,
  KNOWN_ANTHROPIC_VARS,
  getConfigDir,
  getConfigPath,
  defaultConfig,
  ensureConfigDir,
  load,
  save,
  getEnv,
  listEnvNames,
  setEnv,
  removeEnv,
  setDefault,
};
