'use strict';

const config = require('../config');
const log = require('../util/log');
const { pick } = require('../util/picker');
const { parsePickArgs, ParseError } = require('../parser');

/**
 * Show the env picker for the loaded config. Returns the chosen env name,
 * or null if cancelled / no envs / not a TTY. Also handles the single-env
 * shortcut (auto-select) and the empty-envs error.
 *
 * Exported so that bare `cce` can call into the same picker when no default
 * is set.
 */
async function pickFromConfig(cfg) {
  const names = config.listEnvNames(cfg);

  if (names.length === 0) {
    log.error('No envs configured. Run `cce edit` to create one.');
    return null;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    log.error('Interactive picker requires a TTY. Use `cce -e <name>` instead.');
    log.plain(`  available envs: ${names.join(', ')}`);
    return null;
  }

  // Skip the menu for a 1-env config — nothing meaningful to pick.
  if (names.length === 1) {
    log.info(`only env configured: ${names[0]} — using it`);
    return names[0];
  }

  const items = names.map((name) => {
    const entry = cfg.envs[name];
    return {
      value: name,
      label: name,
      hint: entry.description || entry.env?.ANTHROPIC_BASE_URL || '',
      marker: name === cfg.default ? '*' : '',
    };
  });

  return await pick({
    title: 'Pick an env to launch claude:',
    items,
    initialValue: cfg.default || items[0].value,
  });
}

/**
 * `cce pick [-a "..."] [-A "..."]` — show menu, then spawn claude with chosen env.
 */
async function run(args) {
  let parsed;
  try {
    parsed = parsePickArgs(args);
  } catch (e) {
    if (e instanceof ParseError) {
      log.error(e.message);
      return 2;
    }
    throw e;
  }

  const cfg = config.load();
  const chosen = await pickFromConfig(cfg);
  if (!chosen) {
    log.warn('Cancelled.');
    return 130;
  }
  // Hand off to the shared launch helper. spawnClaude is async — it returns
  // immediately after spawning, then waits for the child via its 'exit' handler
  // (which calls process.exit with claude's exit code).
  //
  // IMPORTANT: return `undefined` (not a number) so cli.js's subcommand dispatch
  // does NOT call process.exit on us. If we returned 0 here, cce would exit
  // immediately, releasing claude's stdio and killing claude before it starts.
  require('../cli').launchClaudeWithEnv({
    envName: chosen,
    mergeArgs: parsed.mergeArgs,
    overrideArg: parsed.overrideArg,
    cfg,
  });
  // intentional: no return value → cli.js will not process.exit on us
}

module.exports = { run, pickFromConfig };
