'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const remove = require('../src/commands/remove');
const config = require('../src/config');

function withTempConfigHome(fn) {
  return async () => {
    const prev = process.env.CCE_CONFIG_HOME;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cce-rm-'));
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

function seed(envs, defaultName = null) {
  const cfg = config.defaultConfig();
  for (const [name, entry] of Object.entries(envs)) {
    cfg.envs[name] = { description: '', env: {}, args: '', argsOverride: false, settingsMode: null, ...entry };
  }
  cfg.default = defaultName;
  config.save(cfg);
}

test('parseArgs: bare invocation = picker mode', () => {
  assert.deepStrictEqual(remove.parseArgs([]), { name: null, yes: false });
});

test('parseArgs: name + -y', () => {
  assert.deepStrictEqual(remove.parseArgs(['kimi', '-y']), { name: 'kimi', yes: true });
  assert.deepStrictEqual(remove.parseArgs(['--yes', 'kimi']), { name: 'kimi', yes: true });
});

test('parseArgs: rejects unknown flags', () => {
  const r = remove.parseArgs(['--bogus']);
  assert.ok(r.error);
});

test('parseArgs: rejects multiple positionals', () => {
  const r = remove.parseArgs(['a', 'b']);
  assert.ok(r.error);
});

test('remove -y deletes the env', withTempConfigHome(async () => {
  seed({ kimi: {}, deepseek: {} });
  const code = await remove.run(['kimi', '-y']);
  assert.strictEqual(code, 0);
  const cfg = config.load();
  assert.ok(!cfg.envs.kimi);
  assert.ok(cfg.envs.deepseek);
}));

test('remove -y on default env clears default too', withTempConfigHome(async () => {
  seed({ kimi: {}, deepseek: {} }, 'kimi');
  const code = await remove.run(['kimi', '-y']);
  assert.strictEqual(code, 0);
  const cfg = config.load();
  assert.ok(!cfg.envs.kimi);
  assert.strictEqual(cfg.default, null);
}));

test('remove preserves per-env fields on other envs', withTempConfigHome(async () => {
  seed({
    kimi: { args: '--keep', argsOverride: true, settingsMode: 'merge-cce' },
    deepseek: {},
  });
  await remove.run(['deepseek', '-y']);
  const cfg = config.load();
  assert.strictEqual(cfg.envs.kimi.args, '--keep');
  assert.strictEqual(cfg.envs.kimi.argsOverride, true);
  assert.strictEqual(cfg.envs.kimi.settingsMode, 'merge-cce');
}));

test('remove: non-existent name errors out, config untouched', withTempConfigHome(async () => {
  seed({ kimi: {} });
  const code = await remove.run(['ghost', '-y']);
  assert.strictEqual(code, 1);
  const cfg = config.load();
  assert.ok(cfg.envs.kimi);
}));

test('remove: empty config errors out', withTempConfigHome(async () => {
  seed({});
  const code = await remove.run(['anything', '-y']);
  assert.strictEqual(code, 1);
}));

test('remove: non-TTY without -y is refused', withTempConfigHome(async () => {
  seed({ kimi: {} });
  // node --test runs without a TTY, so isInteractive() is false here.
  const code = await remove.run(['kimi']);
  assert.strictEqual(code, 1);
  // Config untouched.
  assert.ok(config.load().envs.kimi);
}));
