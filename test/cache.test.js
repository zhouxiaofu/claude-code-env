'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cache = require('../src/cache');
const config = require('../src/config');

function withTempConfigHome(fn) {
  return () => {
    const prev = process.env.CCE_CONFIG_HOME;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cce-cache-'));
    process.env.CCE_CONFIG_HOME = dir;
    try {
      fn(dir);
    } finally {
      if (prev === undefined) delete process.env.CCE_CONFIG_HOME;
      else process.env.CCE_CONFIG_HOME = prev;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test('cache defaults when no file exists', withTempConfigHome(() => {
  assert.deepStrictEqual(cache.readUpdate(), {
    lastCheckAt: 0,
    latestVersion: null,
    skippedVersion: null,
    autoUpdatePending: null,
    autoUpdateAttemptedAt: 0,
  });
  assert.deepStrictEqual(cache.readTemplate(), { fetchedAt: 0, etag: null, sourceUrl: null });
}));

test('update and template sections persist independently in one cache.json', withTempConfigHome(() => {
  cache.writeUpdate({ latestVersion: '9.9.9' });
  cache.writeTemplate({ fetchedAt: 123, sourceUrl: 'https://x' });

  // Both sections live in the same file and don't clobber each other.
  assert.strictEqual(cache.readUpdate().latestVersion, '9.9.9');
  assert.strictEqual(cache.readTemplate().fetchedAt, 123);
  assert.strictEqual(cache.readTemplate().sourceUrl, 'https://x');

  // Partial patch merges.
  cache.writeUpdate({ lastCheckAt: 5 });
  assert.strictEqual(cache.readUpdate().latestVersion, '9.9.9');
  assert.strictEqual(cache.readUpdate().lastCheckAt, 5);

  // One file on disk.
  assert.ok(fs.existsSync(cache.getCachePath()));
}));

test('config normalizes template { url, offline }', withTempConfigHome(() => {
  // Defaults.
  let cfg = config.defaultConfig();
  assert.deepStrictEqual(cfg.template, { url: null, offline: false });

  // Round-trips through save/load.
  cfg.template.url = 'https://mirror.local/templates.json';
  cfg.template.offline = true;
  config.save(cfg);
  cfg = config.load();
  assert.strictEqual(cfg.template.url, 'https://mirror.local/templates.json');
  assert.strictEqual(cfg.template.offline, true);

  // Bad types are dropped back to defaults.
  config.save({ version: 1, envs: {}, template: { url: 123, offline: 'yes' } });
  cfg = config.load();
  assert.deepStrictEqual(cfg.template, { url: null, offline: false });
}));
