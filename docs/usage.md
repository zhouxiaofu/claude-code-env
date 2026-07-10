# cce —— 完整使用指南

<div align="center">

**简体中文** | [English](./usage.en.md)

</div>

这是 **`cce`**（Claude Code Env Launcher）的完整参考。快速入门与安装说明见
[README](../README.md)。

> **一句话理解：** `cce` 读取一份小配置，里面记录了若干套**启动配置**（每套叫一个 *env*）。
> 启动时它把你选中的那套注入到一个**全新的 `claude` 子进程**；claude 退出时 cce 也跟着退出，
> 并原样返回它的退出码。全程不动任何全局设置 —— 每个终端窗口都能同时用不同的 env。

---

## 目录

- [术语速查](#术语速查)
- [概念](#概念)
- [命令参考](#命令参考)
  - [启动模式](#启动模式)
  - [子命令](#子命令)
- [从模板创建 env](#从模板创建-env)
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
- [更新 cce](#更新-cce)
- [环境变量](#环境变量)
- [排错](#排错)

---

## 术语速查

第一次读文档可能会遇到几个词，这里先一次性解释清楚，后文不再重复：

| 词 | 含义 |
|---|---|
| **服务商（provider）** | 提供 Claude 模型、或提供「兼容 Claude 接口」的一方。例如 DeepSeek、Kimi（月之暗面）、智谱 GLM、Anthropic 官方，或你自建的代理。每个服务商都有自己的**接口地址**和**密钥**。一个 env 会指向某个服务商，但反过来**一个服务商可以对应多个 env**。 |
| **env（启动配置）** | cce 里你自己创建的一套**启动配置**，起个名字（如 `deepseek`、`kimi-fast`）。它记录这一套「怎么启动 claude」：用哪个服务商、什么接口地址和密钥、哪个模型、默认带哪些参数。**同一个服务商可以建多套 env**（比如同一家配不同模型、不同密钥或不同默认参数）。之后用 `cce -e <名字>` 点名启动其中一套。本文里「env」「启动配置」是同一个意思。 |
| **token（密钥/令牌）** | 访问服务商接口用的钥匙（一长串字符），相当于密码，泄露了别人就能用你的额度。 |
| **`~/.claude/settings.json`** | Claude Code **自己的**配置文件（不是 cce 的）。cce 只读它、**绝不改写**它。 |
| **参数 / flag** | 跟在命令后面的选项，例如 `--permission-mode bypassPermissions`、`--resume`。 |
| **TTY（终端）** | 你手动敲命令的那个命令行窗口。文中说「需要 TTY」就是指「需要真人在终端里操作」—— 脚本、管道、CI 里没有 TTY，那些交互式菜单就用不了。 |
| **shell** | 命令行环境本身，比如 Windows 的 PowerShell、macOS/Linux 的 bash / zsh / fish。 |

---

## 概念

一个 **env** 就是一套起了名字的启动配置（一些环境变量，外加可选的默认 claude 参数）。它指向某个
服务商，但不等于服务商本身 —— **同一个服务商可以建多套 env**（比如换模型、换密钥、换默认参数）。
其中的 `env` 块和 Claude Code 自己的 `~/.claude/settings.json` 里的 `env` 块**结构完全一样**，
所以你可以把服务商文档里给的配置块直接复制粘贴进来。

`cce` *只是一个启动器*：它不代理网络流量、不在后台常驻、也不修改任何全局设置。当你运行
`cce -e deepseek` 时：

1. 读取 `~/.claude/cce/config.json`。
2. 解析 `deepseek` 这个 env（并展开其中的 `${VAR}` 占位符）。
3. 把该 env 与你的 `~/.claude/settings.json` 合并（见
   [settings.json 合并](#settingsjson-合并)）。
4. 以「直接接管你当前终端的输入输出」的方式启动 `claude`，所以 claude 的交互界面和你直接运行它时一模一样。
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
| `-- <claude 参数...>` | `--` 之后的所有内容原样透传给 claude，**合并**到配置默认之上。 |
| `-o, --only` | **丢弃**所有配置默认参数，只用 `--` 之后给的（或什么都不给 = 裸 claude）。 |
| `-c, --continue` | 继续最近一次对话（= claude 的 `--continue`）。 |
| `-r, --resume [id]` | 恢复某次对话；裸写则打开交互选择器（= claude 的 `--resume`）。 |
| `-n, --name <name>` | 给本次会话设一个显示名（= claude 的 `--name`）。 |
| `-m, --merge-mode <mode>` | 本 env 的 `env` 如何与 `settings.json` 合并：`override`（默认）、`cce`、`claude`。见 [settings.json 合并](#settingsjson-合并)。 |
| `-h, --help` | 显示帮助。 |
| `-v, --version` | 显示版本。 |

> **重要：** `cce` **不会**把 `--` 之前的未知 flag 透传给 claude —— 遇到就报错。要传 claude
> 参数就放在 `--` 之后。这让 cce 自己的 flag 空间保持封闭，永远不会与 claude 未来的新 flag 冲突。
> 少数最常用的会话参数（`-c`/`-r`/`-n`）已做成 cce 直达 flag，无需 `--`。

```bash
cce                                              # 默认 env + 配置参数
cce -e kimi                                      # 本次切换 env
cce -e kimi -- --permission-mode bypassPermissions   # 合并额外的 claude 参数
cce -e kimi -c                                   # 继续上次对话（直达）
cce -e kimi -n data                              # 把本次会话命名为 data（直达）
cce -e kimi -o -- --resume SESSION_ID            # 只用这些参数，丢弃配置默认
cce -e kimi -o                                   # 启动裸 claude，不带参数
cce -e kimi -m cce                               # 与 settings.json 合并，kimi 优先
```

> 旧的 `-a "..."` / `-A "..."` 已移除：`-a "X"` → `-- X`，`-A "X"` → `-o -- X`，裸 `-A` → `-o`。
> 直接敲旧写法时，cce 会打印对应的新命令供你复制。

### 子命令

| 命令 | 说明 |
|---|---|
| `list`、`ls` | 列出所有 env；`*` 标记当前默认项。 |
| `add [模板] [名称]` | **从模板创建一个 env**（交互式选模板、填字段）。`--from <路径\|URL>` 本次改用其它模板来源。详见 [从模板创建 env](#从模板创建-env)。 |
| `remove`、`rm [名称]` | 删除一个 env（会二次确认；`-y` 跳过确认；不带名称则弹出选择菜单）。删的是默认 env 时一并清空默认。 |
| `template`、`tpl [...]` | 管理模板来源与缓存：`ls`/`list`、`show <名>`、`refresh`、`url`、`offline`。详见 [管理模板（cce template）](#管理模板cce-template)。 |
| `show <name>` | 显示某 env 的变量、解析后的合并模式、以及合并后的 claude 参数（带每层来源标注）。API token 自动脱敏。 |
| `edit` | 用 `$EDITOR`（Windows 默认 notepad）打开 `config.json`。手动增/改/删 env 的标准方式。 |
| `use <name>` | 设置默认 env。`cce use --none` 清除默认。 |
| `current` | 打印当前默认 env 名。 |
| `lang [en\|zh-CN\|auto]` | 查看或设置界面语言（持久写入配置）。见 [多语言](#多语言)。 |
| `pick [-o/-c/-r/-n/-m/-- ...]` | 从菜单交互式选择一个 env，然后启动 claude。 |
| `completion <shell>` | 打印 shell 补全脚本（`bash`/`zsh`/`fish`/`powershell`）。 |
| `update [--check]` | 把 cce 自己升级到 npm 上的最新版。加 `--check` 只检查、不安装。详见 [更新 cce](#更新-cce)。 |
| `help` | 显示帮助。 |

> `cce add` 专做「**照模板快速生成**一套 env」这件事。要批量增/改、或精细手改，仍然直接
> `cce edit` 打开 JSON 最顺手（文件带 `$schema` 引用，编辑器会补全和校验）。

---

## 从模板创建 env

`cce add` 让你照着一份**模板**快速生成一套 env：模板里固定的部分（接口地址、模型等）已经填好，
你只需要补上自己的几项（通常就是 API Key），它就把整套写进 `config.json`。

```bash
cce add                          # 弹出模板菜单 → 逐项填写 → 起名 → 写入
cce add deepseek                 # 直接用名为 deepseek 的模板，跳过选择菜单
cce add deepseek ds              # 再省一步：预设新 env 的名字为 ds
cce template ls                  # 只列出能用的模板（名称/描述/来自哪个文件），不创建
cce add --from ./team.json       # 本次改用一个外部模板文件（路径）
cce add --from https://host/t.json  # 本次改用一个远程模板文件（URL）
```

**一次创建大致是这样：**

1. **选模板** —— 不带模板名时弹出方向键菜单；带了名字（`cce add deepseek`）就直接用。
2. **填字段** —— 模板里列为「待填」的项逐个提示你输入（比如 `ANTHROPIC_AUTH_TOKEN`）。
   有默认值的项，直接回车即接受；没默认值又留空会重新问你（因为是必填）。模板没有待填项时跳过这步。
3. **起名 + 查重** —— 给这套 env 起个名字（默认就用模板名，回车接受）。名字需符合
   `[A-Za-z0-9][A-Za-z0-9._-]*`。**若名字已存在**，会让你二选一：**覆盖现有**，或**给新的换个名字**。
4. **写入** —— 把模板固定项 + 你填的项合并成 `env` 写进 `config.json`，并问你是否设为默认。

> 交互式选择和填写都需要 **TTY**（真人在终端里操作）。在脚本/管道里，请直接给全参数
> `cce add <模板> <名称>`，且该模板没有待填项；否则 cce 会提示需要 TTY 而不会卡住。

### 模板从哪来

默认模板**不再随 npm 包发布**，而是从 GitHub 仓库实时获取（这样你总能拿到最新的），并缓存到本地。
`cce add` 解析模板时按下面的顺序叠加，**后面的同名模板覆盖前面的**：

```
默认模板（远端获取 + 本地缓存 templates.remote.json）
  └─ 被覆盖 → ~/.claude/cce/templates.json （你自己的模板，可选）
```

带了 `--from <路径|URL>` 时，**默认模板这一层换成你指定的来源**（不联网拉默认的），你的 `templates.json` 仍然叠加在上面。

- **默认（远端 + 缓存）**：首次 `cce add` 时从默认源下载 DeepSeek、Kimi、GLM 等常用模板，存到
  `~/.claude/cce/templates.remote.json`。之后 **24 小时**内直接用缓存；过期再拉一次。
  默认源是 jsDelivr（CDN，国内可达），失败时回落到 GitHub raw。
  - **下载失败怎么办**：cce 会打印模板的下载链接和应保存到的路径——在有网的设备上下载，拷到那个路径即可。
  - 用 `cce template` 系列命令可以查看/刷新/换源/离线，见下一节。
- **用户文件**：在配置目录放一个 `templates.json`（与 `config.json` 同级），就能增加你自己的模板，
  或用同名 key 覆盖默认的。
- **`--from <路径|URL>`**：只影响这一次运行（不写缓存、不改配置）。值以 `http://` / `https://` 开头按
  URL 处理，否则当作本地文件路径。适合临时试用别人发来的模板文件。

### 管理模板（cce template）

`cce template`（别名 `cce tpl`）集中管理默认模板的来源与缓存。**只在你用默认模板（没带 `--from`）时才有意义。**

```bash
cce template                 # 状态总览：当前 url、是否离线、缓存里有几个模板/拉取于多久前
cce template ls              # 列出可用模板（= 旧的 cce add --list）
cce template list            # 同 ls
cce template show deepseek   # 看某个模板的固定 env + 待填字段
cce template refresh         # 立刻重新下载（忽略 24h TTL 和离线开关），失败则打印链接
cce template url <url>       # 把默认源改成你给的单个 URL（如内网镜像）——设了就只用它，不再走 jsDelivr/raw
cce template url --none      # 清除上面的设置，回到默认源
cce template offline on      # 开启离线：永不联网，只用本地缓存，且不做 24h 过期检查
cce template offline off     # 关闭离线
```

> **内网 / 离线机器**：两种办法。① 有内网镜像就 `cce template url <镜像地址>`；
> ② 没有就在有网设备下载默认模板文件，拷到 `~/.claude/cce/templates.remote.json`，再 `cce template offline on`
> ——这样 `cce add` 永不联网，直接用这份缓存。

### 模板文件格式

模板文件是一个 JSON 对象，**key 就是模板名**，每个模板：

```jsonc
{
  "deepseek": {
    // 描述可以是多语言对象，按你当前的界面语言显示；也可以直接写一个字符串。
    "description": { "en": "DeepSeek (Claude-compatible API)", "zh-CN": "DeepSeek（兼容 Claude 接口）" },

    // 固定项：直接照搬进新 env 的 env，无需用户填。
    "env": {
      "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
      "ANTHROPIC_MODEL":    "deepseek-chat"
    },

    // 待填项：创建时逐个提示用户输入，填好后并入上面的 env。
    "required": [
      {
        "name": "ANTHROPIC_AUTH_TOKEN",
        "description": { "en": "Your DeepSeek API Key", "zh-CN": "你的 DeepSeek API Key" },
        "default": ""    // 可选；有默认值时回车即接受
      }
    ]
  }
}
```

| 字段 | 说明 |
|---|---|
| `description` | 模板描述。**可以是字符串，也可以是按语言分 key 的对象**（如 `{ "en": ..., "zh-CN": ... }`）。显示时按当前界面语言取：取不到当前语言 → 退回 `en` → 再退回第一个非空值；都没有就不显示。 |
| `env` | 模板里**已填好**的环境变量（接口地址、模型等），原样进入新 env。值必须是字符串。 |
| `required` | **需要用户填写**的项的数组。每项的 `name` 就是要写进 `env` 的键名，用户输入的就是值。 |
| `required[].name` | 待填项对应的 env 键名（如 `ANTHROPIC_AUTH_TOKEN`）。 |
| `required[].description` | 该项的提示说明，同样支持多语言对象或字符串。 |
| `required[].default` | 可选默认值；填写时回车即接受。 |

> 模板的多语言 `description` 在生成 env 时会**按当前界面语言塌缩成一句**，存进该 env 的
> `description` 字段（config.json 里 env 的描述是单一字符串）。

---

## 配置文件

### 位置

| 平台 | 路径 |
|---|---|
| Windows | `%USERPROFILE%\.claude\cce\config.json` |
| macOS / Linux | `~/.claude/cce/config.json` |

用 `CCE_CONFIG_HOME` 环境变量可覆盖该目录（便于 CI 或团队约定）。首次运行时若不存在会写入一份起始配置。

> 同一目录下还有两个 cce **自动管理**的文件，不需要你手动编辑：
> - `cache.json` —— 缓存状态（更新检查记录、模板上次拉取时间/etag 等）。
> - `templates.remote.json` —— 下载下来的默认模板（结构与远端一致；离线时可手动放置）。

### 完整 schema

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `version` | integer | 是 | 配置 schema 版本（当前为 `1`）。 |
| `default` | string \| null | 否 | `cce` 不带 `-e` 时使用的 env 名。`null`/缺省 → 裸 `cce` 在 TTY 下打开选择器，非 TTY 下不注入直接启动。 |
| `lang` | `"en"` \| `"zh-CN"` \| null | 否 | 界面语言。`null` = 从系统 locale 自动检测。可被 `CCE_LANG` 覆盖；用 `cce lang` 设置。 |
| `args` | string | 否 | **全局**默认 claude CLI 参数（shell 分词）。前置注入到每次启动。 |
| `env` | object | 否 | **全局共享**的环境变量基底，注入到每个 env 之下——用于与模型无关的设置（如 `CLAUDE_CODE_DISABLE_MOUSE_CLICKS`、`DISABLE_TELEMETRY`）。选中 env 的 `env` 逐 key 覆盖它；选中 env 里某 key 的值为**空字符串或 `null`** 则**移除**该 key（让某个 env 去掉某个全局变量）。值可含 `${VAR}`。 |
| `settingsMode` | `"override"` \| `"merge-cce"` \| `"merge-claude"` | 否 | **全局**默认合并模式。默认 `override`。 |
| `updateMode` | `"auto"` \| `"prompt"` \| `"off"` | 否 | 启动时如何处理自我更新。默认 `auto`。见 [更新 cce](#更新-cce)。 |
| `template` | object | 否 | 模板来源设置。建议用 `cce template url` / `cce template offline` 管理，而非手改。 |
| `template.url` | string \| null | 否 | 默认模板的远端 URL。`null` = 用内置默认源（jsDelivr + GitHub raw 兜底）。设为单个 URL（如内网镜像）则只用它、不兜底。 |
| `template.offline` | boolean | 否 | 默认 `false`。为 `true` 时 `cce add` 永不联网：直接用本地缓存 `templates.remote.json`，且跳过 24h 过期检查。 |
| `envs.<name>` | object | 是 | 一个命名 env。键名就是你传给 `-e` 的值。必须匹配 `[A-Za-z0-9][A-Za-z0-9._-]*`。 |
| `envs.<name>.description` | string | 否 | 在 `cce list` 和 `cce show` 中展示。 |
| `envs.<name>.env` | object | 是 | 为该服务商注入的环境变量。结构与 claude `settings.json` 的 `env` 块一致。合并在根级 `env` 之上（本 env 逐 key 优先）；某 key 值为空字符串或 `null` 则移除继承自根级 `env` 的该 key。值可含 `${VAR}` 占位符，启动时从你命令行环境里解析。 |
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
  // 想为某次启动跳过它们，用 `-o`。
  "args": "--permission-mode bypassPermissions",

  // 全局共享 env 基底 —— 注入到每个 env 之下（与模型无关的设置放这里）。
  // 选中 env 的 `env` 逐 key 覆盖；把某 key 设为 "" 或 null 则移除它。
  "env": {
    "CLAUDE_CODE_DISABLE_MOUSE_CLICKS": "1",
    "DISABLE_TELEMETRY": "1"
  },

  // 全局默认：env 的 `env` 如何与 ~/.claude/settings.json 合并。
  "settingsMode": "override",

  // 启动时如何自我更新：auto = 后台自动更新（默认）；prompt = 问你；off = 不检查。
  "updateMode": "auto",

  "envs": {
    "deepseek": {
      "description": "DeepSeek（兼容 Claude 接口）",
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
| 2. 按 env（单个 env 专属） | `envs.<name>.args` + `argsOverride` | `argsOverride: true` 时该 env *替换*全局层。 |
| 3. 命令行 | `-c` / `-r` / `-n` / `-- ...` | 直达会话 flag 与 `--` 之后的参数，追加在最上层。`-o` 则丢弃第 1、2 层。 |

合并是**纯拼接 —— cce 从不去重**：

```
最终 = (-o 或 env.argsOverride ? "" : 全局 args) + " " + (-o ? "" : env.args) + " " + [-c/-r/-n 展开] + " " + [-- 之后的参数]
```

这串文本会按命令行规则拆成一个个参数后交给 claude，由 claude 自己处理重复（大多数参数是「后者覆盖前者」；
像 `--add-dir` 这种可重复的参数则会叠加）。要强制只用一组精确参数，用 `-o`。

| 命令 | 实际启动 |
|---|---|
| `cce -e deepseek` | `claude --permission-mode bypassPermissions --add-dir D:\code` |
| `cce -e deepseek -- --resume X` | `claude --permission-mode bypassPermissions --add-dir D:\code --resume X` |
| `cce -e deepseek -c` | `claude --permission-mode bypassPermissions --add-dir D:\code --continue` |
| `cce -e deepseek -o -- --resume X` | `claude --resume X` |
| `cce -e deepseek -o` | `claude`（无参数） |

**分词规则（对 Windows 友好）：** 反斜杠永远是字面值，只有引号才分组 token。所以
`--add-dir D:\code` 直接可用；路径带空格时用引号包起来：`--add-dir 'D:\My Code'`。

---

## settings.json 合并

### 问题

`cce` 把服务商的 env 注入到 `claude` 子进程 —— 但 Claude Code *同时也会*读取你
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
- `-o` / `-c` / `-r` / `-n` / `-m` / `--` 同样可用：`cce pick -m cce -- --verbose`。
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

## 更新 cce

cce 可以把**自己**升级到 npm 上的最新版本，分**手动**和**启动时自动**两种方式。

### 手动更新

```bash
cce update          # 检查最新版；有新版就直接用 npm 安装
cce update --check  # 只检查、并告诉你有没有新版，不安装
```

`cce update` 每次都会**实时查询** npm，所以结果永远是最新的（不受下面的缓存影响）。它底层执行的就是 `npm i -g @xiaofuzhou/cce@latest`。

> 如果你是从源码（`git clone`）运行的 cce，`cce update` 会提醒你用 `git pull` 更新，而不会去 npm 重装、把你的源码目录搞乱。

### 启动时自动检查

每次用 cce 启动 claude 时，它会顺手在**后台**看一眼有没有新版本 —— 这一步**不会拖慢启动**（用的是本地缓存，联网查询在后台进行）。具体怎么处理，由配置里的 `updateMode` 决定：

| `updateMode` | 行为 |
|---|---|
| `auto`（默认） | 发现新版后，在后台**静默更新**；装好后，下次启动时会提示一句「已在后台更新到 vX.Y.Z」。全程不打断你。 |
| `prompt` | **不自动装**。下次你在终端里启动 cce 时，弹一个菜单让你选「**立即更新** / **跳过此版本**」。选「跳过」后这个版本就不再提示，等更出新的版本时再问你。 |
| `off` | 启动时**完全不检查**（仍可手动 `cce update`）。 |

用 `cce edit` 打开配置，改根部的 `updateMode` 即可：

```jsonc
{
  "updateMode": "prompt",
  ...
}
```

**几个细节：**

- **检查结果缓存约 3 小时**：所以启动时既不会频繁联网，也不会每次都来打扰你。
- **只在真人操作的终端（TTY）里**才会弹「立即更新 / 跳过」菜单；脚本、管道、CI 等没有 TTY 的场景下，既不弹窗也不打印，绝不卡住流程。
- 想**临时关掉**某一次启动的检查：设环境变量 `CCE_NO_UPDATE_CHECK=1`。
- 更新装好后，需要**重新运行 cce**才会用上新版本（正在运行的这一次不受影响）。

---

## 环境变量

| 变量 | 用途 |
|---|---|
| `CCE_CONFIG_HOME` | 覆盖 cce 配置目录（默认 `~/.claude/cce/`）。 |
| `CLAUDE_CONFIG_DIR` | cce 从哪里读 claude 的 `settings.json`（默认 `~/.claude/`）。与 claude 自己的变量一致。 |
| `CCE_CLAUDE_BIN` | `claude` 可执行文件的完整路径（跳过 PATH 查找）。 |
| `CCE_LANG` | 本次运行的界面语言（`en` \| `zh-CN`）；高于配置。持久设置用 `cce lang`。 |
| `CCE_NO_UPDATE_CHECK=1` | 本次运行禁用启动时的更新检查（见 [更新 cce](#更新-cce)）。 |
| `CCE_QUIET=1` | 隐藏 `[cce]` 启动提示行。 |
| `CCE_DEBUG=1` | 内部错误时打印堆栈。 |

---

## 排错

| 现象 | 解决 |
|---|---|
| `Could not find the claude executable` | 安装 Claude Code，确认 `claude` 在 PATH 中，或设置 `CCE_CLAUDE_BIN=/full/path/to/claude`。 |
| `Env "X" does not exist` | 用 `cce list` 看已定义的 env；`cce edit` 添加。 |
| `Unknown option: --foo` | claude 参数要放在 `--` 之后（合并）；要丢弃配置默认加 `-o`。 |
| `-a has been removed` / `-A has been removed` | 旧 flag 已移除；按提示改用 `--`（`-a "X"` → `-- X`）或 `-o -- ...`（`-A "X"` → `-o -- X`）。 |
| `default env "X" does not exist in config` | 用 `cce use <name>` 切换，或 `cce edit` 修复。裸 `cce` 会回退到选择器。 |
| 切了 env 还是命中旧端点 | 多半是 `~/.claude/settings.json` 里有残留键。`override` 模式会屏蔽它；查 `cce show <name>` 并确认 `${VAR}` 占位符能解析。 |
| `Could not read <settings.json> — treating it as empty` | 你的 `settings.json` 不是合法 JSON，合并已跳过它。修一下 JSON。 |
| 配置文件损坏 | cce 报错前会在旁边存一份备份 `config.json.bak.<timestamp>`。 |

---

## 另见

- [README](../README.md) —— 快速开始与概览
- [DESIGN.md](DESIGN.md) —— 设计取舍与决策记录
- [Claude Code 文档](https://docs.claude.com/en/docs/claude-code)
