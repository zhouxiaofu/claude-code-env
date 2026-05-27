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
//   { kind: 'launch', envName, mergeArgs, overrideArg }
//     - envName:     string | null
//     - mergeArgs:   string[]  — each from a `-a "..."`
//     - overrideArg: string | null  — from `-A "..."` (or '' for naked `-A` at end)
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

function launchResult(envName = null, mergeArgs = [], overrideArg = null, settingsMode = null) {
  return { kind: 'launch', envName, mergeArgs, overrideArg, settingsMode };
}

function parseLaunch(argv) {
  let envName = null;
  const mergeArgs = [];
  let overrideArg = null;
  let settingsMode = null;

  const setOverride = (val, tok) => {
    if (overrideArg !== null) {
      throw new ParseError(t('parser.overrideOnce', { tok }));
    }
    if (mergeArgs.length > 0) {
      throw new ParseError(t('parser.aAndAExclusive'));
    }
    overrideArg = val;
  };

  const pushMerge = (val, tok) => {
    if (overrideArg !== null) {
      throw new ParseError(t('parser.aAndAExclusive'));
    }
    mergeArgs.push(val);
  };

  const setMode = (val, tok) => {
    const mode = toMergeMode(val);
    if (!mode) throw new ParseError(t('parser.invalidMergeMode', { val }));
    settingsMode = mode;
  };

  let i = 0;
  while (i < argv.length) {
    const tok = argv[i];

    // -h / --help / -v / --version anywhere → treat as top-level
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

    // -m <mode> / --merge-mode <mode>
    if (tok === '-m' || tok === '--merge-mode') {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        throw new ParseError(t('parser.mergeModeRequiresValue', { tok }));
      }
      setMode(next, tok);
      i += 2;
      continue;
    }
    const modeEq = tok.match(/^(?:--merge-mode|-m)=(.*)$/);
    if (modeEq) {
      setMode(modeEq[1], tok);
      i += 1;
      continue;
    }

    // -a <value>
    if (tok === '-a') {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new ParseError(t('parser.aRequiresValue'));
      }
      pushMerge(next, tok);
      i += 2;
      continue;
    }
    // -a=<value>
    const aEq = tok.match(/^-a=(.*)$/);
    if (aEq) {
      pushMerge(aEq[1], tok);
      i += 1;
      continue;
    }

    // -A <value>  — value optional: bare `-A` at end of argv = empty override
    if (tok === '-A') {
      if (i + 1 >= argv.length) {
        setOverride('', tok);
        i += 1;
      } else {
        setOverride(argv[i + 1], tok);
        i += 2;
      }
      continue;
    }
    // -A=<value>  — empty value (`-A=`) explicitly allowed for mid-argv "no args"
    const AEq = tok.match(/^-A=(.*)$/);
    if (AEq) {
      setOverride(AEq[1], tok);
      i += 1;
      continue;
    }

    // Anything else is unknown. Give a helpful migration hint.
    const hint = argv[i + 1] && !argv[i + 1].startsWith('-')
      ? t('parser.unknownOptionQuoteHint')
      : '';
    throw new ParseError(t('parser.unknownOption', { tok, hint }));
  }

  return launchResult(envName, mergeArgs, overrideArg, settingsMode);
}

function normalizeSubcommand(name) {
  if (name === 'ls') return 'list';
  return name;
}

class ParseError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'ParseError';
  }
}

/**
 * Parse args for the `cce pick` subcommand: only -a/-A allowed.
 * Returns { mergeArgs, overrideArg }. Errors on -e (already picked) or unknown flags.
 */
function parsePickArgs(args) {
  const mergeArgs = [];
  let overrideArg = null;
  let settingsMode = null;
  let i = 0;

  const setOverride = (val, tok) => {
    if (overrideArg !== null) throw new ParseError(t('parser.overrideOnce', { tok }));
    if (mergeArgs.length > 0) throw new ParseError(t('parser.aAndAExclusive'));
    overrideArg = val;
  };
  const pushMerge = (val) => {
    if (overrideArg !== null) throw new ParseError(t('parser.aAndAExclusive'));
    mergeArgs.push(val);
  };
  const setMode = (val) => {
    const mode = toMergeMode(val);
    if (!mode) throw new ParseError(t('parser.invalidMergeMode', { val }));
    settingsMode = mode;
  };

  while (i < args.length) {
    const tok = args[i];

    if (tok === '-a') {
      const next = args[i + 1];
      if (next === undefined) throw new ParseError(t('parser.pickARequiresValue'));
      pushMerge(next);
      i += 2;
      continue;
    }
    const aEq = tok.match(/^-a=(.*)$/);
    if (aEq) { pushMerge(aEq[1]); i++; continue; }

    if (tok === '-A') {
      if (i + 1 >= args.length) { setOverride('', tok); i++; }
      else { setOverride(args[i + 1], tok); i += 2; }
      continue;
    }
    const AEq = tok.match(/^-A=(.*)$/);
    if (AEq) { setOverride(AEq[1], tok); i++; continue; }

    if (tok === '-m' || tok === '--merge-mode') {
      const next = args[i + 1];
      if (next === undefined || next.startsWith('-')) throw new ParseError(t('parser.mergeModeRequiresValue', { tok }));
      setMode(next); i += 2; continue;
    }
    const modeEq = tok.match(/^(?:--merge-mode|-m)=(.*)$/);
    if (modeEq) { setMode(modeEq[1]); i++; continue; }

    if (tok === '-e' || tok === '--env' || tok.startsWith('-e=') || tok.startsWith('--env=')) {
      throw new ParseError(t('parser.pickNoEnvFlag'));
    }
    throw new ParseError(t('parser.pickUnknownOption', { tok }));
  }

  return { mergeArgs, overrideArg, settingsMode };
}

module.exports = { parse, parsePickArgs, ParseError, SUBCOMMANDS };
