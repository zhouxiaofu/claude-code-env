'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const parser = require('../src/parser');

test('launch result carries settingsMode (null when no -m)', () => {
  const r = parser.parse(['-e', 'kimi']);
  assert.strictEqual(r.kind, 'launch');
  assert.strictEqual(r.envName, 'kimi');
  assert.strictEqual(r.settingsMode, null);
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

test('pick args also accept -m', () => {
  const r = parser.parsePickArgs(['-m', 'claude', '-a', '-c']);
  assert.strictEqual(r.settingsMode, 'merge-claude');
  assert.deepStrictEqual(r.mergeArgs, ['-c']);
});

test('-a and -A stay mutually exclusive', () => {
  assert.throws(() => parser.parse(['-a', 'x', '-A', 'y']), parser.ParseError);
});
