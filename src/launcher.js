'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crossSpawn = require('cross-spawn');

const { KNOWN_ANTHROPIC_VARS } = require('./config');
const { quoteArgs } = require('./util/args');
const log = require('./util/log');
const settings = require('./settings');
const { t } = require('./i18n');

function findClaudeBin() {
  if (process.env.CCE_CLAUDE_BIN) {
    return process.env.CCE_CLAUDE_BIN;
  }

  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const result = crossSpawn.sync(cmd, ['claude'], { stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.status === 0 && result.stdout) {
    const first = result.stdout.toString().split(/\r?\n/).find(Boolean);
    if (first) return first.trim();
  }

  const candidates = [];
  const home = os.homedir();
  if (process.platform === 'win32') {
    candidates.push(
      path.join(home, '.local', 'bin', 'claude.exe'),
      path.join(home, '.local', 'bin', 'claude.cmd'),
      path.join(process.env.APPDATA || '', 'npm', 'claude.cmd'),
    );
  } else {
    candidates.push(
      path.join(home, '.local', 'bin', 'claude'),
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
    );
  }
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

// The child's env is the parent env with the known Anthropic vars stripped, so
// a stale shell export can't shadow the values cce routes through the temp
// settings file (claude --settings). The actual provider env now lives in that
// settings file, not in process env — see src/settings.js.
function buildChildEnv(parentEnv = process.env) {
  const env = { ...parentEnv };
  for (const k of KNOWN_ANTHROPIC_VARS) {
    delete env[k];
  }
  return env;
}

function summarizeEnv(envName, entry, mode) {
  if (!entry) {
    return t('launcher.noEnvSummary');
  }
  const e = entry.env || {};
  const parts = [`env=${envName}`];
  if (e.ANTHROPIC_MODEL) parts.push(`model=${e.ANTHROPIC_MODEL}`);
  if (e.ANTHROPIC_BASE_URL) parts.push(`base_url=${e.ANTHROPIC_BASE_URL}`);
  if (mode) parts.push(`settings=${mode}`);
  return parts.join('  ');
}

function spawnClaude({ claudeBin, claudeArgs, env, envName, entry, mode, tempSettingsFile = null }) {
  log.info(summarizeEnv(envName, entry, mode));
  log.info('$ claude' + (claudeArgs.length ? ' ' + quoteArgs(claudeArgs) : ''));

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    settings.cleanupTempSettings(tempSettingsFile);
  };
  // Belt-and-suspenders: delete the temp settings file on any process exit,
  // even ones we don't route through the child handlers below.
  process.on('exit', cleanup);

  const child = crossSpawn(claudeBin, claudeArgs, {
    stdio: 'inherit',
    env,
  });

  child.on('error', (err) => {
    cleanup();
    log.error(t('launcher.spawnFailed', { message: err.message }));
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    cleanup();
    if (signal) {
      if (process.platform !== 'win32') {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(1);
    }
    process.exit(code ?? 0);
  });

  if (process.platform === 'win32') {
    process.on('SIGINT', () => {
      try { child.kill('SIGINT'); } catch { /* ignore */ }
    });
  }
}

module.exports = { findClaudeBin, buildChildEnv, spawnClaude, summarizeEnv };
