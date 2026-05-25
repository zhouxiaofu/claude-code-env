# cce —— 完整使用指南

<div align="center">

**简体中文** | [English](./usage.en.md)

</div>

这是 **`cce`**（Claude Code Env Launcher）的完整参考。快速入门与安装说明见
[README](../README.md)。

> **一句话模型：** `cce` 读取一份记录了若干命名 *env* 的小配置，把你选中的那个注入到一个
> 全新的 `claude` 子进程，并以 claude 的退出码退出。全程不碰任何全局状态 —— 每个终端窗口
> 都能并行跑不同的 provider。

---

## 目录

- [概念](#概念)
- [命令参考](#命令参考)
  - [启动模式](#启动模式)
  - [子命令](#子命令)
- [配置文件](#配置文件)
  - [位置](#位置)
  - [完整 schema](#完整-schema)
  - [配置示例](#配置示例)
- [Claude 参数管理](#claude-参数管理)
- [settings.json 合并](#settingsjson-合并)
  - [问题](#问题)
  - [cce 如何解决](#cce-如何解决)
  - [三种模式](#三种模式)
  - [如何选择模式](#如何选择模式)
  - [临时文件的生命周期与清理](#临时文件的生命周期与清理)
- [env 泄漏防护](#env-泄漏防护)
- [多语言](#多语言)
- [交互式选择器](#交互式选择器)
- [Shell 补全](#shell-补全)
- [环境变量](#环境变量)
- [排错](#排错)

---

## 概念

一个 **env** 是一组命名的环境变量（外加可选的默认 claude 参数）。其中的 `env` 块与
Claude Code 自己的 `~/.claude/settings.json` `env` 块**结构完全一致**，所以你可以把 provider
配置块直接复制粘贴进来。

`cce` *只是一个启动器*。它不代理流量、不常驻后台、不修改任何全局状态。当你运行
`cce -e deepseek` 时：

1. 读取 `~/.claude/cce/config.json`。
2. 解析 `deepseek` 这个 env（并展开其中的 `${VAR}` 占位符）。
3. 把该 env 与你的 `~/.claude/settings.json` 合并（见
   [settings.json 合并](#settingsjson-合并)）。
4. 以 `stdio: 'inherit'` 启动 `claude`，因此 claude 的交互式界面与你直接运行它时完全一样。
5. claude 退出时，`cce` 透传其退出码，并删除临时文件（若有）。

---

## 命令参考

```
cce [选项]                     用默认或指定的 env 启动 claude
cce <子命令> [参数...]         管理 env
```

### 启动模式

| 选项 | 说明 |
|---|---|
| `-e, --env <name>` | 本次启动使用指定的 env（否则用配置里的 `default`）。 |
| `-a "<args>"` | 把 claude 参数**合并**到配置默认之上（可重复）。 |
| `-A "<args>"` | **覆盖**：只用这些 claude 参数，丢弃所有配置默认。命令末尾的裸 `-A` = 不带任何参数启动 claude。 |
| `-m, --merge-mode <mode>` | 本 env 的 `env` 如何与 `settings.json` 合并：`override`（默认）、`cce`、`claude`。见 [settings.json 合并](#settingsjson-合并)。 |
| `-h, --help` | 显示帮助。 |
| `-v, --version` | 显示版本。 |

> **重要：** `cce` **不会**把未知 flag 透传给 claude。所有 claude 的 CLI flag 都必须包在
> `-a "..."` 或 `-A "..."` 里。这让 cce 自己的 flag 空间保持封闭，永远不会与 claude 未来的
> 新 flag 冲突。

```bash
cce                                              # 默认 env + 配置参数
cce -e kimi                                      # 本次切换 env
cce -e kimi -a "--permission-mode bypassPermissions"   # 合并额外的 claude 参数
cce -e kimi -a "-c"                              # claude 自己的 -c，包在 -a 里
cce -e kimi -A "--resume SESSION_ID"             # 覆盖所有配置默认参数
cce -e kimi -A                                   # 启动裸 claude，不带参数
cce -e kimi -m cce                               # 与 settings.json 合并，kimi 优先
```

### 子命令

| 命令 | 说明 |
|---|---|
| `list`、`ls` | 列出所有 env；`*` 标记当前默认项。 |
| `show <name>` | 显示某 env 的变量、解析后的合并模式、以及合并后的 claude 参数（带每层来源标注）。API token 自动脱敏。 |
| `edit` | 用 `$EDITOR`（Windows 默认 notepad）打开 `config.json`。手动增/改/删 env 的标准方式。 |
| `use <name>` | 设置默认 env。`cce use --none` 清除默认。 |
| `current` | 打印当前默认 env 名。 |
| `lang [en\|zh-CN\|auto]` | 查看或设置界面语言（持久写入配置）。见 [多语言](#多语言)。 |
| `pick [-a/-A/-m ...]` | 从菜单交互式选择一个 env，然后启动 claude。 |
| `completion <shell>` | 打印 shell 补全脚本（`bash`/`zsh`/`fish`/`powershell`）。 |
| `help` | 显示帮助。 |

> 这里**故意不提供** `cce add` / `cce remove`。增、改、删 env 都走 `cce edit`，直接打开 JSON。
> 配置文件带 `$schema` 引用，所以编辑器会给你补全和校验。

---

## 配置文件

### 位置

| 平台 | 路径 |
|---|---|
| Windows | `%USERPROFILE%\.claude\cce\config.json` |
| macOS / Linux | `~/.claude/cce/config.json` |

用 `CCE_CONFIG_HOME` 环境变量可覆盖该目录（便于 CI 或团队约定）。首次运行时若不存在会写入一份起始配置。

### 完整 schema

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `version` | integer | 是 | 配置 schema 版本（当前为 `1`）。 |
| `default` | string \| null | 否 | `cce` 不带 `-e` 时使用的 env 名。`null`/缺省 → 裸 `cce` 在 TTY 下打开选择器，非 TTY 下不注入直接启动。 |
| `lang` | `"en"` \| `"zh-CN"` \| null | 否 | 界面语言。`null` = 从系统 locale 自动检测。可被 `CCE_LANG` 覆盖；用 `cce lang` 设置。 |
| `args` | string | 否 | **全局**默认 claude CLI 参数（shell 分词）。前置注入到每次启动。 |
| `settingsMode` | `"override"` \| `"merge-cce"` \| `"merge-claude"` | 否 | **全局**默认合并模式。默认 `override`。 |
| `envs.<name>` | object | 是 | 一个命名 env。键名就是你传给 `-e` 的值。必须匹配 `[A-Za-z0-9][A-Za-z0-9._-]*`。 |
| `envs.<name>.description` | string | 否 | 在 `cce list` 和 `cce show` 中展示。 |
| `envs.<name>.env` | object | 是 | 为该 provider 注入的环境变量。结构与 claude `settings.json` 的 `env` 块一致。值可含 `${VAR}` 占位符，启动时从父 shell 环境解析。 |
| `envs.<name>.args` | string | 否 | 该 env 的 claude 参数。默认合并到全局 `args` 之上。 |
| `envs.<name>.argsOverride` | boolean | 否 | 默认 `false`。为 `true` 时，该 env 的 `args` **替换**全局 `args`。 |
| `envs.<name>.settingsMode` | enum | 否 | 该 env 的合并模式覆盖。省略则继承全局 `settingsMode`。 |

### 配置示例

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/zhouxiaofu/claude-code-env/main/schema.json",
  "version": 1,
  "default": "deepseek",

  // 界面语言：null = 自动检测。用 `cce lang en|zh-CN|auto` 设置。
  "lang": null,

  // 全局默认 claude 参数 —— 应用到每次启动。
  // 想为某次启动跳过它们，用 `-A "..."`。
  "args": "--permission-mode bypassPermissions",

  // 全局默认：env 的 `env` 如何与 ~/.claude/settings.json 合并。
  "settingsMode": "override",

  "envs": {
    "deepseek": {
      "description": "DeepSeek（Anthropic 兼容端点）",
      // 该 env 的参数合并到全局之上 → 实际生效：
      //   --permission-mode bypassPermissions --add-dir D:\\code
      "args": "--add-dir D:\\code",
      "env": {
        "ANTHROPIC_BASE_URL":   "https://api.deepseek.com/anthropic",
        "ANTHROPIC_AUTH_TOKEN": "sk-xxxxxxxxxxxx",
        "ANTHROPIC_MODEL":      "deepseek-chat"
      }
    },

    "kimi": {
      "description": "Moonshot Kimi K2",
      // 该 env 单独覆盖合并模式。
      "settingsMode": "merge-cce",
      "env": {
        "ANTHROPIC_BASE_URL":   "https://api.moonshot.cn/anthropic",
        // ${VAR} 在启动时从你的 shell 环境解析 —— 把密钥写进 shell rc 里导出
        // KIMI_KEY，就能让本文件不含明文密钥。
        "ANTHROPIC_AUTH_TOKEN": "${KIMI_KEY}",
        "ANTHROPIC_MODEL":      "kimi-k2-0905-preview"
      }
    },

    "official": {
      "description": "官方 Claude 订阅（用 ~/.claude 凭据）",
      // 空 env 表示：不覆盖 ANTHROPIC_* —— 让 claude 用它自己的 Pro/Max 订阅鉴权。
      // 在 override 模式下，settings.json 里残留的 anthropic 键会被屏蔽，无法渗入。
      "env": {}
    }
  }
}
```

---

## Claude 参数管理

`cce` 把传给 claude 的 CLI 参数集中管理，免得你每次重打。共三层，优先级由低到高：

| 层 | 来源 | 备注 |
|---|---|---|
| 1. 全局 | 配置根的 `args` | 应用到每次启动。 |
| 2. per-env | `envs.<name>.args` + `argsOverride` | `argsOverride: true` 时该 env *替换*全局层。 |
| 3. CLI | `-a "..."` / `-A "..."` | `-a` 追加；`-A` 替换其下所有层。 |

合并是**纯拼接 —— cce 从不去重**：

```
最终 = (env.argsOverride ? "" : 全局 args) + " " + env.args + " " + 所有 -a "..."
```

结果经 shell 分词成 argv 后交给 claude，由 claude 自己处理重复（大多数 flag 是 last-wins；
像 `--add-dir` 这种可重复 flag 会叠加）。要强制使用一组精确参数，用 `-A`。

| 命令 | 实际启动 |
|---|---|
| `cce -e deepseek` | `claude --permission-mode bypassPermissions --add-dir D:\code` |
| `cce -e deepseek -a "--resume X"` | `claude --permission-mode bypassPermissions --add-dir D:\code --resume X` |
| `cce -e deepseek -A "--resume X"` | `claude --resume X` |
| `cce -e deepseek -A` | `claude`（无参数） |
| `cce -e foo -a "X" -A "Y"` | **报错：** `-a 和 -A 互斥` |

**分词规则（对 Windows 友好）：** 反斜杠永远是字面值，只有引号才分组 token。所以
`--add-dir D:\code` 直接可用；路径带空格时用引号包起来：`--add-dir 'D:\My Code'`。

---

## settings.json 合并

### 问题

`cce` 把 provider env 注入到 `claude` 子进程 —— 但 Claude Code *同时也会*读取你
`~/.claude/settings.json` 里的 `env` 块。如果那个文件里还残留着、比如一个旧的
`ANTHROPIC_BASE_URL`，它可能悄悄盖过来，让你的 env 切换静默失效。

### cce 如何解决

`cce` **绝不改写你真实的 `settings.json`**。它的做法是：

1. 只读地读取 `~/.claude/settings.json` 的 `env` 块。
2. 按所选模式算出一份合并后的 `env`。
3. 写到一个唯一的临时文件：`~/.claude/cce/tmp/settings-<pid>-<rand>.json`。
4. 用 `claude --settings <临时文件>` 启动。
5. claude 退出时删除该临时文件。

`claude --settings <file>` 以**命令行优先级**加载*附加*设置 —— **高于** user 的
`settings.json` —— 且是**合并叠加**而非整体替换。所以对每个键，生效值为：

```
生效[键] = (键 ∈ tempEnv) ? tempEnv[键] : userEnv[键]
```

由于 `--settings` 无法*删除* user 独有的键，`cce` 通过把这些残留键写成**空串**来屏蔽它们 ——
Claude Code 会把空串当作未设置。

### 三种模式

`tempEnv` 是写进临时文件的内容（`entry.env` 是所选 cce env 的 `env`，已展开 `${VAR}`；
`userEnv` 是你 settings.json 里的 `env`）：

| 模式 | CLI 值（`-m`） | `tempEnv` 内容 | 效果 |
|---|---|---|---|
| **override** *（默认）* | `override` | `entry.env` + 把只存在于 `userEnv` 的残留 `ANTHROPIC_*` 键设为 `""` | 完全以本 env 为准；settings.json 里残留的 anthropic 键被屏蔽；user 的非 anthropic 键保留。 |
| **merge-cce** | `cce` | `entry.env` | 与 settings.json 取并集；冲突时**本 env 优先**。 |
| **merge-claude** | `claude` | `entry.env` 去掉 `userEnv` 已有的键 | 与 settings.json 取并集；冲突时 **settings.json 优先**。 |

> **为什么只走单通道？** anthropic env 现在*只*经由临时 settings 文件传递，绝不经过子进程的
> process env（cce 仍会从继承的环境里剥离残留的 anthropic 变量 —— 见下文）。process-env 与
> settings-env 的优先级官方未文档化，而 `--settings` 的优先级是确定的。全部走一条通道让结果
> 可预测，也避免了 `merge-claude` 模式下的自相矛盾。

### 如何选择模式

模式的解析与参数完全同构 —— 最高层胜出：

```
CLI -m/--merge-mode   >   envs.<name>.settingsMode   >   根 settingsMode   >   "override"
```

```bash
# 按次：
cce -e kimi -m cce

# 按 env（config.json）：
"envs": { "kimi": { "settingsMode": "merge-cce", "env": { ... } } }

# 全局默认（config.json 根）：
"settingsMode": "merge-claude"
```

运行 `cce show <name>` 可查看解析后的模式及其来源。

### 临时文件的生命周期与清理

- **唯一文件名**（`settings-<pid>-<rand>.json`）—— 并发窗口永不撞车。
- POSIX 上 **`chmod 600`**（尽力而为；不支持的文件系统忽略）。
- **每条退出路径都清理** —— 正常退出、出错、信号、以及 `process.on('exit')`。
- **孤儿清扫** —— 启动时删除超过 6 小时的临时文件（`SIGKILL`/断电 残留）。该时限保证正在运行的会话绝不会被误删。
- 临时文件含展开后的明文 token，但其寿命就是 claude 进程的寿命，且绝不触碰你的真实配置 ——
  比把密钥持久化写进 `settings.json` 安全得多。

---

## env 泄漏防护

启动 claude 之前，`cce` 会从继承来的 process env 中剥离以下变量，这样你 shell 里残留的
`export ANTHROPIC_BASE_URL=...` 就无法静默覆盖你的 env：

```
ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_API_KEY,
ANTHROPIC_MODEL, ANTHROPIC_SMALL_FAST_MODEL,
ANTHROPIC_DEFAULT_HAIKU_MODEL, ANTHROPIC_DEFAULT_SONNET_MODEL,
ANTHROPIC_DEFAULT_OPUS_MODEL
```

若你想刻意保留某个 shell 里的值，就在 env 条目里引用它：
`"ANTHROPIC_BASE_URL": "${ANTHROPIC_BASE_URL}"`。

---

## 多语言

`cce` 的输出（帮助、警告、错误、提示）提供 **英文** 和 **简体中文（zh-CN）** 两种语言。
启动摘要行是数据，不翻译。

**检测优先级：**

```
CCE_LANG 环境变量   >   配置 `lang`   >   系统 locale   >   英文
```

**按次覆盖** —— 设置 `CCE_LANG` 环境变量（对齐 `LANG`/`LC_ALL` 的惯例）：

```bash
CCE_LANG=zh-CN cce --help     # 仅本次运行
```

**持久偏好** —— `cce lang` 子命令（对齐 `git config`）：

```bash
cce lang            # 显示当前语言及其来源
cce lang zh-CN      # 把简体中文持久写入配置
cce lang en         # 持久写入英文
cce lang auto       # 清除设置 → 回到自动检测
```

> 这里刻意没有 `--lang` flag：`cce` 保持一套最小、封闭的「非启动」flag（只有 `-h`/`-v`）。
> 只影响 cce 自身输出的设置，应当走环境变量（按次）+ 子命令（持久），这也是多数 CLI 的分工。

---

## 交互式选择器

`cce pick` 打开一个键盘菜单，然后用所选 env 启动 claude：

```
选择一个 env 来启动 claude：

❯ * deepseek   DeepSeek（Anthropic 兼容端点）
    kimi       Moonshot Kimi K2
    official   官方 Claude 订阅

  ↑/↓ 移动 · Enter 选定 · Esc/Ctrl+C 取消
```

- `*` 标记当前默认项；光标从它开始。
- `↑/↓` 或 `k/j` 移动，数字键 `1`–`9` 跳转，`Enter` 选定，`Esc`/`Ctrl+C`/`q` 取消。
- 选择**不会**改变你的默认项 —— 要改默认用 `cce use <name>`。
- 当你有 env 但没设默认时，裸 `cce` 也会打开选择器。
- `-a` / `-A` / `-m` 同样可用：`cce pick -a "--verbose" -m cce`。
- 需要 TTY。在非交互场景（CI、管道）下请用 `cce -e <name>`。

---

## Shell 补全

`cce completion <shell>` 把补全脚本打印到 stdout。安装一次即可：

| Shell | 安装 |
|---|---|
| **bash** | `cce completion bash >> ~/.bashrc`，然后 `source ~/.bashrc` |
| **zsh** | `cce completion zsh >> ~/.zshrc`，然后 `source ~/.zshrc` |
| **fish** | `cce completion fish > ~/.config/fish/completions/cce.fish` |
| **PowerShell** | `cce completion powershell >> $PROFILE`，然后 `. $PROFILE` |

你将获得对子命令、flag、`-m`/`lang` 取值列表的 Tab 补全，以及最有用的 —— 在
`-e` / `--env` / `use` / `show` 后补全你自己的 env 名：

```bash
cce -e <Tab>       # → deepseek  kimi  official
cce -m <Tab>       # → override  cce  claude
cce lang <Tab>     # → en  zh-CN  auto
```

---

## 环境变量

| 变量 | 用途 |
|---|---|
| `CCE_CONFIG_HOME` | 覆盖 cce 配置目录（默认 `~/.claude/cce/`）。 |
| `CLAUDE_CONFIG_DIR` | cce 从哪里读 claude 的 `settings.json`（默认 `~/.claude/`）。与 claude 自己的变量一致。 |
| `CCE_CLAUDE_BIN` | `claude` 可执行文件的完整路径（跳过 PATH 查找）。 |
| `CCE_LANG` | 本次运行的界面语言（`en` \| `zh-CN`）；高于配置。持久设置用 `cce lang`。 |
| `CCE_QUIET=1` | 隐藏 `[cce]` 启动提示行。 |
| `CCE_DEBUG=1` | 内部错误时打印堆栈。 |

---

## 排错

| 现象 | 解决 |
|---|---|
| `Could not find the claude executable` | 安装 Claude Code，确认 `claude` 在 PATH 中，或设置 `CCE_CLAUDE_BIN=/full/path/to/claude`。 |
| `Env "X" does not exist` | 用 `cce list` 看已定义的 env；`cce edit` 添加。 |
| `Unknown option: --foo` | 所有 claude 参数都要包在 `-a "..."`（合并）或 `-A "..."`（覆盖）里。 |
| `-a and -A are mutually exclusive` | 二选一：`-a` 追加到默认之上，`-A` 替换默认。 |
| `default env "X" does not exist in config` | 用 `cce use <name>` 切换，或 `cce edit` 修复。裸 `cce` 会回退到选择器。 |
| 切了 env 还是命中旧端点 | 多半是 `~/.claude/settings.json` 里有残留键。`override` 模式会屏蔽它；查 `cce show <name>` 并确认 `${VAR}` 占位符能解析。 |
| `Could not read <settings.json> — treating it as empty` | 你的 `settings.json` 不是合法 JSON，合并已跳过它。修一下 JSON。 |
| 配置文件损坏 | cce 报错前会在旁边存一份备份 `config.json.bak.<timestamp>`。 |

---

## 另见

- [README](../README.md) —— 快速开始与概览
- [DESIGN.md](DESIGN.md) —— 设计取舍与决策记录
- [Claude Code 文档](https://docs.claude.com/en/docs/claude-code)
