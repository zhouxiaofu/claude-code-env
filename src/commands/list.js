'use strict';

const config = require('../config');
const log = require('../util/log');
const pc = log.colors;

function run() {
  const cfg = config.load();
  const names = config.listEnvNames(cfg);

  if (names.length === 0) {
    log.warn('No envs configured. Run `cce edit` to create one.');
    return 0;
  }

  const defaultName = cfg.default;
  const nameWidth = Math.max(...names.map((n) => n.length));

  log.plain(pc.bold('Available envs:'));
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
        pc.dim(`Default: ${defaultName}  `) +
        pc.yellow(`⚠ does not exist — fix with \`cce use <name>\` or \`cce edit\``)
      );
    } else {
      log.plain(pc.dim(`Default: ${defaultName}  (use \`cce use <name>\` to change)`));
    }
  } else {
    log.plain(pc.dim('No default env. Bare `cce` will open the picker.'));
  }
  return 0;
}

module.exports = { run };
