'use strict';

// Self-update core for cce. Zero new dependencies: version checks use Node's
// global fetch (Node >=18), the npm registry's lightweight `/latest` endpoint,
// and a tiny semver comparator. All state lives in a machine-managed file
// alongside config.json — never in config.json itself (that's user-edited).

const fs = require('fs');
const path = require('path');
const crossSpawn = require('cross-spawn');

const config = require('./config');
const log = require('./util/log');
const { t } = require('./i18n');
const pkg = require('../package.json');

const PACKAGE_NAME = pkg.name; // @xiaofuzhou/cce
const INSTALL_SPEC = `${PACKAGE_NAME}@latest`;
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;

// How long a background check result is trusted before we refresh it again.
const CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours
const FETCH_TIMEOUT_MS = 4000;
// How long to wait before retrying a previously-kicked-off background install
// for the same target version. The spawn is detached so we never see npm's
// exit code — if the version doesn't land within this window, we assume the
// install failed (network, registry, permissions, ...) and try again.
const AUTO_INSTALL_RETRY_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// State file (~/.claude/cce/update-check.json)
// ---------------------------------------------------------------------------

function getStatePath() {
  return path.join(config.getConfigDir(), 'update-check.json');
}

function readState() {
  const base = {
    lastCheckAt: 0,
    latestVersion: null,
    skippedVersion: null,
    autoUpdatePending: null,
    autoUpdateAttemptedAt: 0,
  };
  try {
    const parsed = JSON.parse(fs.readFileSync(getStatePath(), 'utf8'));
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.lastCheckAt === 'number') base.lastCheckAt = parsed.lastCheckAt;
      if (typeof parsed.latestVersion === 'string') base.latestVersion = parsed.latestVersion;
      if (typeof parsed.skippedVersion === 'string') base.skippedVersion = parsed.skippedVersion;
      if (typeof parsed.autoUpdatePending === 'string') base.autoUpdatePending = parsed.autoUpdatePending;
      if (typeof parsed.autoUpdateAttemptedAt === 'number') base.autoUpdateAttemptedAt = parsed.autoUpdateAttemptedAt;
    }
  } catch {
    /* missing / unreadable / invalid — caller gets fresh defaults */
  }
  return base;
}

// Shallow-merge `patch` into the current state and persist atomically.
// Best-effort: any failure (read-only FS, etc.) is swallowed.
function writeState(patch) {
  const next = { ...readState(), ...patch };
  try {
    config.ensureConfigDir();
    const file = getStatePath();
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
    fs.renameSync(tmp, file);
  } catch {
    /* best effort */
  }
  return next;
}

// ---------------------------------------------------------------------------
// Tiny semver comparator (avoids pulling in the `semver` package)
// ---------------------------------------------------------------------------

// Parse `x.y.z` or `x.y.z-pre.N` into { main: [x,y,z], pre: [..]|null }.
function parseSemver(v) {
  if (typeof v !== 'string') return null;
  const m = v.trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  if (!m) return null;
  return {
    main: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] ? m[4].split('.') : null,
  };
}

// Returns 1 if a > b, -1 if a < b, 0 if equal/unparseable.
// A release ranks above its own prereleases (1.0.0 > 1.0.0-rc.1).
function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;

  for (let i = 0; i < 3; i++) {
    if (pa.main[i] !== pb.main[i]) return pa.main[i] > pb.main[i] ? 1 : -1;
  }
  if (!pa.pre && !pb.pre) return 0;
  if (!pa.pre) return 1; // release > prerelease
  if (!pb.pre) return -1;

  const n = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < n; i++) {
    const ia = pa.pre[i];
    const ib = pb.pre[i];
    if (ia === undefined) return -1; // shorter prerelease set ranks lower
    if (ib === undefined) return 1;
    const na = /^\d+$/.test(ia) ? Number(ia) : null;
    const nb = /^\d+$/.test(ib) ? Number(ib) : null;
    if (na !== null && nb !== null) {
      if (na !== nb) return na > nb ? 1 : -1;
    } else if (na !== null) {
      return -1; // numeric identifiers rank below alphanumeric
    } else if (nb !== null) {
      return 1;
    } else if (ia !== ib) {
      return ia > ib ? 1 : -1;
    }
  }
  return 0;
}

function isNewer(candidate, current) {
  return compareSemver(candidate, current) > 0;
}

// Given a recorded state, the version we should surface as "available" for the
// running build, or null. Pure — no TTY / network / config involved.
function pendingUpdate(current, state) {
  if (state && state.latestVersion && isNewer(state.latestVersion, current)) {
    return state.latestVersion;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Registry + npm
// ---------------------------------------------------------------------------

async function fetchLatest() {
  if (typeof fetch !== 'function') return null; // pre-18 runtime without global fetch
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(REGISTRY_URL, {
      signal: ac.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json.version === 'string' ? json.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Foreground install (inherits stdio so the user sees npm's progress).
function installLatestSync() {
  try {
    const res = crossSpawn.sync('npm', ['install', '-g', INSTALL_SPEC], { stdio: 'inherit' });
    return res.status === 0;
  } catch {
    return false;
  }
}

// Detached, fully-silent background install. Survives the parent exiting.
function installLatestDetached() {
  try {
    const child = crossSpawn('npm', ['install', '-g', INSTALL_SPEC], {
      stdio: 'ignore',
      detached: true,
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

// True when cce is running from a source/git checkout (this dev repo) rather
// than an installed global package — in which case `npm i -g` is the wrong move.
function isGitCheckout() {
  try {
    return fs.existsSync(path.join(__dirname, '..', '.git'));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Launch-time hook
// ---------------------------------------------------------------------------

// Kick off a background registry refresh if the throttle window elapsed. Fire
// and forget: the parent stays alive for the whole claude session (spawnClaude
// keeps the event loop running), so this resolves and writes the cache for the
// next launch without delaying this one.
function maybeRefreshInBackground(state) {
  if (Date.now() - (state.lastCheckAt || 0) < CHECK_INTERVAL_MS) return;
  fetchLatest()
    .then((latest) => {
      const patch = { lastCheckAt: Date.now() };
      if (latest) patch.latestVersion = latest;
      writeState(patch);
    })
    .catch(() => {});
}

function handleAuto(current, state) {
  const pending = pendingUpdate(current, state);
  if (pending) {
    // A newer version exists. Kick off a silent background install — once per
    // target version, and again after AUTO_INSTALL_RETRY_MS if it hasn't landed
    // (we never see npm's exit code, so a stale attempt = assumed failure).
    const isNewTarget = state.autoUpdatePending !== pending;
    const retryDue = !isNewTarget &&
      Date.now() - (state.autoUpdateAttemptedAt || 0) > AUTO_INSTALL_RETRY_MS;
    if ((isNewTarget || retryDue) && installLatestDetached()) {
      writeState({ autoUpdatePending: pending, autoUpdateAttemptedAt: Date.now() });
    }
    return;
  }
  // No newer version. If we'd previously kicked one off and we're now running
  // at-or-above it, the update landed — announce once and clear the marker.
  if (state.autoUpdatePending && !isNewer(state.autoUpdatePending, current)) {
    log.success(t('update.autoDone', { version: current }));
    writeState({ autoUpdatePending: null, autoUpdateAttemptedAt: 0 });
  }
}

async function handlePrompt(current, state) {
  // Interactive only — non-TTY (pipe/CI/script) shows nothing and never blocks.
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;

  const pending = pendingUpdate(current, state);
  if (!pending || pending === state.skippedVersion) return;

  const { pick } = require('./util/picker');
  const choice = await pick({
    title: t('update.promptTitle', { current, latest: pending }),
    items: [
      { value: 'update', label: t('update.choiceUpdate') },
      { value: 'skip', label: t('update.choiceSkip') },
    ],
  });

  if (choice === 'update') {
    log.info(t('update.installing', { latest: pending }));
    if (installLatestSync()) {
      log.success(t('update.installed', { version: pending }));
    } else {
      log.error(t('update.installFailed', { spec: INSTALL_SPEC }));
    }
  } else if (choice === 'skip') {
    writeState({ skippedVersion: pending });
    log.info(t('update.skipped', { version: pending }));
  }
  // choice === null (Esc / Ctrl+C): proceed to launch, ask again next time.
}

// Called from the launch paths (bare `cce`, `cce -e`, `cce pick`) before claude
// is spawned. Wrapped so update logic can never break a launch.
async function maybeCheckOnLaunch() {
  try {
    if (process.env.CCE_NO_UPDATE_CHECK === '1') return;
    if (isGitCheckout()) return;

    let cfg;
    try {
      cfg = config.load();
    } catch {
      return;
    }
    const mode = cfg.updateMode || config.DEFAULT_UPDATE_MODE;
    if (mode === 'off') return;

    const current = pkg.version;
    const state = readState();

    if (mode === 'auto') {
      handleAuto(current, state);
    } else if (mode === 'prompt') {
      await handlePrompt(current, state);
    }

    maybeRefreshInBackground(state);
  } catch {
    /* never let update logic break a launch */
  }
}

module.exports = {
  PACKAGE_NAME,
  INSTALL_SPEC,
  CHECK_INTERVAL_MS,
  getStatePath,
  readState,
  writeState,
  parseSemver,
  compareSemver,
  isNewer,
  pendingUpdate,
  fetchLatest,
  installLatestSync,
  installLatestDetached,
  isGitCheckout,
  maybeRefreshInBackground,
  maybeCheckOnLaunch,
};
