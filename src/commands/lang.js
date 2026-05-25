'use strict';

const config = require('../config');
const log = require('../util/log');
const i18n = require('../i18n');
const { t } = i18n;

// Where the effective UI language currently comes from (mirrors
// i18n.resolveLang precedence) — used by bare `cce lang`.
function effective(cfg) {
  const fromEnv = i18n.normalizeLang(process.env.CCE_LANG);
  if (fromEnv) return { lang: fromEnv, source: 'lang.sourceEnv' };
  const fromCfg = i18n.normalizeLang(cfg.lang);
  if (fromCfg) return { lang: fromCfg, source: 'lang.sourceConfig' };
  const fromLocale = i18n.detectFromLocale();
  if (fromLocale) return { lang: fromLocale, source: 'lang.sourceLocale' };
  return { lang: i18n.DEFAULT_LANG, source: 'lang.sourceDefault' };
}

// `cce lang`            → print the effective language and where it comes from
// `cce lang en|zh-CN`   → persist config.lang
// `cce lang auto`       → clear config.lang (back to auto-detect)
function run(args) {
  const cfg = config.load();
  const arg = args[0];

  if (arg === undefined) {
    const { lang, source } = effective(cfg);
    log.plain(t('lang.current', { lang, source: t(source) }));
    return 0;
  }

  if (arg === 'auto' || arg === 'reset' || arg === '--none') {
    cfg.lang = null;
    config.save(cfg);
    i18n.setLang(i18n.resolveLang({ configLang: null }));
    log.success(t('lang.cleared', { lang: i18n.getLang() }));
    return 0;
  }

  const norm = i18n.normalizeLang(arg);
  if (!norm) {
    log.error(t('lang.invalid', { value: arg }));
    return 1;
  }
  cfg.lang = norm;
  config.save(cfg);
  i18n.setLang(norm); // so the confirmation prints in the language just chosen
  log.success(t('lang.set', { lang: norm }));
  return 0;
}

module.exports = { run };
