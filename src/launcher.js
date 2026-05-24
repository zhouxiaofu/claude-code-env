'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crossSpawn = require('cross-spawn');

const { KNOWN_ANTHROPIC_VARS } = require('./config');
const { expandEnvVars } = require('./util/expand');
const { quoteArgs } = require('./util/args');
const log = require('./util/log');

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

function buildChildEnv(entry, parentEnv = process.env) {
  const env = { ...parentEnv };

  // Always strip known Anthropic vars first so a previous shell export can't leak through.
  for (const k of KNOWN_ANTHROPIC_VARS) {
    delete env[k];
  }

  if (entry && entry.env) {
    for (const [k, v] of Object.entries(entry.env)) {
      const expanded = expandEnvVars(v, parentEnv);
      // An empty expanded value means "explicitly unset" — useful for the "official" env.
      if (expanded === '') {
        delete env[k];
      } else {
        env[k] = expanded;
      }
    }
  }
  return env;
}

function summarizeEnv(envName, entry) {
  if (!entry) {
    return `no env injected`;
  }
  const e = entry.env || {};
  const parts = [`env=${envName}`];
  if (e.ANTHROPIC_MODEL) parts.push(`model=${e.ANTHROPIC_MODEL}`);
  if (e.ANTHROPIC_BASE_URL) parts.push(`base_url=${e.ANTHROPIC_BASE_URL}`);
  return parts.join('  ');
}

function spawnClaude({ claudeBin, claudeArgs, env, envName, entry }) {
  log.info(summarizeEnv(envName, entry));
  log.info('$ claude' + (claudeArgs.length ? ' ' + quoteArgs(claudeArgs) : ''));

  const child = crossSpawn(claudeBin, claudeArgs, {
    stdio: 'inherit',
    env,
  });

  child.on('error', (err) => {
    log.error(`Failed to spawn claude: ${err.message}`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
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
