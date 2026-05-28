'use strict';

const config = require('../config');
const log = require('../util/log');
const prompt = require('../util/prompt');
const { pick } = require('../util/picker');
const { t } = require('../i18n');

function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

// Parse `cce remove [-y] [<name>]`. Returns { name, yes } or { error }.
function parseArgs(args) {
  let yes = false;
  let name = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-y' || a === '--yes') { yes = true; continue; }
    if (a.startsWith('-')) return { error: t('remove.unknownOption', { tok: a }) };
    if (name !== null) return { error: t('remove.tooManyArgs') };
    name = a;
  }
  return { name, yes };
}

async function run(args) {
  const parsed = parseArgs(args);
  if (parsed.error) {
    log.error(parsed.error);
    return 1;
  }
  let { name } = parsed;
  const { yes } = parsed;

  const cfg = config.load();
  const names = config.listEnvNames(cfg);

  if (names.length === 0) {
    log.error(t('list.noEnvs'));
    return 1;
  }

  // No name given → picker (TTY only).
  if (name === null) {
    if (!isInteractive()) {
      log.error(t('remove.usage'));
      return 1;
    }
    const items = names.map((n) => {
      const entry = cfg.envs[n];
      return {
        value: n,
        label: n,
        hint: entry.description || entry.env?.ANTHROPIC_BASE_URL || '',
        marker: n === cfg.default ? '*' : '',
      };
    });
    name = await pick({ title: t('remove.pickTitle'), items });
    if (!name) {
      log.warn(t('cli.cancelled'));
      return 130;
    }
  }

  if (!cfg.envs[name]) {
    log.error(t('cli.envNotExist', { name, available: names.join(', ') }));
    return 1;
  }

  // Second confirmation — even for the picker path (Enter is too easy to misfire).
  if (!yes) {
    if (!isInteractive()) {
      log.error(t('remove.needYesNonTTY'));
      return 1;
    }
    const isDefault = cfg.default === name;
    const ok = await prompt.confirm(
      (isDefault ? t('remove.confirmDefault', { name }) : t('remove.confirm', { name })) + ' ',
      false
    );
    if (!ok) {
      log.warn(t('cli.cancelled'));
      return 130;
    }
  }

  const wasDefault = cfg.default === name;
  delete cfg.envs[name];
  if (wasDefault) cfg.default = null;
  config.save(cfg);

  log.success(t('remove.removed', { name }));
  if (wasDefault) log.info(t('remove.defaultCleared'));
  return 0;
}

module.exports = { run, parseArgs };
