'use strict';

const log = require('./util/log');
const parser = require('./parser');
const config = require('./config');
const launcher = require('./launcher');
const settings = require('./settings');
const argsUtil = require('./util/args');
const i18n = require('./i18n');
const { t } = i18n;

async function run(argv) {
  // Resolve UI language up front: CCE_LANG env > config `lang` > OS locale > en.
  let configLang = null;
  try { configLang = config.peekLang(); } catch { /* ignore */ }
  i18n.setLang(i18n.resolveLang({ configLang }));

  let parsed;
  try {
    parsed = parser.parse(argv);
  } catch (e) {
    if (e instanceof parser.ParseError) {
      log.error(e.message);
      process.exit(2);
    }
    throw e;
  }

  try {
    switch (parsed.kind) {
      case 'help':
        return process.exit(require('./commands/help').run());
      case 'version':
        process.stdout.write(require('../package.json').version + '\n');
        return process.exit(0);
      case 'subcommand': {
        const code = await runSubcommand(parsed.name, parsed.args);
        // A numeric return = subcommand finished, exit with that code.
        // `undefined` = subcommand handed off to a spawned child (e.g. `cce pick`
        // launching claude); leave the event loop alive so the child's exit
        // handler can take over.
        if (typeof code === 'number') process.exit(code);
        return;
      }
      case 'launch':
        return runLaunch(parsed);
    }
  } catch (e) {
    log.error(e.message || String(e));
    if (process.env.CCE_DEBUG === '1' && e.stack) {
      process.stderr.write(e.stack + '\n');
    }
    process.exit(1);
  }
}

async function runSubcommand(name, args) {
  switch (name) {
    case 'list':       return require('./commands/list').run(args);
    case 'add':        return await require('./commands/add').run(args);
    case 'remove':     return await require('./commands/remove').run(args);
    case 'template':   return await require('./commands/template').run(args);
    case 'show':       return require('./commands/show').run(args);
    case 'edit':       return require('./commands/edit').run(args);
    case 'use':        return require('./commands/use').run(args);
    case 'current':    return require('./commands/current').run(args);
    case 'lang':       return require('./commands/lang').run(args);
    case 'pick':       return await require('./commands/pick').run(args);
    case 'completion': return await require('./commands/completion').run(args);
    case 'update':     return await require('./commands/update').run(args);
    case 'help':       return require('./commands/help').run();
    default:
      log.error(`Unknown subcommand: ${name}`);
      return 1;
  }
}

async function runLaunch({ envName: envArg, mergeArgs, overrideArg, settingsMode }) {
  // Self-update check before launching claude (notify/auto per config). Fully
  // guarded — never blocks or breaks the launch.
  await require('./update').maybeCheckOnLaunch();

  const cfg = config.load();
  let envName = envArg || cfg.default || null;

  // If the env we resolved came from `default` (not an explicit -e) and points
  // to something that no longer exists, warn and fall through to the picker
  // fallback below. An explicit `-e ghost` still errors hard inside launchClaudeWithEnv.
  if (envName && !envArg && !config.getEnv(cfg, envName)) {
    log.warn(t('cli.defaultMissing', { name: envName }));
    envName = null;
  }

  // Picker fallback: no env resolved + TTY + has at least one env.
  if (!envName && process.stdin.isTTY && process.stdout.isTTY && config.listEnvNames(cfg).length > 0) {
    const { pickFromConfig } = require('./commands/pick');
    envName = await pickFromConfig(cfg);
    if (!envName) {
      log.warn(t('cli.cancelled'));
      process.exit(130);
    }
  }

  return launchClaudeWithEnv({ envName, mergeArgs, overrideArg, settingsMode, cfg });
}

/**
 * Spawn claude with the env named `envName` (or no injection if null),
 * applying the args-merging rules from src/util/args.js and reconciling the
 * env into a temp settings file passed via `claude --settings`.
 *
 * @param {object} opts
 * @param {string|null} opts.envName
 * @param {string[]=}   opts.mergeArgs    array of -a values (default [])
 * @param {string|null=} opts.overrideArg the -A value, or null if not used
 * @param {string|null=} opts.settingsMode CLI -m mode, or null to inherit config
 * @param {object=}     opts.cfg          pre-loaded config (optional, saves a re-read)
 */
function launchClaudeWithEnv({ envName, mergeArgs = [], overrideArg = null, settingsMode = null, cfg = null }) {
  if (!cfg) cfg = config.load();

  let entry = null;
  if (envName) {
    entry = config.getEnv(cfg, envName);
    if (!entry) {
      const available = config.listEnvNames(cfg).join(', ') || '(none)';
      log.error(t('cli.envNotExist', { name: envName, available }));
      log.warn(t('cli.envNotExistHint'));
      process.exit(1);
    }
  } else {
    log.warn(t('cli.noEnvInjected'));
  }

  const claudeBin = launcher.findClaudeBin();
  if (!claudeBin) {
    log.error(t('cli.claudeNotFound'));
    log.plain(t('cli.claudeNotFoundInstall'));
    log.plain(t('cli.claudeNotFoundBin'));
    process.exit(127);
  }

  const childEnv = launcher.buildChildEnv(process.env);

  // Reconcile the env into a temp settings file (claude --settings). Sweep any
  // orphans from crashed sessions first. Only created when there's something to
  // write; spawnClaude deletes it on exit.
  settings.sweepOrphans();
  const mode = config.resolveSettingsMode({ cliMode: settingsMode, entry, cfg });
  let tempSettingsFile = null;
  const settingsArgs = [];
  if (entry) {
    const prep = settings.prepareSettings({ entry, mode, parentEnv: process.env });
    tempSettingsFile = prep.file;
    if (prep.file) {
      settingsArgs.push('--settings', prep.file);
    }
    if (prep.neutralized.length > 0) {
      log.info(t('settings.leakWarn', {
        count: prep.neutralized.length,
        keys: prep.neutralized.join(', '),
      }));
    }
  }

  const claudeArgs = [
    ...settingsArgs,
    ...argsUtil.buildClaudeArgs({
      globalArgs: cfg.args || '',
      envEntry: entry,
      mergeArgs,
      overrideArg,
    }),
  ];

  launcher.spawnClaude({
    claudeBin,
    claudeArgs,
    env: childEnv,
    envName: envName || '(none)',
    entry,
    mode: entry ? mode : null,
    tempSettingsFile,
  });
}

module.exports = { run, launchClaudeWithEnv };
