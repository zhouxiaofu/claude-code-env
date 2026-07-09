'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { buildClaudeArgs, buildLayers } = require('../src/util/args');

test('cliTokens merge on top of global + env defaults', () => {
  const out = buildClaudeArgs({
    globalArgs: '--permission-mode bypassPermissions',
    envEntry: { args: '--verbose' },
    cliTokens: ['--continue'],
  });
  assert.deepStrictEqual(out, ['--permission-mode', 'bypassPermissions', '--verbose', '--continue']);
});

test('only=true drops global + env default layers, keeps cliTokens', () => {
  const out = buildClaudeArgs({
    globalArgs: '--permission-mode bypassPermissions',
    envEntry: { args: '--verbose' },
    cliTokens: ['--resume', 'XYZ'],
    only: true,
  });
  assert.deepStrictEqual(out, ['--resume', 'XYZ']);
});

test('only=true with no cliTokens yields empty args', () => {
  const out = buildClaudeArgs({
    globalArgs: '--permission-mode bypassPermissions',
    envEntry: { args: '--verbose' },
    only: true,
  });
  assert.deepStrictEqual(out, []);
});

test('cliTokens surface as a single CLI layer for `cce show`', () => {
  const layers = buildLayers({ globalArgs: '--verbose', cliTokens: ['--name', 'data'] });
  assert.strictEqual(layers.length, 2);
  assert.strictEqual(layers[1].source, 'CLI');
  assert.deepStrictEqual(layers[1].tokens, ['--name', 'data']);
});

test('legacy overrideArg path still wins (used by cce show)', () => {
  const layers = buildLayers({ globalArgs: '--verbose', overrideArg: '--resume X' });
  assert.strictEqual(layers.length, 1);
  assert.strictEqual(layers[0].source, 'CLI -A');
});
