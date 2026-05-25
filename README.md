# cce — Claude Code 多 Provider 启动器

<div align="center">

**简体中文** | [English](./README.en.md)

</div>

[![npm version](https://img.shields.io/npm/v/@xiaofuzhou/cce.svg)](https://www.npmjs.com/package/@xiaofuzhou/cce)
[![license](https://img.shields.io/npm/l/@xiaofuzhou/cce.svg)](LICENSE)
[![node](https://img.shields.io/node/v/@xiaofuzhou/cce.svg)](https://nodejs.org)

> 一行命令，用**任意 provider** 启动 [Claude Code](https://docs.claude.com/en/docs/claude-code)
> —— DeepSeek、Kimi、GLM、官方 Anthropic、[claude-code-router](https://github.com/musistudio/claude-code-router)
> 或你自己的代理。每次启动都是独立子进程，因此每个终端窗口都能**并行**跑不同的
> provider，全程不碰任何全局状态。

```bash
cce -e deepseek          # 用 deepseek env 启动 claude
cce pick                 # 交互式菜单，选完即启动
cce -e kimi -m cce       # 与 ~/.claude/settings.json 合并，kimi 优先
```

---

## 为什么用它？

在多个 provider 间切换 Claude Code，通常得手改 `~/.claude/settings.json` 或重启全局路由
—— 而且没法让两个窗口同时用两个 provider。`cce` 只把环境变量注入到 **`claude` 子进程**，
因此每个窗口互相独立，你的 shell 始终保持干净。

| 方案 | 每窗口独立？ | 一行命令？ | 跨平台？ | npm 可装？ |
|---|---|---|---|---|
| 手动 copy `~/.claude/settings.json` | 全局 | ❌ | ✅ | — |
| [`cc-switch`](https://github.com/farion1231/cc-switch)（GUI） | 全局 | ❌ | ✅ | — |
| [`claude-code-router`](https://github.com/musistudio/claude-code-router) | 全局（代理） | ❌ | ✅ | ✅ |
| **`cce`** | **每进程** | **✅** | **✅** | **✅** |

## 功能特性

- 🚀 **一行命令** —— 注入某个 provider 的 env 并启动 `claude`，一步到位。
- 🪟 **每进程独立** —— 不同窗口可同时跑不同 provider；你的 shell 和系统环境一字不动。
- ⚙️ **默认参数管理** —— 常用 claude 参数（如 `--permission-mode bypassPermissions`）存进配置，全局或 per-env；`-a` 追加、`-A` 覆盖。
- 🔀 **settings.json 合并** —— 三种模式（`override` / `cce` / `claude`）决定 env 如何与 `~/.claude/settings.json` 合并。cce **从不改写**该文件，而是生成临时文件用 `claude --settings` 启动。
- 🎛️ **交互式选择器** —— `cce pick` 弹出方向键菜单。
- 🌐 **多语言界面** —— 中文 / 英文，自动检测，`cce lang` 可切换。
- 🐚 **Shell 补全** —— bash、zsh、fish、PowerShell，连你自己的 env 名都能补全。
- 📦 **零配置安装** —— `npm i -g`，凡是有 Node 18+ 的地方都能跑。

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
# 1. 打开配置添加你的 env（首次运行 cce 会写入一份起始文件）
cce edit

# 2. 看看都有哪些 env（* 标记默认项）
cce list

# 3. 设一个默认，裸 `cce` 就会用它
cce use deepseek

# 4. 用默认 env 启动 claude
cce

# 5. ……或交互式选择
cce pick

# 6. 传入额外的 claude 参数（与配置默认合并）
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
      "description": "DeepSeek（Anthropic 兼容端点）",
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

> ⚠ **记住一条规则：** 所有 claude 的 CLI flag 都要包在 `-a "..."`（合并）或
> `-A "..."`（覆盖）里。`cce` **不会**直接透传未知 flag —— 这保证它永远不会与
> claude 未来新增的 flag 冲突。

---

## 📖 完整文档

上面的快速开始覆盖了常见用法。其余内容 —— 完整的配置 schema、参数合并语义、三种
`settings.json` 合并模式、语言系统、交互式选择器、Shell 补全与排错 —— 详见
**[完整使用指南](docs/usage.md)**。

- **[使用指南](docs/usage.md)** —— 完整参考与示例
- **[设计文档](docs/DESIGN.md)** —— 架构与决策记录

---

## 与 cc-switch / claude-code-router 的关系

- **cc-switch** —— GUI 全局切换工具，与本工具不冲突。`cc-switch` 改 `~/.claude/settings.json` 当全局默认，`cce` 在子进程级覆盖，两者可共存。
- **claude-code-router (CCR)** —— 把 CCR 配成 `cce` 的一个 env 即可（`ANTHROPIC_BASE_URL=http://127.0.0.1:3456`），需要时 `cce -e ccr` 走路由，不需要时直连其他 provider。

---

## 链接

- **npm**：https://www.npmjs.com/package/@xiaofuzhou/cce
- **GitHub**：https://github.com/zhouxiaofu/claude-code-env
- **Issues**：https://github.com/zhouxiaofu/claude-code-env/issues
- **Claude Code 文档**：https://docs.claude.com/en/docs/claude-code

## 许可证

[MIT](LICENSE)
