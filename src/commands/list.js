'use strict';

const config = require('../config');
const log = require('../util/log');
const { t } = require('../i18n');
const pc = log.colors;

function run() {
  const cfg = config.load();
  const names = config.listEnvNames(cfg);

  if (names.length === 0) {
    log.warn(t('list.noEnvs'));
    return 0;
  }

  const defaultName = cfg.default;
  const nameWidth = Math.max(...names.map((n) => n.length));

  log.plain(pc.bold(t('list.available')));
  for (const name of names) {
    const marker = name === defaultName ? pc.green('* ') : '  ';
    const padded = name.padEnd(nameWidth);
    const entry = cfg.envs[name];
    const desc = entry.description || '';
    const baseUrl = entry.env?.ANTHROPIC_BASE_URL || '';
    const right = desc || baseUrl;
    log.plain(`${marker}${pc.cyan(padded)}  ${pc.dim(right)}`);
  }
  log.plain('');
  if (defaultName) {
    if (!cfg.envs[defaultName]) {
      log.plain(
        pc.dim(t('list.defaultLabel', { name: defaultName }) + '  ') +
        pc.yellow(t('list.defaultMissingWarn'))
      );
    } else {
      log.plain(pc.dim(t('list.defaultLabel', { name: defaultName }) + '  ' + t('list.defaultChangeHint')));
    }
  } else {
    log.plain(pc.dim(t('list.noDefault')));
  }
  return 0;
}

module.exports = { run };
