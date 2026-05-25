'use strict';

// 简体中文 message catalog。键集合必须与 en.js 完全一致；占位符用 {name} 形式。
module.exports = {
  // parser
  'parser.overrideOnce': '{tok} 只能出现一次',
  'parser.aAndAExclusive': '-a 和 -A 互斥，不能同时使用',
  'parser.envRequiresName': '选项 {tok} 后面需要跟一个 env 名',
  'parser.aRequiresValue': '-a 需要一个值（例如 -a "--permission-mode bypassPermissions"）',
  'parser.unknownOption':
    '未知选项：{tok}\n' +
    'cce 不会把未知 flag 透传给 claude。\n' +
    'claude 的参数必须包在 -a "..."（合并）或 -A "..."（覆盖）里。\n' +
    '试试：cce -a "{tok}"{hint}',
  'parser.unknownOptionQuoteHint': '（记得给值加引号）',
  'parser.mergeModeRequiresValue': '{tok} 需要一个值（override|cce|claude）',
  'parser.invalidMergeMode': '无效的合并模式 "{val}"。可选值：override、cce、claude',
  'parser.pickNoEnvFlag': '`cce pick` 不接受 -e/--env（env 通过菜单选择）',
  'parser.pickUnknownOption': '`cce pick` 不认识的选项：{tok}（只允许 -a / -A）',
  'parser.pickARequiresValue': '-a 需要一个值',

  // cli / launch
  'cli.defaultMissing': '默认 env "{name}" 在配置里不存在（用 `cce use <name>` 或 `cce edit` 修复）',
  'cli.cancelled': '已取消。',
  'cli.envNotExist': 'env "{name}" 不存在。可用：{available}',
  'cli.envNotExistHint': '运行 `cce edit` 添加 env，或 `cce list` 查看已有的。',
  'cli.noEnvInjected': '未注入任何 env —— 直接启动 claude。',
  'cli.claudeNotFound': '找不到 `claude` 可执行文件。',
  'cli.claudeNotFoundInstall': '  • 安装 Claude Code：https://docs.claude.com/en/docs/claude-code/quickstart',
  'cli.claudeNotFoundBin': '  • 或用 CCE_CLAUDE_BIN 指定 claude 二进制的完整路径。',

  // launcher
  'launcher.noEnvSummary': '未注入 env',
  'launcher.spawnFailed': '启动 claude 失败：{message}',

  // settings reconciliation
  'settings.readWarn': '无法读取 {file}（{message}）—— 当作空配置处理',
  'settings.leakWarn': '覆盖模式已屏蔽 settings.json 里 {count} 个残留 env 键：{keys}',

  // list
  'list.noEnvs': '还没有配置任何 env。运行 `cce edit` 创建一个。',
  'list.available': '可用的 env：',
  'list.defaultLabel': '默认：{name}',
  'list.defaultMissingWarn': '⚠ 不存在 —— 用 `cce use <name>` 或 `cce edit` 修复',
  'list.defaultChangeHint': '（用 `cce use <name>` 修改）',
  'list.noDefault': '没有默认 env。裸 `cce` 会打开选择菜单。',

  // show
  'show.usage': '用法：cce show <env>',
  'show.envHeader': 'Env：{name}',
  'show.envVars': '环境变量：',
  'show.envEmpty': '（空 —— 不注入任何 env）',
  'show.claudeArgs': 'Claude 参数（配置）：',
  'show.argsEmpty': '（无默认参数 —— claude 不带额外参数启动）',
  'show.fromGlobal': '（来自全局）',
  'show.fromEnv': '（来自该 env）',
  'show.argsOverrideNote': 'argsOverride: true → 该 env 忽略全局参数',
  'show.settingsModeHeader': 'settings.json env 模式：',
  'show.settingsModeLine': '  {mode}  {source}',
  'show.modeFromGlobal': '（来自全局默认）',
  'show.modeFromEnv': '（来自该 env）',

  // mode descriptions (shared)
  'mode.override.desc': 'override —— 该 env 完全替换 settings.json 的 env（残留键被屏蔽）',
  'mode.merge-cce.desc': 'merge-cce —— 与 settings.json 取并集，冲突时该 env 优先',
  'mode.merge-claude.desc': 'merge-claude —— 与 settings.json 取并集，冲突时 settings.json 优先',

  // use
  'use.cleared': '已清除默认 env。裸 `cce` 将不注入任何 env。',
  'use.set': '默认 env 已设为 "{name}"。',

  // edit
  'edit.opening': '正在用 {editor} 打开 {file}',
  'edit.launchFailed': '启动编辑器 "{editor}" 失败：{message}',
  'edit.saved': '配置已保存。',

  // pick
  'pick.needTTY': '交互式菜单需要 TTY。请改用 `cce -e <name>`。',
  'pick.availableEnvs': '  可用的 env：{names}',
  'pick.singleEnv': '只配置了一个 env：{name} —— 直接使用',
  'pick.title': '选择一个 env 来启动 claude：',

  // picker
  'picker.hint': '  ↑/↓ 移动 · Enter 选定 · Esc/Ctrl+C 取消',

  // lang command
  'lang.current': '界面语言：{lang}  {source}',
  'lang.sourceEnv': '（来自 CCE_LANG）',
  'lang.sourceConfig': '（来自配置）',
  'lang.sourceLocale': '（自动检测自系统 locale）',
  'lang.sourceDefault': '（默认）',
  'lang.set': '界面语言已设为：{lang}',
  'lang.cleared': '界面语言已清除 —— 将自动检测（当前：{lang}）。',
  'lang.invalid': '不支持的语言 "{value}"。可选：en、zh-CN、auto',

  // completion
  'completion.usage': '用法：cce completion <bash|zsh|powershell|fish>',

  // config
  'config.readFailed': '读取配置失败 {file}：{message}',
  'config.invalidJson':
    '配置文件 {file} 不是合法 JSON：{message}\n' +
    '损坏文件已备份到 {bak}。请修复它，或运行 `cce edit`。',
  'config.envNotExistSimple': 'env "{name}" 不存在',
};
