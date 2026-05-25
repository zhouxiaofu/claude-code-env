'use strict';

const config = require('../config');
const log = require('../util/log');
const { t } = require('../i18n');

function run() {
  const cfg = config.load();
  if (cfg.default) {
    log.plain(cfg.default);
    if (!cfg.envs[cfg.default]) {
      log.warn(t('cli.defaultMissing', { name: cfg.default }));
    }
  } else {
    log.plain('(none)');
  }
  return 0;
}

module.exports = { run };
