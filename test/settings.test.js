'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { reconcileEnv } = require('../src/settings');

const userEnv = {
  ANTHROPIC_BASE_URL: 'https://USER',
  ANTHROPIC_AUTH_TOKEN: 'user-tok',
  FOO: 'bar',
};
const entryEnv = {
  ANTHROPIC_BASE_URL: 'https://ENTRY',
  ANTHROPIC_MODEL: 'kimi',
};

test('override: entry wins, stale anthropic key neutralized, non-anthropic untouched', () => {
  const { tempEnv, neutralized } = reconcileEnv({ entryEnv, userEnv, mode: 'override', parentEnv: {} });
  assert.deepStrictEqual(tempEnv, {
    ANTHROPIC_BASE_URL: 'https://ENTRY',
    ANTHROPIC_MODEL: 'kimi',
    ANTHROPIC_AUTH_TOKEN: '', // stale, neutralized
  });
  assert.deepStrictEqual(neutralized, ['ANTHROPIC_AUTH_TOKEN']);
  // FOO is not written — it falls through from the user layer untouched.
  assert.ok(!('FOO' in tempEnv));
});

test('merge-cce: temp file carries entry env only (entry wins on conflict via higher layer)', () => {
  const { tempEnv, neutralized } = reconcileEnv({ entryEnv, userEnv, mode: 'merge-cce', parentEnv: {} });
  assert.deepStrictEqual(tempEnv, {
    ANTHROPIC_BASE_URL: 'https://ENTRY',
    ANTHROPIC_MODEL: 'kimi',
  });
  assert.deepStrictEqual(neutralized, []);
});

test('merge-claude: conflicting keys omitted so settings.json wins; entry-only keys added', () => {
  const { tempEnv } = reconcileEnv({ entryEnv, userEnv, mode: 'merge-claude', parentEnv: {} });
  // BASE_URL is in both -> omitted (user wins). MODEL only in entry -> added.
  assert.deepStrictEqual(tempEnv, { ANTHROPIC_MODEL: 'kimi' });
});

test('override with empty entry (official): all stale anthropic keys neutralized', () => {
  const { tempEnv, neutralized } = reconcileEnv({ entryEnv: {}, userEnv, mode: 'override', parentEnv: {} });
  assert.deepStrictEqual(tempEnv, { ANTHROPIC_BASE_URL: '', ANTHROPIC_AUTH_TOKEN: '' });
  assert.deepStrictEqual(neutralized.sort(), ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL']);
});

test('${VAR} placeholders are expanded from parentEnv', () => {
  const { tempEnv } = reconcileEnv({
    entryEnv: { ANTHROPIC_AUTH_TOKEN: '${MYKEY}' },
    userEnv: {},
    mode: 'merge-cce',
    parentEnv: { MYKEY: 'sk-123' },
  });
  assert.strictEqual(tempEnv.ANTHROPIC_AUTH_TOKEN, 'sk-123');
});

test('no settings.json env + merge mode = empty temp env (no --settings needed)', () => {
  const { tempEnv } = reconcileEnv({ entryEnv: {}, userEnv: {}, mode: 'merge-cce', parentEnv: {} });
  assert.deepStrictEqual(tempEnv, {});
});
