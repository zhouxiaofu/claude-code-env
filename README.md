# cce — Claude Code 多服务商启动器

<div align="center">

**简体中文** | [English](./README.en.md)

</div>

[![npm version](https://img.shields.io/npm/v/@xiaofuzhou/cce.svg)](https://www.npmjs.com/package/@xiaofuzhou/cce)
[![license](https://img.shields.io/npm/l/@xiaofuzhou/cce.svg)](LICENSE)
[![node](https://img.shields.io/node/v/@xiaofuzhou/cce.svg)](https://nodejs.org)

> 一行命令，用**任意服务商**启动 [Claude Code](https://docs.claude.com/en/docs/claude-code)
> —— DeepSeek、Kimi（月之暗面）、智谱 GLM、Anthropic 官方、[claude-code-router](https://github.com/musistudio/claude-code-router)
> 或你自建的代理。
>
> （**服务商**＝提供 Claude 模型或兼容接口的一方，如 DeepSeek、Kimi 等，各有自己的接口地址和密钥。你在 cce 里把「怎么启动一次 claude」存成一套带名字的**启动配置**，本文叫它 **env**——它记录用哪个服务商、哪个模型、默认带什么参数。**同一个服务商也能配好几套 env**，启动时用名字点名其中一套。）
>
> 每次启动都是一个独立的子进程，所以每个终端窗口可以**同时**用不同服务商，全程不改动任何全局设置。

```bash
cce -e deepseek          # 用名为 deepseek 的配置启动 claude
cce pick                 # 弹出菜单，选完即启动
cce -e kimi -m cce       # 与 ~/.claude/settings.json 合并，冲突时 kimi 优先
```

---

## 为什么用它？

想在多个服务商之间切换 Claude Code，通常得手动改 `~/.claude/settings.json`（Claude Code 自己的配置文件），
或者重启一个全局代理 —— 而且没法让两个窗口同时用两个服务商。`cce` 只把对应的环境变量注入到它
**新拉起的 `claude` 子进程**里，所以每个窗口互相独立，你自己命令行环境的变量始终保持干净。

| 方案 | 每个窗口能独立切换？ | 一行命令搞定？ | 跨平台？ | 能用 npm 安装？ |
|---|---|---|---|---|
| 手动复制改写 `~/.claude/settings.json` | 否（全局共享一份） | ❌ | ✅ | — |
| [`cc-switch`](https://github.com/farion1231/cc-switch)（图形界面） | 否（全局共享一份） | ❌ | ✅ | — |
| [`claude-code-router`](https://github.com/musistudio/claude-code-router) | 否（全局代理） | ❌ | ✅ | ✅ |
| **`cce`** | **是（每个进程一份）** | **✅** | **✅** | **✅** |

## 功能特性

- 🚀 **一行命令** —— 用某套 env（启动配置）拉起 `claude`，一步到位。
- 🧩 **模板快速接入** —— `cce add` 从内置模板（DeepSeek、Kimi、GLM）选一个，填上你的 API Key 即生成一套 env；也能用自己的模板文件（见[从模板创建 env](docs/usage.md#从模板创建-env)）。
- 🪟 **每个进程独立** —— 不同窗口可同时用不同 env（不同服务商，或同一服务商的不同配置）；你命令行环境里的变量一字不动。
- ⚙️ **默认参数管理** —— 常用的 claude 启动参数（如 `--permission-mode bypassPermissions`）存进配置，可全局、也可按某个 env 单独设；`-a` 在此基础上追加、`-A` 整组覆盖。
- 🔀 **与 settings.json 合并** —— 三种模式（`override` / `cce` / `claude`）决定你的配置如何与 Claude Code 自己的 `~/.claude/settings.json` 合并。cce **从不改写**那个文件，而是另写一份临时文件、用 `claude --settings` 启动。
- 🔄 **自我更新** —— `cce update` 手动升级到 npm 最新版；启动时也能后台自动更新或提示（见[更新 cce](docs/usage.md#更新-cce)）。
- 🎛️ **交互式菜单** —— `cce pick` 弹出方向键选择菜单。
- 🌐 **中英双语界面** —— 自动检测系统语言，`cce lang` 可手动切换。
- 🐚 **命令行补全** —— bash、zsh、fish、PowerShell，连你自己起的 env 名字都能按 Tab 补全。
- 📦 **零配置安装** —— `npm i -g` 即可，凡是装了 Node 18+ 的地方都能跑。

---

## 安装

```bash
npm install -g @xiaofuzhou/cce
```

**要求：** Node.js ≥ 18，且 `claude` 在 PATH 中可用（或用 `CCE_CLAUDE_BIN` 指定其完整路径）。

| 系统 | Shell | 状态 |
|---|---|---|
| Windows 11 | PowerShell 7+、cmd | ✅ 已测试 |
| macOS | zsh、bash、fish | ✅ |
| Linux | bash、zsh、fish | ✅ |

---

## 快速开始

```bash
# 1. 从内置模板快速生成一套 env（选 deepseek/kimi/glm，填入你的 API Key 即可）
cce add
#    —— 或者打开配置文件手动添加（首次运行 cce 会自动写入一份带示例的起始文件）
cce edit

# 2. 看看配置了哪些（* 号标记的是默认项）
cce list

# 3. 指定一个默认，之后直接敲 cce 就用它
cce use deepseek

# 4. 用默认配置启动 claude
cce

# 5. ……或者弹出菜单手动挑一个
cce pick

# 6. 启动时临时追加 claude 的参数（叠加在配置的默认参数之上）
cce -e kimi -a "--permission-mode bypassPermissions"
```

一份最小的 `~/.claude/cce/config.json`：

```jsonc
{
  "version": 1,
  "default": "deepseek",
  "args": "--permission-mode bypassPermissions",
  "envs": {
    "deepseek": {
      "description": "DeepSeek（兼容 Claude 接口）",
      "env": {
        "ANTHROPIC_BASE_URL":   "https://api.deepseek.com/anthropic",
        "ANTHROPIC_AUTH_TOKEN": "sk-xxxxxxxxxxxx",
        "ANTHROPIC_MODEL":      "deepseek-chat"
      }
    },
    "kimi": {
      "description": "Moonshot Kimi K2",
      "env": {
        "ANTHROPIC_BASE_URL":   "https://api.moonshot.cn/anthropic",
        "ANTHROPIC_AUTH_TOKEN": "${KIMI_KEY}",
        "ANTHROPIC_MODEL":      "kimi-k2-0905-preview"
      }
    }
  }
}
```

> ⚠ **记住一条规则：** 所有要传给 claude 的命令行参数，都得包在 `-a "..."`（追加）或
> `-A "..."`（整组覆盖）里。`cce` **不会**把它不认识的参数直接转交给 claude —— 这样它就
> 永远不会和 claude 将来新增的参数撞车。

---

## 📖 完整文档

上面的快速开始覆盖了常见用法。其余内容 —— 完整的配置 schema、参数合并语义、三种
`settings.json` 合并模式、语言系统、交互式选择器、Shell 补全与排错 —— 详见
**[完整使用指南](docs/usage.md)**。

- **[使用指南](docs/usage.md)** —— 完整参考与示例
- **[设计文档](docs/DESIGN.md)** —— 架构与决策记录

---

## 与 cc-switch / claude-code-router 的关系

- **cc-switch** —— 图形界面的全局切换工具，与本工具不冲突。`cc-switch` 改 `~/.claude/settings.json` 当全局默认，`cce` 则在每个子进程里临时覆盖，两者可共存。
- **claude-code-router (CCR)** —— 把 CCR 当成 `cce` 的一个 env 配进去即可（接口地址填 `ANTHROPIC_BASE_URL=http://127.0.0.1:3456`），需要时 `cce -e ccr` 走它路由，不需要时直连其他服务商。

---

## 链接

- **npm**：https://www.npmjs.com/package/@xiaofuzhou/cce
- **GitHub**：https://github.com/zhouxiaofu/claude-code-env
- **Issues**：https://github.com/zhouxiaofu/claude-code-env/issues
- **Claude Code 文档**：https://docs.claude.com/en/docs/claude-code

## 许可证

[MIT](LICENSE)
