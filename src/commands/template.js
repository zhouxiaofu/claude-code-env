'use strict';

const fs = require('fs');

const config = require('../config');
const cache = require('../cache');
const tpl = require('../templates');
const { maskEnvObject } = require('../util/mask');
const { openUrl } = require('../util/open');
const { pick } = require('../util/picker');
const log = require('../util/log');
const i18n = require('../i18n');
const { t, localize } = i18n;
const pc = log.colors;

// Pull `--from <val>` / `--from=<val>` out of args. Returns { from, rest }.
function extractFrom(args) {
  let from = null;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--from') {
      const next = args[i + 1];
      if (next === undefined || next.startsWith('-')) {
        throw new tpl.TemplateError(t('template.fromNeedsValue'));
      }
      from = next;
      i += 1;
      continue;
    }
    const eq = a.match(/^--from=(.+)$/);
    if (eq) { from = eq[1]; continue; }
    rest.push(a);
  }
  return { from, rest };
}

// `cce template [ls|list|show|docs|refresh|url|offline] ...`
async function run(args) {
  const sub = args[0];
  const rest = args.slice(1);

  try {
    switch (sub) {
      case undefined:           return await status();
      case 'ls':
      case 'list':              return await listTemplates(rest);
      case 'show':              return await showTemplate(rest);
      case 'docs':
      case 'doc':               return await docsCmd(rest);
      case 'refresh':           return await refresh();
      case 'url':               return urlCmd(rest);
      case 'offline':           return offlineCmd(rest);
      default:
        log.error(t('template.unknownSub', { sub }));
        return 1;
    }
  } catch (e) {
    if (e instanceof tpl.TemplateError) {
      log.error(e.message);
      return 1;
    }
    throw e;
  }
}

// Bare `cce template` — show the current source config + cache status. Never
// touches the network.
async function status() {
  const cfg = config.load();
  const url = (cfg.template && cfg.template.url) || null;
  const offline = Boolean(cfg.template && cfg.template.offline);
  const st = cache.readTemplate();

  log.plain(pc.bold(t('template.statusTitle')));
  log.plain(`  ${t('template.statusUrl')}  ${url ? pc.cyan(url) : pc.dim(t('template.statusUrlDefault'))}`);
  log.plain(`  ${t('template.statusOffline')}  ${offline ? pc.yellow('on') : pc.dim('off')}`);

  const file = tpl.remoteCachePath();
  if (fs.existsSync(file)) {
    const age = st.fetchedAt ? humanAge(Date.now() - st.fetchedAt) : t('template.statusUnknown');
    let count = 0;
    try { count = Object.keys(JSON.parse(fs.readFileSync(file, 'utf8'))).length; } catch { /* ignore */ }
    log.plain(`  ${t('template.statusCache')}  ${t('template.statusCacheInfo', { count, age })}`);
  } else {
    log.plain(`  ${t('template.statusCache')}  ${pc.dim(t('template.statusCacheNone'))}`);
  }
  log.plain('');
  log.plain(pc.dim(t('template.statusHint')));
  return 0;
}

function humanAge(ms) {
  const h = Math.floor(ms / 3600000);
  if (h < 1) return t('template.ageMinutes', { n: Math.max(1, Math.floor(ms / 60000)) });
  if (h < 48) return t('template.ageHours', { n: h });
  return t('template.ageDays', { n: Math.floor(h / 24) });
}

// `cce template ls|list [--from <src>]`
async function listTemplates(args) {
  const { from } = extractFrom(args);
  const templates = await tpl.loadTemplates({ from });
  const arr = [...templates.values()].sort((a, b) => a.name.localeCompare(b.name));

  log.plain(pc.bold(t('add.listTitle')));
  for (const tp of arr) {
    const desc = localize(tp.description);
    log.plain(`  ${pc.cyan(tp.name)}${desc ? '  ' + pc.dim(desc) : ''}`);
    if (tp.required.length > 0) {
      log.plain(`     ${pc.dim(t('add.listFields', { names: tp.required.map((r) => r.name).join(', ') }))}`);
    }
    log.plain(`     ${pc.dim(t('add.listSource', { file: tp.source }))}`);
  }
  return 0;
}

// `cce template show <name> [--from <src>]`
async function showTemplate(args) {
  const { from, rest } = extractFrom(args);
  const name = rest[0];
  if (!name) {
    log.error(t('template.showUsage'));
    return 1;
  }
  const templates = await tpl.loadTemplates({ from });
  const tp = templates.get(name);
  if (!tp) {
    log.error(t('add.templateNotFound', { name, available: [...templates.keys()].sort().join(', ') }));
    return 1;
  }

  log.plain(pc.bold(t('template.showHeader', { name })));
  const desc = localize(tp.description);
  if (desc) log.plain(pc.dim(desc));
  log.plain('');

  log.plain(pc.bold(t('show.envVars')));
  const masked = maskEnvObject(tp.env);
  const keys = Object.keys(masked).sort();
  if (keys.length === 0) {
    log.plain(pc.dim(t('show.envEmpty')));
  } else {
    const w = Math.max(...keys.map((k) => k.length));
    for (const k of keys) log.plain(`  ${pc.cyan(k.padEnd(w))}  ${masked[k]}`);
  }

  if (tp.required.length > 0) {
    log.plain('');
    log.plain(pc.bold(t('template.showRequired')));
    for (const it of tp.required) {
      const d = localize(it.description);
      const def = typeof it.default === 'string' ? pc.dim(` [${it.default}]`) : '';
      log.plain(`  ${pc.cyan(it.name)}${def}${d ? '  ' + pc.dim(d) : ''}`);
    }
  }
  if (tp.docs) {
    log.plain('');
    log.plain(`${t('template.showDocs')}  ${pc.cyan(tp.docs)}`);
  }
  log.plain('');
  log.plain(pc.dim(t('template.showFooter', { name })));
  return 0;
}

// `cce template docs [name] [--print] [--from <src>]` — open the template's
// official docs page in the default browser (or just print the URL).
async function docsCmd(args) {
  const { from, rest } = extractFrom(args);
  const print = rest.includes('--print') || rest.includes('-p');
  const positionals = rest.filter((a) => a !== '--print' && a !== '-p');
  let name = positionals[0];

  const templates = await tpl.loadTemplates({ from });

  if (!name) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      log.error(t('template.docsUsage'));
      return 1;
    }
    const items = [...templates.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((tp) => ({
        value: tp.name,
        label: tp.name,
        hint: tp.docs ? localize(tp.description) : t('template.docsNoneHint'),
      }));
    name = await pick({ title: t('template.docsPickTitle'), items });
    if (name === null) {
      log.warn(t('cli.cancelled'));
      return 130;
    }
  }

  const tp = templates.get(name);
  if (!tp) {
    log.error(t('add.templateNotFound', { name, available: [...templates.keys()].sort().join(', ') }));
    return 1;
  }
  if (!tp.docs) {
    log.error(t('template.docsNone', { name }));
    return 1;
  }
  // Remote templates are untrusted input — only ever hand http(s) to the OS.
  if (!tpl.isUrl(tp.docs)) {
    log.error(t('template.docsInvalid', { name, url: tp.docs }));
    return 1;
  }

  if (print) {
    log.plain(tp.docs);
    return 0;
  }

  if (await openUrl(tp.docs)) {
    log.success(t('template.docsOpened', { url: tp.docs }));
  } else {
    // No browser to hand off to (headless box, missing opener) — the URL
    // itself is still the answer, so this is a soft failure.
    log.warn(t('template.docsOpenFailed'));
    log.plain(tp.docs);
  }
  return 0;
}

// `cce template refresh` — force a refetch, ignoring TTL + offline.
async function refresh() {
  const cfg = config.load();
  log.info(t('template.refreshing'));
  const res = await tpl.ensureRemoteCache({ cfg, refresh: true });
  if (res.fetchFailed) {
    log.error(t('template.fetchFailed', {
      url: tpl.displayUrl(cfg),
      path: tpl.remoteCachePath(),
      reason: res.error || 'network',
    }));
    return 1;
  }
  let count = 0;
  try { count = Object.keys(JSON.parse(fs.readFileSync(tpl.remoteCachePath(), 'utf8'))).length; } catch { /* ignore */ }
  log.success(t('template.refreshed', { count }));
  return 0;
}

// `cce template url [<url> | --none]`
function urlCmd(args) {
  const cfg = config.load();
  const arg = args[0];

  if (arg === undefined) {
    const url = (cfg.template && cfg.template.url) || null;
    log.plain(url ? url : t('template.statusUrlDefault'));
    return 0;
  }
  if (arg === '--none' || arg === 'reset' || arg === 'default') {
    cfg.template.url = null;
    config.save(cfg);
    log.success(t('template.urlCleared'));
    return 0;
  }
  if (!tpl.isUrl(arg)) {
    log.error(t('template.urlInvalid', { val: arg }));
    return 1;
  }
  cfg.template.url = arg;
  config.save(cfg);
  log.success(t('template.urlSet', { url: arg }));
  return 0;
}

// `cce template offline [on|off]`
function offlineCmd(args) {
  const cfg = config.load();
  const arg = args[0];

  if (arg === undefined) {
    log.plain(cfg.template && cfg.template.offline ? 'on' : 'off');
    return 0;
  }
  if (arg === 'on' || arg === 'true') {
    cfg.template.offline = true;
    config.save(cfg);
    log.success(t('template.offlineSet', { state: 'on' }));
    return 0;
  }
  if (arg === 'off' || arg === 'false') {
    cfg.template.offline = false;
    config.save(cfg);
    log.success(t('template.offlineSet', { state: 'off' }));
    return 0;
  }
  log.error(t('template.offlineInvalid', { val: arg }));
  return 1;
}

module.exports = { run, extractFrom };
