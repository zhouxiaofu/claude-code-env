'use strict';

const config = require('../config');
const log = require('../util/log');
const { pick } = require('../util/picker');
const { parsePickArgs, ParseError } = require('../parser');
const { t } = require('../i18n');

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
    log.error(t('list.noEnvs'));
    return null;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    log.error(t('pick.needTTY'));
    log.plain(t('pick.availableEnvs', { names: names.join(', ') }));
    return null;
  }

  // Skip the menu for a 1-env config — nothing meaningful to pick.
  if (names.length === 1) {
    log.info(t('pick.singleEnv', { name: names[0] }));
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
    title: t('pick.title'),
    items,
    initialValue: cfg.default || items[0].value,
  });
}

/**
 * `cce pick [-o] [-c] [-r [id]] [-n name] [-- claude args]` — show menu, then
 * spawn claude with the chosen env.
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

  // Same launch-time self-update check as bare `cce` / `cce -e`.
  await require('../update').maybeCheckOnLaunch();

  const cfg = config.load();
  const chosen = await pickFromConfig(cfg);
  if (!chosen) {
    log.warn(t('cli.cancelled'));
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
    cliTokens: parsed.cliTokens,
    only: parsed.only,
    settingsMode: parsed.settingsMode,
    cfg,
  });
  // intentional: no return value → cli.js will not process.exit on us
}

module.exports = { run, pickFromConfig };
