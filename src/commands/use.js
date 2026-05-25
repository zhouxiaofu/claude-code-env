'use strict';

const config = require('../config');
const log = require('../util/log');
const { t } = require('../i18n');

function run(args) {
  const cfg = config.load();

  if (args.length === 0 || args[0] === '--none') {
    config.setDefault(cfg, null);
    config.save(cfg);
    log.success(t('use.cleared'));
    return 0;
  }

  const name = args[0];
  if (!cfg.envs[name]) {
    const available = config.listEnvNames(cfg).join(', ') || '(none)';
    log.error(t('cli.envNotExist', { name, available }));
    return 1;
  }

  config.setDefault(cfg, name);
  config.save(cfg);
  log.success(t('use.set', { name }));
  return 0;
}

module.exports = { run };
