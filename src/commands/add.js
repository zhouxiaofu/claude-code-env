'use strict';

const config = require('../config');
const tpl = require('../templates');
const prompt = require('../util/prompt');
const { pick } = require('../util/picker');
const log = require('../util/log');
const i18n = require('../i18n');
const { t, localize } = i18n;
const pc = log.colors;

function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

// Parse `cce add` args: [template] [name] with a --from <path|url> override.
function parseArgs(args) {
  let from = null;
  const positionals = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--from') {
      const next = args[i + 1];
      if (next === undefined || next.startsWith('-')) {
        throw new tpl.TemplateError(t('template.fromNeedsValue'));
      }
      from = next;
      i += 1;
      continue;
    }
    const eq = a.match(/^--from=(.+)$/);
    if (eq) { from = eq[1]; continue; }
    if (a.startsWith('-')) throw new tpl.TemplateError(t('add.unknownOption', { tok: a }));
    positionals.push(a);
  }

  return {
    from,
    templateName: positionals[0] || null,
    envName: positionals[1] || null,
  };
}

async function run(args) {
  let opts;
  let templates;
  try {
    opts = parseArgs(args);
    templates = await tpl.loadTemplates({ from: opts.from });
  } catch (e) {
    if (e instanceof tpl.TemplateError) {
      log.error(e.message);
      return 1;
    }
    throw e;
  }

  // 1) Resolve which template.
  let template;
  if (opts.templateName) {
    template = templates.get(opts.templateName);
    if (!template) {
      log.error(t('add.templateNotFound', {
        name: opts.templateName,
        available: [...templates.keys()].sort().join(', '),
      }));
      return 1;
    }
  } else {
    if (!isInteractive()) {
      log.error(t('add.needTemplateArg'));
      return 1;
    }
    const picked = await pickTemplate(templates);
    if (!picked) { log.warn(t('cli.cancelled')); return 130; }
    template = templates.get(picked);
  }

  // 2) Fill the required fields (skipped entirely when there are none).
  const answers = {};
  if (template.required.length > 0) {
    if (!isInteractive()) {
      log.error(t('add.needInteractiveFill'));
      return 1;
    }
    for (const item of template.required) {
      const value = await promptField(item);
      if (value === null) { log.warn(t('cli.cancelled')); return 130; }
      answers[item.name] = value;
    }
  }

  const env = tpl.buildEnvFromTemplate(template, answers);

  // 3) Name the env + resolve any collision.
  const cfg = config.load();
  const name = await resolveEnvName(template, opts.envName, cfg);
  if (name === null) return 1; // resolveEnvName already reported why

  // 4) Write it. On overwrite, preserve any non-template fields the user added
  // by hand (args / argsOverride / settingsMode) — only the template-owned
  // fields (description + env) are replaced.
  cfg.envs[name] = {
    ...(cfg.envs[name] || {}),
    description: localize(template.description),
    env,
  };
  config.save(cfg);
  log.success(t('add.created', { name }));
  if (template.docs) log.info(t('add.docsHint', { url: template.docs }));

  // 5) Offer to make it the default (interactive only).
  if (isInteractive()) {
    const yes = await prompt.confirm(t('add.setDefaultPrompt', { name }) + ' ', false);
    if (yes) {
      config.setDefault(cfg, name);
      config.save(cfg);
      log.success(t('use.set', { name }));
    }
  }

  log.info(t('add.launchHint', { name }));
  return 0;
}

function pickTemplate(templates) {
  const items = [...templates.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tp) => ({ value: tp.name, label: tp.name, hint: localize(tp.description) }));
  return pick({ title: t('add.pickTitle'), items });
}

// Prompt one required field. Empty input accepts the default if present, else
// re-asks (the field is, after all, required). Returns the value or null on cancel.
async function promptField(item) {
  const desc = localize(item.description);
  const hasDefault = typeof item.default === 'string' && item.default !== '';
  const head = desc ? `${desc} (${item.name})` : item.name;
  const label = `${pc.bold(head)}${hasDefault ? pc.dim(` [${item.default}]`) : ''}: `;

  for (;;) {
    const ans = await prompt.question(label);
    if (ans === null) return null;
    const trimmed = ans.trim();
    if (trimmed === '') {
      if (hasDefault) return item.default;
      log.error(t('add.fieldRequired', { name: item.name }));
      continue;
    }
    return trimmed;
  }
}

// Resolve the final env name. Validates against the schema name rule and handles
// collisions (overwrite / rename). Logs its own errors; returns the name, or
// null when it cannot proceed (invalid/conflict in non-TTY, or user cancel).
async function resolveEnvName(template, preset, cfg) {
  const interactive = isInteractive();
  let candidate = preset;

  for (;;) {
    if (candidate == null) {
      if (!interactive) { candidate = template.name; }
      else {
        const ans = await prompt.question(`${pc.bold(t('add.enterName'))} ${pc.dim(`[${template.name}]`)}: `);
        if (ans === null) return null;
        candidate = ans.trim() === '' ? template.name : ans.trim();
      }
    } else {
      candidate = String(candidate).trim();
    }

    if (!config.isValidEnvName(candidate)) {
      log.error(t('add.invalidName', { name: candidate }));
      if (!interactive) return null;
      candidate = null;
      continue;
    }

    if (!cfg.envs[candidate]) return candidate;

    // Name already exists.
    if (!interactive) {
      log.error(t('add.nameExists', { name: candidate }));
      return null;
    }
    const choice = await pick({
      title: t('add.conflictTitle', { name: candidate }),
      items: [
        { value: 'overwrite', label: t('add.choiceOverwrite') },
        { value: 'rename', label: t('add.choiceRename') },
      ],
    });
    if (choice === null) return null;
    if (choice === 'overwrite') return candidate;
    candidate = null; // rename → ask again
  }
}

module.exports = { run, parseArgs };
