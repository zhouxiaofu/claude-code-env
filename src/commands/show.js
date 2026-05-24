'use strict';

const config = require('../config');
const log = require('../util/log');
const { maskEnvObject } = require('../util/mask');
const { buildLayers } = require('../util/args');
const pc = log.colors;

function run(args) {
  if (args.length === 0) {
    log.error('Usage: cce show <env>');
    return 1;
  }
  const name = args[0];
  const cfg = config.load();
  const entry = cfg.envs[name];
  if (!entry) {
    const available = config.listEnvNames(cfg).join(', ') || '(none)';
    log.error(`Env "${name}" does not exist. Available: ${available}`);
    return 1;
  }

  log.plain(pc.bold(`Env: ${name}`));
  if (entry.description) log.plain(pc.dim(entry.description));
  log.plain('');

  // --- Environment variables ---
  log.plain(pc.bold('Environment variables:'));
  const masked = maskEnvObject(entry.env);
  const keys = Object.keys(masked).sort();
  if (keys.length === 0) {
    log.plain(pc.dim('  (empty — no env injection)'));
  } else {
    const w = Math.max(...keys.map((k) => k.length));
    for (const k of keys) {
      log.plain(`  ${pc.cyan(k.padEnd(w))}  ${masked[k]}`);
    }
  }

  // --- Claude args (config layers) ---
  log.plain('');
  log.plain(pc.bold('Claude args (config):'));
  const layers = buildLayers({
    globalArgs: cfg.args || '',
    envEntry: entry,
    mergeArgs: [],
    overrideArg: null,
  });

  if (layers.length === 0) {
    log.plain(pc.dim('  (no defaults — claude launches with no extra args)'));
  } else {
    const rawWidth = Math.max(...layers.map((l) => l.raw.length));
    for (const l of layers) {
      const label = l.source === 'global' ? '(from global)' : '(from env)';
      log.plain(`  ${l.raw.padEnd(rawWidth)}   ${pc.dim(label)}`);
    }
    if (entry.argsOverride === true) {
      log.plain('');
      log.plain(pc.dim(`  argsOverride: true → global args dropped for this env`));
    }
  }
  return 0;
}

module.exports = { run };
