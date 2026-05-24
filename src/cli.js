'use strict';

const log = require('./util/log');
const parser = require('./parser');
const config = require('./config');
const launcher = require('./launcher');
const argsUtil = require('./util/args');

async function run(argv) {
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
    case 'show':       return require('./commands/show').run(args);
    case 'edit':       return require('./commands/edit').run(args);
    case 'use':        return require('./commands/use').run(args);
    case 'current':    return require('./commands/current').run(args);
    case 'pick':       return await require('./commands/pick').run(args);
    case 'completion': return require('./commands/completion').run(args);
    case 'help':       return require('./commands/help').run();
    default:
      log.error(`Unknown subcommand: ${name}`);
      return 1;
  }
}

async function runLaunch({ envName: envArg, mergeArgs, overrideArg }) {
  const cfg = config.load();
  let envName = envArg || cfg.default || null;

  // If the env we resolved came from `default` (not an explicit -e) and points
  // to something that no longer exists, warn and fall through to the picker
  // fallback below. An explicit `-e ghost` still errors hard inside launchClaudeWithEnv.
  if (envName && !envArg && !config.getEnv(cfg, envName)) {
    log.warn(`default env "${envName}" does not exist in config (fix with \`cce use <name>\` or \`cce edit\`)`);
    envName = null;
  }

  // Picker fallback: no env resolved + TTY + has at least one env.
  if (!envName && process.stdin.isTTY && process.stdout.isTTY && config.listEnvNames(cfg).length > 0) {
    const { pickFromConfig } = require('./commands/pick');
    envName = await pickFromConfig(cfg);
    if (!envName) {
      log.warn('Cancelled.');
      process.exit(130);
    }
  }

  return launchClaudeWithEnv({ envName, mergeArgs, overrideArg, cfg });
}

/**
 * Spawn claude with the env named `envName` (or no injection if null),
 * applying the args-merging rules from src/util/args.js.
 *
 * @param {object} opts
 * @param {string|null} opts.envName
 * @param {string[]=}   opts.mergeArgs   array of -a values (default [])
 * @param {string|null=} opts.overrideArg the -A value, or null if not used
 * @param {object=}     opts.cfg         pre-loaded config (optional, saves a re-read)
 */
function launchClaudeWithEnv({ envName, mergeArgs = [], overrideArg = null, cfg = null }) {
  if (!cfg) cfg = config.load();

  let entry = null;
  if (envName) {
    entry = config.getEnv(cfg, envName);
    if (!entry) {
      const available = config.listEnvNames(cfg).join(', ') || '(none)';
      log.error(`Env "${envName}" does not exist. Available: ${available}`);
      log.warn('Run `cce edit` to add an env, or `cce list` to see existing ones.');
      process.exit(1);
    }
  } else {
    log.warn('No env injected — launching claude as-is.');
  }

  const claudeBin = launcher.findClaudeBin();
  if (!claudeBin) {
    log.error('Could not find the `claude` executable.');
    log.plain('  • Install Claude Code: https://docs.claude.com/en/docs/claude-code/quickstart');
    log.plain('  • Or set CCE_CLAUDE_BIN to the full path of your claude binary.');
    process.exit(127);
  }

  const childEnv = launcher.buildChildEnv(entry, process.env);

  const claudeArgs = argsUtil.buildClaudeArgs({
    globalArgs: cfg.args || '',
    envEntry: entry,
    mergeArgs,
    overrideArg,
  });

  launcher.spawnClaude({
    claudeBin,
    claudeArgs,
    env: childEnv,
    envName: envName || '(none)',
    entry,
  });
}

module.exports = { run, launchClaudeWithEnv };
