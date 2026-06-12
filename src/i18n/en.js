'use strict';

// English message catalog. Source of truth — every key here must also exist
// in the other language files. Placeholders use {name} syntax.
module.exports = {
  // parser
  'parser.overrideOnce': '{tok} can only be specified once',
  'parser.aAndAExclusive': '-a and -A are mutually exclusive',
  'parser.envRequiresName': 'Option {tok} requires an env name',
  'parser.aRequiresValue': '-a requires a value (e.g. -a "--permission-mode bypassPermissions")',
  'parser.unknownOption':
    'Unknown option: {tok}\n' +
    'cce does not pass unknown flags through to claude.\n' +
    'Claude args must be wrapped in -a "..." (merge) or -A "..." (override).\n' +
    'Try: cce -a "{tok}"{hint}',
  'parser.unknownOptionQuoteHint': ' (and quote the value)',
  'parser.mergeModeRequiresValue': '{tok} requires a value (override|cce|claude)',
  'parser.invalidMergeMode': 'Invalid merge mode "{val}". Use one of: override, cce, claude',
  'parser.pickNoEnvFlag': '-e/--env not allowed with `cce pick` (the env is chosen via the menu)',
  'parser.pickUnknownOption': 'Unknown option for `cce pick`: {tok} (only -a / -A are allowed)',
  'parser.pickARequiresValue': '-a requires a value',

  // cli / launch
  'cli.defaultMissing': 'default env "{name}" does not exist in config (fix with `cce use <name>` or `cce edit`)',
  'cli.cancelled': 'Cancelled.',
  'cli.envNotExist': 'Env "{name}" does not exist. Available: {available}',
  'cli.envNotExistHint': 'Run `cce edit` to add an env, or `cce list` to see existing ones.',
  'cli.noEnvInjected': 'No env injected — launching claude as-is.',
  'cli.claudeNotFound': 'Could not find the `claude` executable.',
  'cli.claudeNotFoundInstall': '  • Install Claude Code: https://docs.claude.com/en/docs/claude-code/quickstart',
  'cli.claudeNotFoundBin': '  • Or set CCE_CLAUDE_BIN to the full path of your claude binary.',

  // launcher
  'launcher.noEnvSummary': 'no env injected',
  'launcher.spawnFailed': 'Failed to spawn claude: {message}',

  // settings reconciliation
  'settings.readWarn': 'Could not read {file} ({message}) — treating it as empty',
  'settings.leakWarn': 'override mode neutralized {count} stale env key(s) from settings.json: {keys}',

  // list
  'list.noEnvs': 'No envs configured. Run `cce edit` to create one.',
  'list.available': 'Available envs:',
  'list.defaultLabel': 'Default: {name}',
  'list.defaultMissingWarn': '⚠ does not exist — fix with `cce use <name>` or `cce edit`',
  'list.defaultChangeHint': '(use `cce use <name>` to change)',
  'list.noDefault': 'No default env. Bare `cce` will open the picker.',

  // show
  'show.usage': 'Usage: cce show <env>',
  'show.envHeader': 'Env: {name}',
  'show.envVars': 'Environment variables:',
  'show.envEmpty': '(empty — no env injection)',
  'show.claudeArgs': 'Claude args (config):',
  'show.argsEmpty': '(no defaults — claude launches with no extra args)',
  'show.fromGlobal': '(from global)',
  'show.fromEnv': '(from env)',
  'show.argsOverrideNote': 'argsOverride: true → global args dropped for this env',
  'show.settingsModeHeader': 'Settings.json env mode:',
  'show.settingsModeLine': '  {mode}  {source}',
  'show.modeFromGlobal': '(from global default)',
  'show.modeFromEnv': '(from this env)',

  // mode descriptions (shared)
  'mode.override.desc': 'override — this env fully replaces settings.json env (stale keys neutralized)',
  'mode.merge-cce.desc': 'merge-cce — union with settings.json, this env wins on conflicts',
  'mode.merge-claude.desc': 'merge-claude — union with settings.json, settings.json wins on conflicts',

  // use
  'use.cleared': 'Cleared default env. Bare `cce` will not inject env.',
  'use.set': 'Default env set to "{name}".',

  // edit
  'edit.opening': 'Opening {file} with {editor}',
  'edit.launchFailed': 'Failed to launch editor "{editor}": {message}',
  'edit.saved': 'Config saved.',

  // pick
  'pick.needTTY': 'Interactive picker requires a TTY. Use `cce -e <name>` instead.',
  'pick.availableEnvs': '  available envs: {names}',
  'pick.singleEnv': 'only env configured: {name} — using it',
  'pick.title': 'Pick an env to launch claude:',

  // picker
  'picker.hint': '  ↑/↓ navigate · Enter select · Esc/Ctrl+C cancel',

  // lang command
  'lang.current': 'UI language: {lang}  {source}',
  'lang.sourceEnv': '(from CCE_LANG)',
  'lang.sourceConfig': '(from config)',
  'lang.sourceLocale': '(auto-detected from OS locale)',
  'lang.sourceDefault': '(default)',
  'lang.set': 'UI language set to: {lang}',
  'lang.cleared': 'UI language cleared — will auto-detect (currently: {lang}).',
  'lang.invalid': 'Unsupported language "{value}". Supported: en, zh-CN, auto',

  // completion
  'completion.usage': 'Usage: cce completion <bash|zsh|powershell|fish>',

  // update
  'update.checking': 'Checking for updates…',
  'update.checkFailed': 'Could not reach the npm registry. Check your network and try again.',
  'update.upToDate': 'cce is up to date (v{version}).',
  'update.available': 'Update available: {current} → {latest}',
  'update.runToInstall': 'Run `cce update` to install it.',
  'update.installing': 'Installing {latest} via npm…',
  'update.installed': 'Updated to v{version}. Restart cce to use the new version.',
  'update.installFailed': 'npm install failed. Try manually: npm i -g {spec}',
  'update.gitCheckout': 'This looks like a git checkout — update with `git pull`, not npm.',
  'update.promptTitle': 'cce v{latest} is available (you have v{current}). Update now?',
  'update.choiceUpdate': 'Update now',
  'update.choiceSkip': 'Skip this version',
  'update.skipped': 'Skipping v{version} — you will be reminded when a newer version ships.',
  'update.autoDone': 'cce was updated to v{version} in the background.',

  // add (create env from template)
  'add.pickTitle': 'Pick a template:',
  'add.conflictTitle': 'An env named "{name}" already exists. What now?',
  'add.choiceOverwrite': 'Overwrite the existing env',
  'add.choiceRename': 'Keep both — name the new one differently',
  'add.enterName': 'Name for this env',
  'add.invalidName': 'Invalid env name "{name}". Use letters/digits to start, then letters, digits, . _ -',
  'add.nameExists': 'An env named "{name}" already exists (pass a different name, or run interactively to choose).',
  'add.fieldRequired': '{name} is required — please enter a value.',
  'add.created': 'Created env "{name}".',
  'add.docsHint': 'Official docs (to verify the config): {url}',
  'add.setDefaultPrompt': 'Set "{name}" as the default env? [y/N]',
  'add.launchHint': 'Launch it with `cce -e {name}`  (inspect with `cce show {name}`).',
  'add.templateNotFound': 'Template "{name}" not found. Available: {available}',
  'add.needTemplateArg': 'Picking a template needs a TTY. Pass a template name: `cce add <template>` (see `cce template ls`).',
  'add.needInteractiveFill': 'This template has fields to fill in, which needs a TTY. Run `cce add` interactively.',
  'add.unknownOption': 'Unknown option for `cce add`: {tok}',
  'add.fileParseFailed': 'Could not parse template file {file}: {message}',
  'add.fileNotFound': 'Template file not found: {file}',
  'add.fileBadShape': 'Template file {file} must be a JSON object keyed by template name.',
  'add.listTitle': 'Available templates:',
  'add.listSource': 'from: {file}',
  'add.listFields': 'fields: {names}',

  // template command + remote source
  'template.fromNeedsValue': '--from requires a path or URL',
  'template.fromFetchFailed': 'Could not fetch templates from {src} ({reason}).',
  'template.fromEmpty': 'No templates found in {src}.',
  'template.usingStale': 'Could not refresh templates — using the cached copy (may be out of date).',
  'template.offlineNoCache':
    'Offline mode is on but there is no cached template file.\n' +
    'On a machine with network, download:\n  {url}\n' +
    'and save it to:\n  {path}',
  'template.fetchFailed':
    'Could not download templates ({reason}).\n' +
    'Open this URL on a device with network access:\n  {url}\n' +
    'then save the file to:\n  {path}\n' +
    '(or set an intranet mirror with `cce template url <url>`).',
  'template.none': 'No templates available. Source: {url}',
  'template.unknownSub': 'Unknown `cce template` subcommand: {sub} (try: ls | show | docs | refresh | url | offline)',
  'template.statusTitle': 'Template source:',
  'template.statusUrl': 'url     ',
  'template.statusUrlDefault': '(default: jsDelivr + GitHub raw fallback)',
  'template.statusOffline': 'offline ',
  'template.statusCache': 'cache   ',
  'template.statusCacheInfo': '{count} template(s), fetched {age} ago',
  'template.statusCacheNone': 'none yet (will download on first `cce add`)',
  'template.statusUnknown': 'unknown',
  'template.statusHint': 'Manage with: cce template url <url|--none> · cce template offline on|off · cce template refresh',
  'template.ageMinutes': '{n}m',
  'template.ageHours': '{n}h',
  'template.ageDays': '{n}d',
  'template.showUsage': 'Usage: cce template show <name>',
  'template.showDocs': 'Docs:',
  'template.docsUsage': 'Usage: cce template docs <name> [--print] (name is required without a TTY)',
  'template.docsPickTitle': 'Pick a template to open its docs:',
  'template.docsNoneHint': '(no docs link)',
  'template.docsNone': 'Template "{name}" has no docs link.',
  'template.docsInvalid': 'Template "{name}" has a non-http(s) docs link: {url}',
  'template.docsOpened': 'Opened in your browser: {url}',
  'template.docsOpenFailed': 'Could not open a browser — here is the link:',
  'template.showHeader': 'Template: {name}',
  'template.showRequired': 'Required fields (you fill these in):',
  'template.showFooter': 'Create an env from it with `cce add {name}`.',
  'template.refreshing': 'Refreshing templates…',
  'template.refreshed': 'Templates refreshed ({count} available).',
  'template.urlCleared': 'Template URL cleared — using the default sources.',
  'template.urlInvalid': 'Not a valid URL: "{val}" (must start with http:// or https://). Use `cce template url --none` to reset.',
  'template.urlSet': 'Template URL set to {url}',
  'template.offlineSet': 'Template offline mode: {state}',
  'template.offlineInvalid': 'Invalid value "{val}". Use: cce template offline on|off',

  // remove
  'remove.unknownOption': 'Unknown option for `cce remove`: {tok}',
  'remove.tooManyArgs': 'Too many arguments. Usage: cce remove [-y] [<name>]',
  'remove.usage': 'Picking an env to remove needs a TTY. Pass a name: `cce remove <name>`.',
  'remove.pickTitle': 'Pick an env to remove:',
  'remove.confirm': 'Remove env "{name}"? [y/N]',
  'remove.confirmDefault': 'Remove env "{name}" (currently the default)? [y/N]',
  'remove.needYesNonTTY': '`cce remove` requires -y/--yes in non-interactive mode',
  'remove.removed': 'Removed env "{name}".',
  'remove.defaultCleared': 'Default env cleared — bare `cce` will open the picker.',

  // config
  'config.readFailed': 'Failed to read config at {file}: {message}',
  'config.invalidJson':
    'Config at {file} is not valid JSON: {message}\n' +
    'A backup of the broken file was saved at {bak}. Please fix it or run `cce edit`.',
  'config.envNotExistSimple': 'Env "{name}" does not exist',
};
