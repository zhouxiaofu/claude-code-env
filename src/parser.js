'use strict';

const SUBCOMMANDS = new Set([
  'list', 'ls',
  'show',
  'edit',
  'use',
  'current',
  'pick',
  'completion',
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

function launchResult(envName = null, mergeArgs = [], overrideArg = null) {
  return { kind: 'launch', envName, mergeArgs, overrideArg };
}

function parseLaunch(argv) {
  let envName = null;
  const mergeArgs = [];
  let overrideArg = null;

  const setOverride = (val, tok) => {
    if (overrideArg !== null) {
      throw new ParseError(`${tok} can only be specified once`);
    }
    if (mergeArgs.length > 0) {
      throw new ParseError(`-a and -A are mutually exclusive`);
    }
    overrideArg = val;
  };

  const pushMerge = (val, tok) => {
    if (overrideArg !== null) {
      throw new ParseError(`-a and -A are mutually exclusive`);
    }
    mergeArgs.push(val);
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
        throw new ParseError(`Option ${tok} requires an env name`);
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

    // -a <value>
    if (tok === '-a') {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new ParseError(`-a requires a value (e.g. -a "--permission-mode bypassPermissions")`);
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
    throw new ParseError(
      `Unknown option: ${tok}\n` +
      `cce does not pass unknown flags through to claude.\n` +
      `Claude args must be wrapped in -a "..." (merge) or -A "..." (override).\n` +
      `Try: cce -a "${tok}"${argv[i + 1] && !argv[i + 1].startsWith('-') ? ` (and quote the value)` : ''}`
    );
  }

  return launchResult(envName, mergeArgs, overrideArg);
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
  let i = 0;

  const setOverride = (val, tok) => {
    if (overrideArg !== null) throw new ParseError(`${tok} can only be specified once`);
    if (mergeArgs.length > 0) throw new ParseError(`-a and -A are mutually exclusive`);
    overrideArg = val;
  };
  const pushMerge = (val) => {
    if (overrideArg !== null) throw new ParseError(`-a and -A are mutually exclusive`);
    mergeArgs.push(val);
  };

  while (i < args.length) {
    const tok = args[i];

    if (tok === '-a') {
      const next = args[i + 1];
      if (next === undefined) throw new ParseError(`-a requires a value`);
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

    if (tok === '-e' || tok === '--env' || tok.startsWith('-e=') || tok.startsWith('--env=')) {
      throw new ParseError(`-e/--env not allowed with \`cce pick\` (the env is chosen via the menu)`);
    }
    throw new ParseError(`Unknown option for \`cce pick\`: ${tok} (only -a / -A are allowed)`);
  }

  return { mergeArgs, overrideArg };
}

module.exports = { parse, parsePickArgs, ParseError, SUBCOMMANDS };
