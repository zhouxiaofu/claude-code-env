'use strict';

const update = require('../update');
const log = require('../util/log');
const { t } = require('../i18n');
const pkg = require('../../package.json');

// `cce update`          — check the registry now, install if a newer version exists.
// `cce update --check`  — check and report only; never install.
//
// Unlike the launch-time hook this always hits the network (no throttle): the
// user explicitly asked, so report the truth right now.
async function run(args) {
  const checkOnly = args.includes('--check') || args.includes('-c');
  const current = pkg.version;

  // A git/source checkout shouldn't `npm i -g` over itself.
  if (update.isGitCheckout()) {
    log.warn(t('update.gitCheckout'));
    return 0;
  }

  log.info(t('update.checking'));
  const latest = await update.fetchLatest();
  if (!latest) {
    log.error(t('update.checkFailed'));
    return 1;
  }

  // Feed the cache so the launch-time hook benefits from this fresh result too.
  update.writeState({ lastCheckAt: Date.now(), latestVersion: latest });

  if (!update.isNewer(latest, current)) {
    log.success(t('update.upToDate', { version: current }));
    return 0;
  }

  log.plain(t('update.available', { current, latest }));

  if (checkOnly) {
    log.plain(t('update.runToInstall'));
    return 0;
  }

  log.info(t('update.installing', { latest }));
  if (!update.installLatestSync()) {
    log.error(t('update.installFailed', { spec: update.INSTALL_SPEC }));
    return 1;
  }
  log.success(t('update.installed', { version: latest }));
  return 0;
}

module.exports = { run };
