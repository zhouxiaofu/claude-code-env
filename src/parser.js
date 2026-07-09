'use strict';

const { t } = require('./i18n');

// CLI tokens for -m / --merge-mode → internal settings mode names.
function toMergeMode(val) {
  switch (val) {
    case 'override': return 'override';
    case 'cce':
    case 'merge-cce': return 'merge-cce';
    case 'claude':
    case 'merge-claude': return 'merge-claude';
    default: return null;
  }
}

const SUBCOMMANDS = new Set([
  'list', 'ls',
  'add',
  'remove', 'rm',
  'template', 'tpl',
  'show',
  'edit',
  'use',
  'current',
  'lang',
  'pick',
  'completion',
  'update',
  'help',
]);

const HELP_FLAGS = new Set(['-h', '--help']);
const VERSION_FLAGS = new Set(['-v', '--version']);

// Parse argv into one of:
//   { kind: 'help' }
//   { kind: 'version' }
//   { kind: 'subcommand', name, args }
//   { kind: 'launch', envName, settingsMode, cliTokens, only }
//     - envName:      string | null
//     - settingsMode: 'override' | 'merge-cce' | 'merge-claude' | null
//     - cliTokens:    string[]  — claude args from -c/-r/-n (expanded to their
//                     long forms) plus everything after the `--` terminator.
//     - only:         boolean   — `-o/--only`: drop config-default args, use
//                     only cliTokens.
//
// The legacy `-a`/`-A` flags are removed: encountering either throws a
// ParseError that shows the `--` / `-o` rewrite (see consumeSharedFlag).
function parse(argv) {
  if (argv.length === 0) {
    return launchResult();
  }

  const first = argv[0];

  if (HELP_FLAGS.has(first)) return { kind: 'help' };
  if (VERSION_FLAGS.has(first)) return { kind: 'version' };

  if (SUBCOMMANDS.has(first)) {
    return { kind: 'subcommand', name: normalizeSubcommand(first), args: argv.slice(1) };
  }

  return parseLaunch(argv);
}

function launchResult(envName = null, settingsMode = null, cliTokens = [], only = false) {
  return { kind: 'launch', envName, settingsMode, cliTokens, only };
}

function requireMode(val) {
  const mode = toMergeMode(val);
  if (!mode) throw new ParseError(t('parser.invalidMergeMode', { val }));
  return mode;
}

// Build the copy-pasteable rewrite shown when a user hits removed `-a`/`-A`.
function rewriteMerge(val) {
  return val ? `cce -- ${val}` : 'cce --';
}
function rewriteOverride(val) {
  return val ? `cce -o -- ${val}` : 'cce -o';
}

/**
 * Handle the flags shared by `cce` (launch) and `cce pick`: the `--`
 * terminator, `-o/--only`, the first-class session flags `-c/-r/-n`, the
 * removed `-a/-A` (throws), and `-m/--merge-mode`.
 *
 * Mutates `state` ({ settingsMode, cliTokens, only }) and returns the number of
 * argv tokens consumed, or -1 if `tok` is not one of these shared flags.
 */
function consumeSharedFlag(argv, i, state) {
  const tok = argv[i];

  // `--` terminator: everything after goes verbatim to claude.
  if (tok === '--') {
    for (let j = i + 1; j < argv.length; j++) state.cliTokens.push(argv[j]);
    return argv.length - i;
  }

  // Removed legacy flags → hard error with a migration rewrite.
  if (tok === '-a' || tok.startsWith('-a=')) {
    const val = tok.startsWith('-a=') ? tok.slice(3) : (argv[i + 1] || '');
    throw new ParseError(t('parser.aRemoved', { rewrite: rewriteMerge(val) }));
  }
  if (tok === '-A' || tok.startsWith('-A=')) {
    const val = tok.startsWith('-A=') ? tok.slice(3) : (argv[i + 1] || '');
    throw new ParseError(t('parser.ARemoved', { rewrite: rewriteOverride(val) }));
  }

  // -o / --only → drop config-default args.
  if (tok === '-o' || tok === '--only') {
    state.only = true;
    return 1;
  }

  // -c / --continue (no value)
  if (tok === '-c' || tok === '--continue') {
    state.cliTokens.push('--continue');
    return 1;
  }

  // -n / --name <value> (value required)
  if (tok === '-n' || tok === '--name') {
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('-')) {
      throw new ParseError(t('parser.nameRequiresValue', { tok }));
    }
    state.cliTokens.push('--name', next);
    return 2;
  }
  const nameEq = tok.match(/^(?:--name|-n)=(.+)$/);
  if (nameEq) {
    state.cliTokens.push('--name', nameEq[1]);
    return 1;
  }

  // -r / --resume [value] (value optional, like claude)
  if (tok === '-r' || tok === '--resume') {
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('-')) {
      state.cliTokens.push('--resume', next);
      return 2;
    }
    state.cliTokens.push('--resume');
    return 1;
  }
  const resumeEq = tok.match(/^(?:--resume|-r)=(.*)$/);
  if (resumeEq) {
    state.cliTokens.push('--resume', resumeEq[1]);
    return 1;
  }

  // -m <mode> / --merge-mode <mode>
  if (tok === '-m' || tok === '--merge-mode') {
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('-')) {
      throw new ParseError(t('parser.mergeModeRequiresValue', { tok }));
    }
    state.settingsMode = requireMode(next);
    return 2;
  }
  const modeEq = tok.match(/^(?:--merge-mode|-m)=(.*)$/);
  if (modeEq) {
    state.settingsMode = requireMode(modeEq[1]);
    return 1;
  }

  return -1;
}

function parseLaunch(argv) {
  const state = { settingsMode: null, cliTokens: [], only: false };
  let envName = null;

  let i = 0;
  while (i < argv.length) {
    const tok = argv[i];

    // -h / --help / -v / --version anywhere (before `--`) → treat as top-level
    if (HELP_FLAGS.has(tok)) return { kind: 'help' };
    if (VERSION_FLAGS.has(tok)) return { kind: 'version' };

    // -e <name> / --env <name>
    if (tok === '-e' || tok === '--env') {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        throw new ParseError(t('parser.envRequiresName', { tok }));
      }
      envName = next;
      i += 2;
      continue;
    }
    // -e=<name> / --env=<name>
    const envEq = tok.match(/^(?:--env|-e)=(.+)$/);
    if (envEq) {
      envName = envEq[1];
      i += 1;
      continue;
    }

    const consumed = consumeSharedFlag(argv, i, state);
    if (consumed >= 0) {
      i += consumed;
      continue;
    }

    // Anything else is unknown. Point at the `--` passthrough.
    throw new ParseError(t('parser.unknownOption', { tok }));
  }

  return launchResult(envName, state.settingsMode, state.cliTokens, state.only);
}

function normalizeSubcommand(name) {
  if (name === 'ls') return 'list';
  if (name === 'rm') return 'remove';
  if (name === 'tpl') return 'template';
  return name;
}

class ParseError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'ParseError';
  }
}

/**
 * Parse args for the `cce pick` subcommand: the env is chosen via the menu, so
 * -e/--env is rejected. Everything else mirrors `cce` launch parsing.
 * Returns { settingsMode, cliTokens, only }.
 */
function parsePickArgs(args) {
  const state = { settingsMode: null, cliTokens: [], only: false };
  let i = 0;

  while (i < args.length) {
    const tok = args[i];

    if (tok === '-e' || tok === '--env' || tok.startsWith('-e=') || tok.startsWith('--env=')) {
      throw new ParseError(t('parser.pickNoEnvFlag'));
    }

    const consumed = consumeSharedFlag(args, i, state);
    if (consumed >= 0) {
      i += consumed;
      continue;
    }

    throw new ParseError(t('parser.pickUnknownOption', { tok }));
  }

  return { settingsMode: state.settingsMode, cliTokens: state.cliTokens, only: state.only };
}

module.exports = { parse, parsePickArgs, ParseError, SUBCOMMANDS };
