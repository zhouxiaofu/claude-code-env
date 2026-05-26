'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const update = require('../src/update');

test('compareSemver orders core versions', () => {
  assert.strictEqual(update.compareSemver('1.2.3', '1.2.3'), 0);
  assert.strictEqual(update.compareSemver('1.2.4', '1.2.3'), 1);
  assert.strictEqual(update.compareSemver('1.3.0', '1.2.9'), 1);
  assert.strictEqual(update.compareSemver('2.0.0', '1.9.9'), 1);
  assert.strictEqual(update.compareSemver('1.2.3', '1.2.4'), -1);
  assert.strictEqual(update.compareSemver('0.2.0', '0.10.0'), -1); // numeric, not lexical
});

test('compareSemver handles prereleases (release > prerelease)', () => {
  assert.strictEqual(update.compareSemver('1.0.0', '1.0.0-rc.1'), 1);
  assert.strictEqual(update.compareSemver('1.0.0-rc.1', '1.0.0'), -1);
  assert.strictEqual(update.compareSemver('1.0.0-rc.2', '1.0.0-rc.1'), 1);
  assert.strictEqual(update.compareSemver('1.0.0-alpha', '1.0.0-beta'), -1);
});

test('compareSemver tolerates a leading v and junk', () => {
  assert.strictEqual(update.compareSemver('v1.2.3', '1.2.3'), 0);
  assert.strictEqual(update.compareSemver('not-a-version', '1.2.3'), 0); // unparseable → 0
});

test('isNewer is a strict greater-than', () => {
  assert.strictEqual(update.isNewer('0.3.0', '0.2.0'), true);
  assert.strictEqual(update.isNewer('0.2.0', '0.2.0'), false);
  assert.strictEqual(update.isNewer('0.1.0', '0.2.0'), false);
});

test('pendingUpdate returns the newer version or null', () => {
  assert.strictEqual(update.pendingUpdate('0.2.0', { latestVersion: '0.3.0' }), '0.3.0');
  assert.strictEqual(update.pendingUpdate('0.3.0', { latestVersion: '0.3.0' }), null);
  assert.strictEqual(update.pendingUpdate('0.2.0', { latestVersion: null }), null);
  assert.strictEqual(update.pendingUpdate('0.2.0', {}), null);
});

test('readState/writeState round-trip via CCE_CONFIG_HOME', () => {
  const prev = process.env.CCE_CONFIG_HOME;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cce-update-'));
  process.env.CCE_CONFIG_HOME = dir;
  try {
    // Fresh state when nothing written yet.
    assert.deepStrictEqual(update.readState(), {
      lastCheckAt: 0,
      latestVersion: null,
      skippedVersion: null,
      autoUpdatePending: null,
    });

    update.writeState({ latestVersion: '9.9.9', skippedVersion: '9.9.9' });
    const s = update.readState();
    assert.strictEqual(s.latestVersion, '9.9.9');
    assert.strictEqual(s.skippedVersion, '9.9.9');

    // Partial patch merges, doesn't clobber existing fields.
    update.writeState({ lastCheckAt: 12345 });
    const s2 = update.readState();
    assert.strictEqual(s2.lastCheckAt, 12345);
    assert.strictEqual(s2.latestVersion, '9.9.9');
  } finally {
    if (prev === undefined) delete process.env.CCE_CONFIG_HOME;
    else process.env.CCE_CONFIG_HOME = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
