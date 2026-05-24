'use strict';

const log = require('../util/log');
const pc = log.colors;
const pkg = require('../../package.json');

function run() {
  const lines = [
    `${pc.bold('cce')} ${pc.dim('v' + pkg.version)} — Claude Code Env Launcher`,
    '',
    pc.bold('USAGE'),
    `  cce [options]                          ${pc.dim('launch claude with default or selected env')}`,
    `  cce <subcommand> [args...]             ${pc.dim('manage envs')}`,
    '',
    pc.bold('LAUNCH OPTIONS'),
    `  -e, --env <name>        Use a specific env for this launch`,
    `  -a "<args>"             Merge claude args with config defaults (repeatable)`,
    `  -A "<args>"             Override config defaults, use only these args`,
    `                          (bare -A at end of command = launch with no args)`,
    `  -h, --help              Show this help`,
    `  -v, --version           Show version`,
    '',
    pc.bold('SUBCOMMANDS'),
    `  list, ls                List all envs`,
    `  show <name>             Show an env's variables + merged claude args`,
    `  edit                    Open config.json in $EDITOR (add/edit/remove envs by hand)`,
    `  use <name>              Set the default env (or --none to clear)`,
    `  current                 Print the default env name`,
    `  pick [-a/-A ...]        Interactively pick an env, then launch claude`,
    `  completion <shell>      Output shell completion script (bash|zsh|powershell|fish)`,
    `  help                    Show this help`,
    '',
    pc.bold('EXAMPLES'),
    `  cce edit                                                 ${pc.dim('# open config.json to add your first env')}`,
    `  cce use deepseek                                         ${pc.dim('# set deepseek as default')}`,
    `  cce                                                      ${pc.dim('# launch claude (default env + config args)')}`,
    `  cce -e kimi                                              ${pc.dim('# switch env')}`,
    `  cce -e kimi -a "--permission-mode bypassPermissions"     ${pc.dim('# merge extra claude args')}`,
    `  cce -e kimi -a "-c"                                      ${pc.dim('# pass claude -c (continue) via -a')}`,
    `  cce -e kimi -A "--resume XYZ"                            ${pc.dim('# override all config defaults')}`,
    `  cce -e kimi -A                                           ${pc.dim('# launch claude with no args at all')}`,
    `  cce pick                                                 ${pc.dim('# interactive env picker')}`,
    '',
    pc.bold('ENVIRONMENT'),
    `  CCE_CONFIG_HOME   Override config dir (default: ~/.claude/cce/)`,
    `  CCE_CLAUDE_BIN    Override path to the claude executable`,
    `  CCE_QUIET=1       Suppress the [cce] startup lines`,
    `  CCE_DEBUG=1       Print stack traces on internal errors`,
    '',
    pc.dim('Config: ~/.claude/cce/config.json'),
  ];
  log.plain(lines.join('\n'));
  return 0;
}

module.exports = { run };
