'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const i18n = require('../src/i18n');
const templates = require('../src/templates');
const config = require('../src/config');

test('localize: string passes through, object resolves by lang with fallbacks', () => {
  i18n.setLang('zh-CN');
  assert.strictEqual(i18n.localize('plain'), 'plain');
  assert.strictEqual(i18n.localize({ en: 'Hello', 'zh-CN': '你好' }), '你好');
  // current lang missing → fall back to en
  assert.strictEqual(i18n.localize({ en: 'Hello', fr: 'Bonjour' }), 'Hello');
  // neither current nor en → first non-empty value
  assert.strictEqual(i18n.localize({ fr: 'Bonjour', de: 'Hallo' }), 'Bonjour');
  // empty / null → '' (caller renders nothing)
  assert.strictEqual(i18n.localize(null), '');
  assert.strictEqual(i18n.localize({}), '');
  assert.strictEqual(i18n.localize({ en: '   ' }), '');
  i18n.setLang('en');
});

test('normalizeTemplate drops non-string env values and malformed required items', () => {
  const tpl = templates.normalizeTemplate('x', {
    description: { en: 'X' },
    env: { A: 'a', B: 123, C: null },
    required: [
      { name: 'TOK', description: { en: 'token' } },
      { name: '', description: 'skip — empty name' },
      { description: 'skip — no name' },
      { name: 'WITH_DEFAULT', default: 'd' },
      { name: 'BAD_DEFAULT', default: 5 },
    ],
  }, 'file.json');

  assert.deepStrictEqual(tpl.env, { A: 'a' });
  assert.strictEqual(tpl.required.length, 3);
  assert.deepStrictEqual(tpl.required[0], { name: 'TOK', description: { en: 'token' } });
  assert.deepStrictEqual(tpl.required[1], { name: 'WITH_DEFAULT', description: null, default: 'd' });
  assert.deepStrictEqual(tpl.required[2], { name: 'BAD_DEFAULT', description: null }); // non-string default dropped
  assert.strictEqual(tpl.source, 'file.json');
});

test('buildEnvFromTemplate merges answers over the fixed env', () => {
  const tpl = {
    env: { ANTHROPIC_BASE_URL: 'https://x', ANTHROPIC_MODEL: 'm' },
    required: [{ name: 'ANTHROPIC_AUTH_TOKEN' }],
  };
  const env = templates.buildEnvFromTemplate(tpl, { ANTHROPIC_AUTH_TOKEN: 'sk-123' });
  assert.deepStrictEqual(env, {
    ANTHROPIC_BASE_URL: 'https://x',
    ANTHROPIC_MODEL: 'm',
    ANTHROPIC_AUTH_TOKEN: 'sk-123',
  });
  // No answers (empty required) → just the fixed env.
  assert.deepStrictEqual(templates.buildEnvFromTemplate(tpl, {}), {
    ANTHROPIC_BASE_URL: 'https://x',
    ANTHROPIC_MODEL: 'm',
  });
});

test('loadTemplates ships built-ins and a user file overrides by name', () => {
  const prev = process.env.CCE_CONFIG_HOME;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cce-tpl-'));
  process.env.CCE_CONFIG_HOME = dir;
  try {
    // Built-ins are available out of the box.
    const builtins = templates.loadTemplates();
    assert.ok(builtins.has('deepseek'));
    assert.ok(builtins.has('kimi'));

    // A user file overrides the built-in 'deepseek' wholesale and adds 'mine'.
    fs.writeFileSync(
      templates.userTemplatesPath(),
      JSON.stringify({
        deepseek: { description: 'custom ds', env: { ANTHROPIC_BASE_URL: 'https://custom' }, required: [] },
        mine: { description: 'mine', env: { ANTHROPIC_MODEL: 'z' }, required: [] },
      })
    );
    const merged = templates.loadTemplates();
    assert.strictEqual(merged.get('deepseek').env.ANTHROPIC_BASE_URL, 'https://custom');
    assert.ok(merged.has('mine'));
    assert.ok(merged.has('kimi')); // untouched built-in still present
  } finally {
    if (prev === undefined) delete process.env.CCE_CONFIG_HOME;
    else process.env.CCE_CONFIG_HOME = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadTemplates --templates path wins over user + built-in, errors when missing', () => {
  const prev = process.env.CCE_CONFIG_HOME;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cce-tpl-'));
  process.env.CCE_CONFIG_HOME = dir;
  try {
    const extra = path.join(dir, 'team.json');
    fs.writeFileSync(extra, JSON.stringify({ deepseek: { env: { ANTHROPIC_BASE_URL: 'https://team' }, required: [] } }));

    const merged = templates.loadTemplates({ extraPath: extra });
    assert.strictEqual(merged.get('deepseek').env.ANTHROPIC_BASE_URL, 'https://team');

    // Missing --templates file is a hard error.
    assert.throws(
      () => templates.loadTemplates({ extraPath: path.join(dir, 'nope.json') }),
      templates.TemplateError
    );

    // Malformed JSON is a hard error too.
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, '{ not json');
    assert.throws(() => templates.loadTemplates({ extraPath: bad }), templates.TemplateError);
  } finally {
    if (prev === undefined) delete process.env.CCE_CONFIG_HOME;
    else process.env.CCE_CONFIG_HOME = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('isValidEnvName matches the schema name rule', () => {
  assert.ok(config.isValidEnvName('deepseek'));
  assert.ok(config.isValidEnvName('kimi-k2.6_v4'));
  assert.ok(!config.isValidEnvName('-leading-dash'));
  assert.ok(!config.isValidEnvName('has space'));
  assert.ok(!config.isValidEnvName(''));
});
