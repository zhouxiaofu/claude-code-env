# cce — Claude Code Env Launcher

<div align="center">

[简体中文](./README.md) | **English**

</div>

[![npm version](https://img.shields.io/npm/v/@xiaofuzhou/cce.svg)](https://www.npmjs.com/package/@xiaofuzhou/cce)
[![license](https://img.shields.io/npm/l/@xiaofuzhou/cce.svg)](LICENSE)
[![node](https://img.shields.io/node/v/@xiaofuzhou/cce.svg)](https://nodejs.org)

> One command to launch [Claude Code](https://docs.claude.com/en/docs/claude-code)
> against **any provider** — DeepSeek, Kimi, GLM, official Anthropic,
> [claude-code-router](https://github.com/musistudio/claude-code-router), or your
> own proxy. Each launch is an isolated child process, so every terminal window
> can run a different provider **in parallel**. Nothing global is touched.

```bash
cce -e deepseek          # launch claude with the deepseek env
cce pick                 # interactive menu, then launch
cce -e kimi -m cce       # merge env with ~/.claude/settings.json, kimi wins
```

---

## Why?

Switching Claude Code between providers usually means hand-editing
`~/.claude/settings.json` or restarting a global router — and neither lets two
windows use two providers at once. `cce` injects env vars **only into the
`claude` child process**, so each window is independent and your shell stays clean.

| Approach | Per-window? | One command? | Cross-platform? | npm-installable? |
|---|---|---|---|---|
| Copy `~/.claude/settings.json` by hand | global | ❌ | ✅ | — |
| [`cc-switch`](https://github.com/farion1231/cc-switch) (GUI) | global | ❌ | ✅ | — |
| [`claude-code-router`](https://github.com/musistudio/claude-code-router) | global (proxy) | ❌ | ✅ | ✅ |
| **`cce`** | **per-process** | **✅** | **✅** | **✅** |

## Features

- 🚀 **One command** — inject a provider's env and start `claude` in one go.
- 🧩 **Template-based setup** — `cce add` picks a built-in template (DeepSeek, Kimi, GLM), you fill in your API key, and it writes a ready-to-use env; bring your own template file too (see [Create an env from a template](docs/usage.en.md#create-an-env-from-a-template)).
- 🪟 **Per-process isolation** — run different providers in different windows simultaneously; your shell and system env are never modified.
- ⚙️ **Default args management** — store common claude flags (e.g. `--permission-mode bypassPermissions`) globally or per-env; `-a` to merge, `-A` to override.
- 🔀 **settings.json reconciliation** — three modes (`override` / `cce` / `claude`) decide how an env merges with your `~/.claude/settings.json`. cce **never edits** that file; it builds a short-lived temp file and runs `claude --settings`.
- 🔄 **Self-update** — `cce update` upgrades to the latest npm version; launches can also auto-update in the background or prompt you (see [Updating cce](docs/usage.en.md#updating-cce)).
- 🎛️ **Interactive picker** — `cce pick` for an arrow-key menu.
- 🌐 **Multi-language UI** — English and 简体中文, auto-detected, switchable with `cce lang`.
- 🐚 **Shell completion** — bash, zsh, fish, PowerShell, including your own env names.
- 📦 **Zero-config install** — `npm i -g`, runs anywhere Node 18+ does.

---

## Install

```bash
npm install -g @xiaofuzhou/cce
```

**Requirements:** Node.js ≥ 18, and Claude Code available as `claude` on your
PATH (or set `CCE_CLAUDE_BIN` to its full path).

| OS | Shell | Status |
|---|---|---|
| Windows 11 | PowerShell 7+, cmd | ✅ tested |
| macOS | zsh, bash, fish | ✅ |
| Linux | bash, zsh, fish | ✅ |

---

## Quickstart

```bash
# 1. Generate an env from a built-in template (pick deepseek/kimi/glm, paste your API key)
cce add
#    ...or open the config to add one by hand (cce writes a starter file the first time)
cce edit

# 2. List what you've got (* marks the default)
cce list

# 3. Set a default so bare `cce` uses it
cce use deepseek

# 4. Launch claude with the default env
cce

# 5. ...or pick interactively
cce pick

# 6. Pass extra claude flags (merged with your config defaults)
cce -e kimi -a "--permission-mode bypassPermissions"
```

A minimal `~/.claude/cce/config.json`:

```jsonc
{
  "version": 1,
  "default": "deepseek",
  "args": "--permission-mode bypassPermissions",
  "envs": {
    "deepseek": {
      "description": "DeepSeek (Anthropic-compatible endpoint)",
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

> ⚠ **One rule to remember:** all claude CLI flags go inside `-a "..."` (merge)
> or `-A "..."` (override). `cce` does **not** forward unknown flags directly —
> this guarantees it never collides with a future claude flag.

---

## 📖 Full documentation

The quick start above covers the common path. For everything else — the complete
config schema, args merge semantics, the three `settings.json` reconciliation
modes, the language system, the interactive picker, shell completion, and
troubleshooting — see the **[Full Usage Guide](docs/usage.en.md)**.

- **[Usage Guide](docs/usage.en.md)** — complete reference and examples
- **[Design Doc](docs/DESIGN.en.md)** — architecture and decision records

---

## Relationship to cc-switch / claude-code-router

- **cc-switch** — a GUI for global switching; it doesn't conflict with cce. `cc-switch` edits `~/.claude/settings.json` as a global default, while `cce` overrides at the child-process level, so the two can coexist.
- **claude-code-router (CCR)** — just configure CCR as one of your cce envs (`ANTHROPIC_BASE_URL=http://127.0.0.1:3456`). Run `cce -e ccr` when you want routing, and connect directly to other providers when you don't.

---

## Links

- **npm**: https://www.npmjs.com/package/@xiaofuzhou/cce
- **GitHub**: https://github.com/zhouxiaofu/claude-code-env
- **Issues**: https://github.com/zhouxiaofu/claude-code-env/issues
- **Claude Code docs**: https://docs.claude.com/en/docs/claude-code

## License

[MIT](LICENSE)
