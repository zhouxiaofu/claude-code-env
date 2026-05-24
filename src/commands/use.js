'use strict';

const config = require('../config');
const log = require('../util/log');

function run(args) {
  const cfg = config.load();

  if (args.length === 0 || args[0] === '--none') {
    config.setDefault(cfg, null);
    config.save(cfg);
    log.success('Cleared default env. Bare `cce` will not inject env.');
    return 0;
  }

  const name = args[0];
  if (!cfg.envs[name]) {
    const available = config.listEnvNames(cfg).join(', ') || '(none)';
    log.error(`Env "${name}" does not exist. Available: ${available}`);
    return 1;
  }

  config.setDefault(cfg, name);
  config.save(cfg);
  log.success(`Default env set to "${name}".`);
  return 0;
}

module.exports = { run };
