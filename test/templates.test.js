'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const i18n = require('../src/i18n');
const templates = require('../src/templates');
const config = require('../src/config');

function withTempConfigHome(fn) {
  return async () => {
    const prev = process.env.CCE_CONFIG_HOME;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cce-tpl-'));
    process.env.CCE_CONFIG_HOME = dir;
    try {
      await fn(dir);
    } finally {
      if (prev === undefined) delete process.env.CCE_CONFIG_HOME;
      else process.env.CCE_CONFIG_HOME = prev;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test('localize: string passes through, object resolves by lang with fallbacks', () => {
  i18n.setLang('zh-CN');
  assert.strictEqual(i18n.localize('plain'), 'plain');
  assert.strictEqual(i18n.localize({ en: 'Hello', 'zh-CN': '你好' }), '你好');
  assert.strictEqual(i18n.localize({ en: 'Hello', fr: 'Bonjour' }), 'Hello');
  assert.strictEqual(i18n.localize({ fr: 'Bonjour', de: 'Hallo' }), 'Bonjour');
  assert.strictEqual(i18n.localize(null), '');
  assert.strictEqual(i18n.localize({}), '');
  assert.strictEqual(i18n.localize({ en: '   ' }), '');
  i18n.setLang('en');
});

test('normalizeTemplate parses the v2 inputs tree, dropping malformed nodes', () => {
  const tpl = templates.normalizeTemplate('x', {
    description: { en: 'X' },
    name: 'x-${plan}',
    docs: 'https://d',
    env: { A: 'a', B: 123, C: null, D: '${plan}' },
    inputs: [
      { type: 'env', name: 'TOK', description: { en: 'token' } },
      { name: 'DEFAULTED', value: 'lit' }, // type defaults to env; value → fixed, no prompt
      { type: 'env', name: '' }, // dropped: empty name
      { type: 'var', name: 'region', default: 'cn' },
      { type: 'const', vars: { x: '1', y: 2 }, env: { K: 'v' } },
      { type: 'select', name: 'plan', options: [
        { name: 'a', label: { en: 'A' }, inputs: [{ type: 'env', name: 'NESTED' }] },
        { name: '', label: {} }, // dropped option: empty name
      ] },
      { type: 'select', options: [] }, // dropped: no options
      { type: 'bogus' }, // dropped: unknown type
      'not an object', // dropped
    ],
  }, 'file.json');

  assert.deepStrictEqual(tpl.env, { A: 'a', D: '${plan}' });
  assert.strictEqual(tpl.nameExpr, 'x-${plan}');
  assert.strictEqual(tpl.docs, 'https://d');
  assert.strictEqual(tpl.inputs.length, 5);
  assert.deepStrictEqual(tpl.inputs[0], { type: 'env', name: 'TOK', description: { en: 'token' } });
  assert.deepStrictEqual(tpl.inputs[1], { type: 'env', name: 'DEFAULTED', description: null, value: 'lit' });
  assert.deepStrictEqual(tpl.inputs[2], { type: 'var', name: 'region', description: null, default: 'cn' });
  assert.deepStrictEqual(tpl.inputs[3], { type: 'const', vars: { x: '1' }, env: { K: 'v' } });
  const sel = tpl.inputs[4];
  assert.strictEqual(sel.type, 'select');
  assert.strictEqual(sel.name, 'plan');
  assert.strictEqual(sel.options.length, 1);
  assert.strictEqual(sel.options[0].name, 'a');
  assert.strictEqual(sel.options[0].inputs.length, 1);
  assert.strictEqual(tpl.source, 'file.json');
});

test('substituteUrlVars resolves ${version}, passes plain URLs, rejects unknown vars', () => {
  const v = String(templates.TEMPLATE_SCHEMA_VERSION);
  assert.strictEqual(
    templates.substituteUrlVars('https://x/builtin.v${version}.json'),
    `https://x/builtin.v${v}.json`
  );
  assert.strictEqual(templates.substituteUrlVars('https://x/static.json'), 'https://x/static.json');
  assert.throws(() => templates.substituteUrlVars('https://x/${nope}.json'), templates.TemplateError);
  // The default source resolves to the versioned file.
  assert.ok(templates.displayUrl({}).endsWith(`builtin.v${v}.json`));
});

test('isUrl distinguishes URLs from file paths', () => {
  assert.ok(templates.isUrl('https://x/y.json'));
  assert.ok(templates.isUrl('http://x/y.json'));
  assert.ok(!templates.isUrl('./team.json'));
  assert.ok(!templates.isUrl('C:\\templates.json'));
});

test('offline mode reads the remote cache file; user templates.json overlays', withTempConfigHome(async () => {
  const cfg = config.defaultConfig();
  cfg.template.offline = true; // never hit the network
  config.save(cfg);

  fs.writeFileSync(templates.remoteCachePath(), JSON.stringify({
    deepseek: { env: { ANTHROPIC_BASE_URL: 'https://ds' }, required: [] },
    kimi: { env: {}, required: [] },
  }));

  let map = await templates.loadTemplates();
  assert.ok(map.has('deepseek'));
  assert.ok(map.has('kimi'));
  assert.strictEqual(map.get('deepseek').env.ANTHROPIC_BASE_URL, 'https://ds');

  // User file overrides 'deepseek' wholesale and adds 'mine'.
  fs.writeFileSync(templates.userTemplatesPath(), JSON.stringify({
    deepseek: { env: { ANTHROPIC_BASE_URL: 'https://custom' }, required: [] },
    mine: { env: { ANTHROPIC_MODEL: 'z' }, required: [] },
  }));
  map = await templates.loadTemplates();
  assert.strictEqual(map.get('deepseek').env.ANTHROPIC_BASE_URL, 'https://custom');
  assert.ok(map.has('mine'));
  assert.ok(map.has('kimi'));
}));

test('offline mode with no cache file throws a TemplateError', withTempConfigHome(async () => {
  const cfg = config.defaultConfig();
  cfg.template.offline = true;
  config.save(cfg);
  await assert.rejects(() => templates.loadTemplates(), templates.TemplateError);
}));

test('--from a file replaces the remote default (no network); missing/bad file errors', withTempConfigHome(async (dir) => {
  const extra = path.join(dir, 'team.json');
  fs.writeFileSync(extra, JSON.stringify({ deepseek: { env: { ANTHROPIC_BASE_URL: 'https://team' }, required: [] } }));

  const map = await templates.loadTemplates({ from: extra });
  assert.strictEqual(map.get('deepseek').env.ANTHROPIC_BASE_URL, 'https://team');

  await assert.rejects(() => templates.loadTemplates({ from: path.join(dir, 'nope.json') }), templates.TemplateError);

  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, '{ not json');
  await assert.rejects(() => templates.loadTemplates({ from: bad }), templates.TemplateError);
}));

test('fetch success writes the remote cache + cache.json fetchedAt', withTempConfigHome(async () => {
  const cache = require('../src/cache');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => '"etag-1"' },
    text: async () => JSON.stringify({ foo: { env: { ANTHROPIC_MODEL: 'm' }, required: [] } }),
  });
  try {
    const map = await templates.loadTemplates(); // no cache yet → fetches
    assert.ok(map.has('foo'));
    assert.ok(fs.existsSync(templates.remoteCachePath()));
    const st = cache.readTemplate();
    assert.ok(st.fetchedAt > 0);
    assert.strictEqual(st.etag, '"etag-1"');
  } finally {
    globalThis.fetch = realFetch;
  }
}));

test('isValidEnvName matches the schema name rule', () => {
  assert.ok(config.isValidEnvName('deepseek'));
  assert.ok(config.isValidEnvName('kimi-k2.6_v4'));
  assert.ok(!config.isValidEnvName('-leading-dash'));
  assert.ok(!config.isValidEnvName('has space'));
  assert.ok(!config.isValidEnvName(''));
});
