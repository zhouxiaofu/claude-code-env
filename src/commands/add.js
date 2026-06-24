'use strict';

const config = require('../config');
const tpl = require('../templates');
const expr = require('../util/expr');
const prompt = require('../util/prompt');
const { pick } = require('../util/picker');
const log = require('../util/log');
const i18n = require('../i18n');
const { t, localize } = i18n;
const pc = log.colors;

// Thrown when the user cancels an interactive prompt (Ctrl+C / Esc). Distinct
// from TemplateError so run() can exit 130 instead of printing an error.
class CancelError extends Error {}

function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

// Parse `cce add` args: [template] [name] with --from <path|url> and repeatable
// --set key=value (pre-answers fields/selects for non-interactive use).
function parseArgs(args) {
  let from = null;
  const sets = new Map();
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
    const fromEq = a.match(/^--from=(.+)$/);
    if (fromEq) { from = fromEq[1]; continue; }

    if (a === '--set') {
      const next = args[i + 1];
      if (next === undefined) throw new tpl.TemplateError(t('add.badSet', { tok: a }));
      addSet(sets, next);
      i += 1;
      continue;
    }
    const setEq = a.match(/^--set=(.+)$/);
    if (setEq) { addSet(sets, setEq[1]); continue; }

    if (a.startsWith('-')) throw new tpl.TemplateError(t('add.unknownOption', { tok: a }));
    positionals.push(a);
  }

  return { from, sets, templateName: positionals[0] || null, envName: positionals[1] || null };
}

function addSet(sets, pair) {
  const eq = pair.indexOf('=');
  if (eq <= 0) throw new tpl.TemplateError(t('add.badSet', { tok: pair }));
  sets.set(pair.slice(0, eq), pair.slice(eq + 1));
}

async function run(args) {
  let opts;
  let templates;
  try {
    opts = parseArgs(args);
    templates = await tpl.loadTemplates({ from: opts.from });
  } catch (e) {
    if (e instanceof tpl.TemplateError) { log.error(e.message); return 1; }
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
    if (!isInteractive()) { log.error(t('add.needTemplateArg')); return 1; }
    const picked = await pickTemplate(templates);
    if (!picked) { log.warn(t('cli.cancelled')); return 130; }
    template = templates.get(picked);
  }

  // 2) Walk the input tree, collecting answers into a vars namespace + env.
  const ctx = {
    interactive: isInteractive(),
    answers: opts.sets,
    vars: {},
    envT: { ...template.env }, // author values, interpolated at the end
    envLit: {}, // user-typed values, kept literal
  };
  let env;
  try {
    await collectInputs(template.inputs, ctx);
    env = finalizeEnv(ctx);
  } catch (e) {
    if (e instanceof CancelError) { log.warn(t('cli.cancelled')); return 130; }
    if (e instanceof tpl.TemplateError) { log.error(e.message); return 1; }
    throw e;
  }

  // 3) Name the env (suggested from the template's name expression), resolve collisions.
  const cfg = config.load();
  const def = suggestName(template, ctx.vars);
  const name = await resolveEnvName(opts.envName, def, cfg);
  if (name === null) return 1;

  // 4) Write it. Preserve any hand-added non-template fields on overwrite.
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

// --- input-tree collection --------------------------------------------------

async function collectInputs(inputs, ctx) {
  for (const node of inputs) {
    if (node.type === 'const') {
      Object.assign(ctx.vars, node.vars);
      Object.assign(ctx.envT, node.env);
    } else if (node.type === 'var') {
      ctx.vars[node.name] = await getInput(node, ctx);
    } else if (node.type === 'env') {
      if (node.value !== undefined) ctx.envT[node.name] = node.value;
      else ctx.envLit[node.name] = await getInput(node, ctx);
    } else if (node.type === 'select') {
      const opt = await choose(node, ctx);
      if (node.name) ctx.vars[node.name] = opt.name;
      await collectInputs(opt.inputs, ctx);
    }
  }
}

// Resolve one env/var leaf value: --set, else prompt, else error (non-TTY).
async function getInput(node, ctx) {
  if (ctx.answers.has(node.name)) return ctx.answers.get(node.name);
  if (!ctx.interactive) throw new tpl.TemplateError(t('add.missingField', { name: node.name }));

  const desc = localize(node.description);
  const hasDefault = typeof node.default === 'string' && node.default !== '';
  const head = desc ? `${desc} (${node.name})` : node.name;
  const label = `${pc.bold(head)}${hasDefault ? pc.dim(` [${node.default}]`) : ''}: `;
  for (;;) {
    const ans = await prompt.question(label);
    if (ans === null) throw new CancelError();
    const trimmed = ans.trim();
    if (trimmed === '') {
      if (hasDefault) return node.default;
      log.error(t('add.fieldRequired', { name: node.name }));
      continue;
    }
    return trimmed;
  }
}

// Resolve one select to a chosen option: single option auto-picks, --set by id,
// else menu, else error (non-TTY).
async function choose(select, ctx) {
  const options = select.options;
  if (options.length === 1) return options[0];

  const valid = options.map((o) => o.name).join(', ');
  if (select.name && ctx.answers.has(select.name)) {
    const want = ctx.answers.get(select.name);
    const opt = options.find((o) => o.name === want);
    if (!opt) throw new tpl.TemplateError(t('add.invalidOption', { name: select.name, value: want, valid }));
    return opt;
  }
  if (!ctx.interactive) {
    throw new tpl.TemplateError(t('add.missingSelect', { name: select.name || '?', valid }));
  }
  const title = localize(select.description) || t('add.selectTitle', { name: select.name || '' });
  const items = options.map((o) => ({ value: o.name, label: localize(o.label) || o.name }));
  const chosen = await pick({ title, items });
  if (chosen === null) throw new CancelError();
  return options.find((o) => o.name === chosen);
}

// After collection, interpolate author env values; user-typed values win on
// key collisions and are never interpolated.
function finalizeEnv(ctx) {
  const out = {};
  for (const k of Object.keys(ctx.envT)) {
    try {
      out[k] = expr.render(ctx.envT[k], ctx.vars, { strict: true });
    } catch (e) {
      const m = /undefined variable: (\w+)/.exec(e.message);
      if (m) throw new tpl.TemplateError(t('add.unresolvedVar', { key: k, var: m[1] }));
      throw new tpl.TemplateError(t('add.unresolvedVar', { key: k, var: '?' }));
    }
  }
  Object.assign(out, ctx.envLit);
  return out;
}

// --- naming -----------------------------------------------------------------

// Suggest a default env name from the template's name expression (or the
// template name when there's none / it fails to render to something valid).
function suggestName(template, vars) {
  if (!template.nameExpr) return template.name;
  let raw;
  try {
    raw = expr.render(template.nameExpr, vars, { strict: false });
  } catch {
    return template.name;
  }
  return sanitizeEnvName(raw) || template.name;
}

function sanitizeEnvName(s) {
  const cleaned = String(s).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '');
  return config.isValidEnvName(cleaned) ? cleaned : '';
}

// --- shared helpers ---------------------------------------------------------

function pickTemplate(templates) {
  const items = [...templates.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tp) => ({ value: tp.name, label: tp.name, hint: localize(tp.description) }));
  return pick({ title: t('add.pickTitle'), items });
}

// Resolve the final env name. `def` is the suggested default (from suggestName).
// Validates and handles collisions (overwrite / rename). Returns the name, or
// null when it cannot proceed (invalid/conflict in non-TTY, or user cancel).
async function resolveEnvName(preset, def, cfg) {
  const interactive = isInteractive();
  let candidate = preset;

  for (;;) {
    if (candidate == null) {
      if (!interactive) { candidate = def; }
      else {
        const ans = await prompt.question(`${pc.bold(t('add.enterName'))} ${pc.dim(`[${def}]`)}: `);
        if (ans === null) return null;
        candidate = ans.trim() === '' ? def : ans.trim();
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

    if (!interactive) { log.error(t('add.nameExists', { name: candidate })); return null; }
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
