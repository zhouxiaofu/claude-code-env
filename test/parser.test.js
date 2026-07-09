'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const parser = require('../src/parser');

test('launch result shape: settingsMode/cliTokens/only default when bare', () => {
  const r = parser.parse(['-e', 'kimi']);
  assert.strictEqual(r.kind, 'launch');
  assert.strictEqual(r.envName, 'kimi');
  assert.strictEqual(r.settingsMode, null);
  assert.deepStrictEqual(r.cliTokens, []);
  assert.strictEqual(r.only, false);
});

test('-m maps short tokens to internal mode names', () => {
  assert.strictEqual(parser.parse(['-e', 'k', '-m', 'override']).settingsMode, 'override');
  assert.strictEqual(parser.parse(['-e', 'k', '-m', 'cce']).settingsMode, 'merge-cce');
  assert.strictEqual(parser.parse(['-e', 'k', '--merge-mode', 'claude']).settingsMode, 'merge-claude');
  assert.strictEqual(parser.parse(['-m=cce', '-e', 'k']).settingsMode, 'merge-cce');
});

test('-m rejects unknown values', () => {
  assert.throws(() => parser.parse(['-m', 'bogus']), parser.ParseError);
});

test('-- passthrough collects everything after it verbatim', () => {
  const r = parser.parse(['-e', 'kimi', '--', '--permission-mode', 'bypassPermissions']);
  assert.deepStrictEqual(r.cliTokens, ['--permission-mode', 'bypassPermissions']);
  assert.strictEqual(r.only, false);
});

test('-- does not re-parse cce flags after it', () => {
  const r = parser.parse(['-e', 'kimi', '--', '-o', '-h', '-e', 'other']);
  assert.deepStrictEqual(r.cliTokens, ['-o', '-h', '-e', 'other']);
  assert.strictEqual(r.only, false);
  assert.strictEqual(r.envName, 'kimi');
});

test('-o / --only sets only', () => {
  assert.strictEqual(parser.parse(['-e', 'k', '-o']).only, true);
  assert.strictEqual(parser.parse(['-e', 'k', '--only']).only, true);
});

test('-o composes with -- passthrough', () => {
  const r = parser.parse(['-e', 'k', '-o', '--', '--resume', 'XYZ']);
  assert.strictEqual(r.only, true);
  assert.deepStrictEqual(r.cliTokens, ['--resume', 'XYZ']);
});

test('-c / --continue expands to --continue', () => {
  assert.deepStrictEqual(parser.parse(['-e', 'k', '-c']).cliTokens, ['--continue']);
  assert.deepStrictEqual(parser.parse(['-e', 'k', '--continue']).cliTokens, ['--continue']);
});

test('-r resume: bare and with value', () => {
  assert.deepStrictEqual(parser.parse(['-e', 'k', '-r']).cliTokens, ['--resume']);
  assert.deepStrictEqual(parser.parse(['-e', 'k', '-r', 'XYZ']).cliTokens, ['--resume', 'XYZ']);
  assert.deepStrictEqual(parser.parse(['-e', 'k', '-r=XYZ']).cliTokens, ['--resume', 'XYZ']);
  // a following flag is not swallowed as the resume value
  assert.deepStrictEqual(parser.parse(['-e', 'k', '-r', '-c']).cliTokens, ['--resume', '--continue']);
});

test('-n name: requires a value', () => {
  assert.deepStrictEqual(parser.parse(['-e', 'k', '-n', 'data']).cliTokens, ['--name', 'data']);
  assert.deepStrictEqual(parser.parse(['-e', 'k', '--name=data']).cliTokens, ['--name', 'data']);
  assert.throws(() => parser.parse(['-e', 'k', '-n']), parser.ParseError);
  assert.throws(() => parser.parse(['-e', 'k', '-n', '-c']), parser.ParseError);
});

test('removed -a throws a migration error', () => {
  assert.throws(() => parser.parse(['-e', 'k', '-a', '--foo']), parser.ParseError);
  assert.throws(() => parser.parse(['-a=--foo']), parser.ParseError);
});

test('removed -A throws a migration error', () => {
  assert.throws(() => parser.parse(['-e', 'k', '-A', '--resume XYZ']), parser.ParseError);
  assert.throws(() => parser.parse(['-A']), parser.ParseError);
});

test('unknown flag (no --) still errors', () => {
  assert.throws(() => parser.parse(['-e', 'k', '--resume-nope']), parser.ParseError);
});

test('pick args accept -o / -c / -r / -n / -m and --, reject -e and -a', () => {
  const r = parser.parsePickArgs(['-m', 'claude', '-o', '-c', '--', '--resume', 'XYZ']);
  assert.strictEqual(r.settingsMode, 'merge-claude');
  assert.strictEqual(r.only, true);
  assert.deepStrictEqual(r.cliTokens, ['--continue', '--resume', 'XYZ']);
  assert.throws(() => parser.parsePickArgs(['-e', 'kimi']), parser.ParseError);
  assert.throws(() => parser.parsePickArgs(['-a', '--foo']), parser.ParseError);
});
