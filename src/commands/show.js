'use strict';

const config = require('../config');
const log = require('../util/log');
const { maskEnvObject } = require('../util/mask');
const { buildLayers } = require('../util/args');
const { t } = require('../i18n');
const pc = log.colors;

function run(args) {
  if (args.length === 0) {
    log.error(t('show.usage'));
    return 1;
  }
  const name = args[0];
  const cfg = config.load();
  const entry = cfg.envs[name];
  if (!entry) {
    const available = config.listEnvNames(cfg).join(', ') || '(none)';
    log.error(t('cli.envNotExist', { name, available }));
    return 1;
  }

  log.plain(pc.bold(t('show.envHeader', { name })));
  if (entry.description) log.plain(pc.dim(entry.description));
  log.plain('');

  // --- Environment variables ---
  log.plain(pc.bold(t('show.envVars')));
  const masked = maskEnvObject(entry.env);
  const keys = Object.keys(masked).sort();
  if (keys.length === 0) {
    log.plain(pc.dim(t('show.envEmpty')));
  } else {
    const w = Math.max(...keys.map((k) => k.length));
    for (const k of keys) {
      log.plain(`  ${pc.cyan(k.padEnd(w))}  ${masked[k]}`);
    }
  }

  // --- settings.json env reconciliation mode ---
  log.plain('');
  log.plain(pc.bold(t('show.settingsModeHeader')));
  const mode = config.resolveSettingsMode({ entry, cfg });
  const source = entry.settingsMode ? t('show.modeFromEnv') : t('show.modeFromGlobal');
  log.plain(t('show.settingsModeLine', { mode, source: pc.dim(source) }));
  log.plain(pc.dim('  ' + t(`mode.${mode}.desc`)));

  // --- Claude args (config layers) ---
  log.plain('');
  log.plain(pc.bold(t('show.claudeArgs')));
  const layers = buildLayers({
    globalArgs: cfg.args || '',
    envEntry: entry,
    mergeArgs: [],
    overrideArg: null,
  });

  if (layers.length === 0) {
    log.plain(pc.dim(t('show.argsEmpty')));
  } else {
    const rawWidth = Math.max(...layers.map((l) => l.raw.length));
    for (const l of layers) {
      const label = l.source === 'global' ? t('show.fromGlobal') : t('show.fromEnv');
      log.plain(`  ${l.raw.padEnd(rawWidth)}   ${pc.dim(label)}`);
    }
    if (entry.argsOverride === true) {
      log.plain('');
      log.plain(pc.dim('  ' + t('show.argsOverrideNote')));
    }
  }
  return 0;
}

module.exports = { run };
