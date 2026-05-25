'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const i18n = require('../src/i18n');
const en = require('../src/i18n/en');
const zh = require('../src/i18n/zh-CN');

test('catalogs have identical key sets (en is source of truth)', () => {
  const enKeys = Object.keys(en).sort();
  const zhKeys = Object.keys(zh).sort();
  assert.deepStrictEqual(zhKeys, enKeys, 'zh-CN catalog must mirror en keys exactly');
});

test('normalizeLang maps locales to supported langs', () => {
  assert.strictEqual(i18n.normalizeLang('zh-CN'), 'zh-CN');
  assert.strictEqual(i18n.normalizeLang('zh_CN'), 'zh-CN');
  assert.strictEqual(i18n.normalizeLang('zh-Hans'), 'zh-CN');
  assert.strictEqual(i18n.normalizeLang('en-US'), 'en');
  assert.strictEqual(i18n.normalizeLang('fr'), null);
  assert.strictEqual(i18n.normalizeLang(''), null);
  assert.strictEqual(i18n.normalizeLang(undefined), null);
});

test('resolveLang precedence: CCE_LANG > configLang', () => {
  const prev = process.env.CCE_LANG;
  process.env.CCE_LANG = 'en';
  try {
    assert.strictEqual(i18n.resolveLang({ configLang: 'zh-CN' }), 'en'); // CCE_LANG wins over config
    delete process.env.CCE_LANG;
    assert.strictEqual(i18n.resolveLang({ configLang: 'zh-CN' }), 'zh-CN'); // config wins over locale
  } finally {
    if (prev === undefined) delete process.env.CCE_LANG;
    else process.env.CCE_LANG = prev;
  }
});

test('t interpolates params and falls back to en then to the raw key', () => {
  i18n.setLang('en');
  assert.strictEqual(i18n.t('use.set', { name: 'kimi' }), 'Default env set to "kimi".');
  assert.strictEqual(i18n.t('does.not.exist'), 'does.not.exist');
  i18n.setLang('zh-CN');
  assert.ok(i18n.t('use.set', { name: 'kimi' }).includes('kimi'));
  i18n.setLang('en');
});
