# cce — Claude Code Env Launcher

<div align="center">

[简体中文](./README.md) | **English**

</div>

[![npm version](https://img.shields.io/npm/v/@xiaofuzhou/cce.svg)](https://www.npmjs.com/package/@xiaofuzhou/cce)
[![license](https://img.shields.io/npm/l/@xiaofuzhou/cce.svg)](LICENSE)
[![node](https://img.shields.io/node/v/@xiaofuzhou/cce.svg)](https://nodejs.org)

**One command to run [Claude Code](https://docs.claude.com/en/docs/claude-code) on any third-party model** — DeepSeek, Kimi, Zhipu GLM, official Anthropic, or your own proxy.

cce stores each provider setup (base URL, API key, model) as a named launch config and injects it **only into the `claude` child process it spawns** — no global file is ever touched, so different terminal windows can run different providers **at the same time**.

```bash
cce                # launch Claude Code with the default env
cce -e deepseek    # this window: DeepSeek
cce -e kimi        # another window: Kimi, simultaneously
cce pick           # or pick from an interactive menu
```

---

## Any third-party API in 30 seconds

```bash
npm install -g @xiaofuzhou/cce   # requires Node ≥ 18, `claude` on PATH

cce add            # pick a template from the menu (DeepSeek as an example):
                   #   › deepseek  DeepSeek (Claude-compatible API)
                   #     kimi      Moonshot Kimi K2.5
                   #     glm5.2    Zhipu GLM-5.2
                   #     mimo      Xiaomi MiMo pay-as-you-go API
                   #     mimo-tp   Xiaomi MiMo Token Plan subscription
                   # then paste your API key (from platform.deepseek.com) — everything else is preset
cce                # launch Claude Code, already running on DeepSeek
```

Base URL, model mapping, and the rest are preconfigured in the template — you only fill in the API key. `cce add deepseek` skips the menu; templates are fetched from GitHub and cached locally, managed with `cce template`.

Prefer doing it by hand? `cce edit` opens the config file (`~/.claude/cce/config.json`):

```jsonc
{
  "version": 1,
  "default": "deepseek",
  "envs": {
    "deepseek": {
      "env": {
        "ANTHROPIC_BASE_URL":   "https://api.deepseek.com/anthropic",
        "ANTHROPIC_AUTH_TOKEN": "sk-xxxxxxxxxxxx",
        "ANTHROPIC_MODEL":      "deepseek-v4-pro"
      }
    }
  }
}
```

---

## How is this different from cc-switch?

In one sentence: [cc-switch](https://github.com/farion1231/cc-switch) switches providers by **rewriting the global config** (`~/.claude/settings.json`), so there is one provider for everything; cce injects env vars into **each launched child process**, leaving global config untouched.

| | **cce** | cc-switch |
|---|---|---|
| Form | CLI, `npm i -g` | GUI application |
| Switching | env vars injected per child process | rewrites `~/.claude/settings.json` |
| Different providers in parallel windows | ✅ per-process | ❌ one global setting |
| Touches global config | never | on every switch |
| Scriptable / CI-friendly | ✅ | ❌ |

They don't conflict — let cc-switch manage the global default and use cce for per-window overrides. Using [claude-code-router](https://github.com/musistudio/claude-code-router)? Configure it as one cce env (`ANTHROPIC_BASE_URL=http://127.0.0.1:3456`) and route only when you want to.

---

## Common commands

| Command | What it does |
|---|---|
| `cce` | launch claude with the default env |
| `cce -e <name>` | launch with a specific env |
| `cce pick` | interactive menu, then launch |
| `cce add` / `cce remove` | create from template / delete an env |
| `cce list` / `cce use <name>` | list envs / set the default |
| `cce -a "--permission-mode bypassPermissions"` | append extra claude flags |
| `cce update` | upgrade cce to the latest npm version |

> ⚠ All claude CLI flags go inside `-a "..."` (append) or `-A "..."` (override) — cce never forwards flags it doesn't recognize.

More under the hood: default-args management (global or per-env), three merge modes against `~/.claude/settings.json` (cce never edits that file), English/Chinese UI, Tab completion for four shells (including your env names), background self-update. See the docs:

- **[Usage Guide](docs/usage.en.md)** — full config schema, merge semantics, troubleshooting
- **[Design Doc](docs/DESIGN.en.md)** — architecture and decision records

---

## Links

- **npm**: https://www.npmjs.com/package/@xiaofuzhou/cce
- **GitHub**: https://github.com/zhouxiaofu/claude-code-env
- **Issues**: https://github.com/zhouxiaofu/claude-code-env/issues

## License

[MIT](LICENSE)
