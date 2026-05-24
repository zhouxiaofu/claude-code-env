'use strict';

const config = require('../config');
const log = require('../util/log');

function run() {
  const cfg = config.load();
  if (cfg.default) {
    log.plain(cfg.default);
    if (!cfg.envs[cfg.default]) {
      log.warn(`default env "${cfg.default}" does not exist in config (fix with \`cce use <name>\` or \`cce edit\`)`);
    }
  } else {
    log.plain('(none)');
  }
  return 0;
}

module.exports = { run };
