# cce — Claude Code Env Launcher

[![npm version](https://img.shields.io/npm/v/@xiaofuzhou/cce.svg)](https://www.npmjs.com/package/@xiaofuzhou/cce)
[![license](https://img.shields.io/npm/l/@xiaofuzhou/cce.svg)](LICENSE)

> Per-process environment launcher for [Claude Code](https://docs.claude.com/en/docs/claude-code). One command to inject any provider's env (DeepSeek / Kimi / GLM / claude-code-router / official Anthropic / your own proxy) and start `claude`, with default CLI args managed in config.

```bash
cce -e deepseek                                      # launch claude with deepseek env
cce -e deepseek -a "--permission-mode bypassPermissions"   # plus extra claude args
cce pick                                             # interactive menu, then launch
```

---

## Why?

If you switch Claude Code between multiple providers (DeepSeek, Kimi, GLM, official Anthropic, [CCR](https://github.com/musistudio/claude-code-router), local proxies), today you usually copy `~/.claude/settings.json` by hand or restart a global router. Neither lets each terminal window use a different provider in parallel.

`cce` injects env vars **only into the `claude` child process**, so every terminal/window can launch its own provider independently. Nothing in your shell or system is touched.

| Approach | Per-window? | One command? | Cross-platform? | npm-installable? |
|---|---|---|---|---|
| Copy `~/.claude/settings.json` by hand | global | ❌ | ✅ | — |
| [`cc-switch`](https://github.com/farion1231/cc-switch) (GUI) | global | ❌ | ✅ | — |
| [`claude-code-router`](https://github.com/musistudio/claude-code-router) | global (proxy) | ❌ | ✅ | ✅ |
| PowerShell profile functions | per-window | ✅ | ❌ (PS only) | ❌ |
| **`cce`** | **per-process** | **✅** | **✅** | **✅** |

---

## Install

```bash
npm install -g @xiaofuzhou/cce
```

### Requirements

- **Node.js ≥ 18**
- **Claude Code** installed and available as `claude` on PATH (or set `CCE_CLAUDE_BIN` to its full path)

### Supported platforms

| OS | Shell | Status |
|---|---|---|
| Windows 11 | PowerShell 7+, cmd | ✅ tested |
| macOS | zsh, bash, fish | ✅ |
| Linux | bash, zsh, fish | ✅ |

---

## Quickstart

```bash
# 1. Edit config to add your envs (cce writes a starter file the first time)
cce edit

# 2. List what you've got
cce list

# 3. Set a default (so bare `cce` uses it)
cce use deepseek

# 4. Launch claude with the default env
cce

# 5. Or pick interactively
cce pick

# 6. Pass extra claude flags (merged with config defaults)
cce -e kimi -a "--permission-mode bypassPermissions"
cce -e kimi -a "-c"            # claude's own -c (continue) wrapped in -a
```

> ⚠ **All claude CLI flags go inside `-a "..."` or `-A "..."`.** cce does **not** pass unknown flags through directly — this guarantees no collisions with future claude flags.

---

## Commands

```
cce [options]                       launch claude with default or selected env
cce <subcommand> [args...]          manage envs

LAUNCH OPTIONS
  -e, --env <name>                  use a specific env for this launch
  -a "<args>"                       merge claude args with config defaults (repeatable)
  -A "<args>"                       override config defaults, use only these args
                                    (bare -A at end = launch claude with no args)
  -h, --help                        show help
  -v, --version                     show version

SUBCOMMANDS
  list, ls                          list all envs (* marks the default)
  show <name>                       show an env's variables + merged claude args
  edit                              open config.json in $EDITOR (add/remove envs by hand)
  use <name>                        set the default env (or --none to clear)
  current                           print the default env name
  pick [-a/-A ...]                  interactively pick an env, then launch claude
  completion <shell>                output shell completion script (bash|zsh|powershell|fish)
  help                              show this help
```

---

## Configuration

`cce` stores everything in **`~/.claude/cce/config.json`** (Windows: `%USERPROFILE%\.claude\cce\config.json`). Override the location with `CCE_CONFIG_HOME`.

### Schema

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | integer | yes | Config schema version (currently `1`) |
| `default` | string \| null | no | Env name used when `cce` is invoked with no `-e`. If null/missing, bare `cce` opens the interactive picker (TTY) or launches without env injection (non-TTY). |
| `args` | string | no | **Global** default claude CLI args (shell-tokenized). Prepended to every launch. Example: `"--permission-mode bypassPermissions"` |
| `envs.<name>` | object | yes | A named env. The key (`<name>`) is what you pass to `-e`. Must match `[A-Za-z0-9][A-Za-z0-9._-]*`. |
| `envs.<name>.description` | string | no | Human-readable description shown in `cce list` and `cce show`. |
| `envs.<name>.env` | object | yes | Environment variables to inject into the `claude` child process. **Field name matches Claude Code's own `~/.claude/settings.json` `env` block, so you can copy-paste blocks directly.** Values may contain `${VAR}` placeholders, resolved from the parent shell env at launch time. |
| `envs.<name>.args` | string | no | Per-env claude args (shell-tokenized). By default merged onto the global `args`; set `argsOverride: true` to replace global instead. |
| `envs.<name>.argsOverride` | boolean | no | Default `false`. If `true`, this env's `args` **replace** the global `args` (instead of merging). The CLI's `-a` flag is still appended on top. |

### Annotated example

```jsonc
{
  "version": 1,
  "default": "claude",                                 // bare `cce` uses this env

  // Global default claude args — applied to every launch.
  // To skip them for one launch, use `-A "..."` on the command line.
  "args": "--permission-mode bypassPermissions",

  "envs": {
    "claude": {
      "description": "Claude official subscription (via local proxy)",
      // Empty `env: {}` means: don't override ANTHROPIC_* — let claude use
      // its own ~/.claude credentials (Pro/Max subscription auth).
      // We still set HTTP_PROXY here so claude routes through a local proxy.
      "env": {
        "HTTP_PROXY": "http://127.0.0.1:10808",
        "HTTPS_PROXY": "http://127.0.0.1:10808",
        "NO_PROXY": "localhost,127.0.0.1"
      }
    },

    "deepseek": {
      "description": "DeepSeek V4 Pro (Anthropic-compatible endpoint)",
      // Per-env args: merged on top of global → effective args =
      // "--permission-mode bypassPermissions --add-dir D:\\code"
      "args": "--add-dir D:\\code",
      "env": {
        "ANTHROPIC_BASE_URL":            "https://api.deepseek.com/anthropic",
        "ANTHROPIC_AUTH_TOKEN":          "sk-xxxxxxxxxxxx",
        "ANTHROPIC_MODEL":               "deepseek-v4-pro",
        "ANTHROPIC_DEFAULT_OPUS_MODEL":  "deepseek-v4-pro",
        "ANTHROPIC_DEFAULT_SONNET_MODEL":"deepseek-v4-pro",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": "deepseek-v4-flash",
        "CLAUDE_CODE_SUBAGENT_MODEL":    "deepseek-v4-flash",
        "CLAUDE_CODE_EFFORT_LEVEL":      "max"
      }
    },

    "kimi": {
      "description": "Moonshot Kimi K2",
      "env": {
        "ANTHROPIC_BASE_URL":   "https://api.moonshot.cn/anthropic",
        // ${VAR} is resolved from your shell env at launch time —
        // keep secrets out of this file by exporting KIMI_KEY in your rc.
        "ANTHROPIC_AUTH_TOKEN": "${KIMI_KEY}",
        "ANTHROPIC_MODEL":      "kimi-k2-0905-preview"
      }
    },

    "ccr": {
      "description": "Local claude-code-router",
      "env": {
        "ANTHROPIC_BASE_URL":   "http://127.0.0.1:3456",
        "ANTHROPIC_AUTH_TOKEN": "any"
      }
    },

    "raw": {
      "description": "Verbose-only run, ignore global args",
      "args": "--verbose",
      "argsOverride": true,           // ← global `args` are dropped for this env
      "env": {}
    }
  }
}
```

### Default args — merge semantics

`cce` does **pure concatenation** when combining args layers:

```
final = (envEntry.argsOverride ? "" : globalArgs) + " " + envEntry.args + " " + all -a "..."
```

Then shell-tokenized into argv and passed to `claude`. cce does **not** dedupe — claude itself handles repeated flags (most are last-wins; repeatable flags like `--add-dir` stack).

| Command | What spawns |
|---|---|
| `cce -e deepseek` | `claude --permission-mode bypassPermissions --add-dir D:\code` |
| `cce -e deepseek -a "--resume X"` | `claude --permission-mode bypassPermissions --add-dir D:\code --resume X` |
| `cce -e deepseek -A "--resume X"` | `claude --resume X` (all defaults dropped) |
| `cce -e deepseek -A` | `claude` (no args at all) |
| `cce -e raw` | `claude --verbose` (env's `argsOverride: true` drops global) |
| `cce -e foo -a "X" -A "Y"` | **Error**: `-a and -A are mutually exclusive` |

Tokenizer rule (Windows-friendly): **backslashes are always literal**, only quotes group tokens. So `--add-dir D:\code` works as expected; for paths with spaces, quote them: `--add-dir 'D:\My Code'`.

### Env-leak protection

Before spawning `claude`, `cce` strips these vars from the inherited env so a leaked `export ANTHROPIC_BASE_URL=...` in your shell can never silently override:

```
ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_API_KEY,
ANTHROPIC_MODEL, ANTHROPIC_SMALL_FAST_MODEL,
ANTHROPIC_DEFAULT_HAIKU_MODEL, ANTHROPIC_DEFAULT_SONNET_MODEL, ANTHROPIC_DEFAULT_OPUS_MODEL
```

To keep one explicitly, reference it from the env entry: `"ANTHROPIC_BASE_URL": "${ANTHROPIC_BASE_URL}"`.

---

## Interactive picker

`cce pick` opens a keyboard menu, then launches claude with the chosen env:

```
Pick an env to launch claude:

❯ * claude     Claude official subscription (via local proxy)
    deepseek   DeepSeek V4 Pro
    kimi       Moonshot Kimi K2
    ccr        Local claude-code-router

  ↑/↓ navigate · Enter select · Esc/Ctrl+C cancel
```

- `*` marks the current default (cursor starts on it — Enter is the obvious choice)
- `↑/↓` or `k/j` to move, number keys `1`–`9` jump, `Enter` selects, `Esc`/`Ctrl+C`/`q` cancels
- Picking does **not** change your default — use `cce use <name>` for that
- Bare `cce` also opens the picker if you have envs configured but no default set
- `-a` / `-A` work too: `cce pick -a "--verbose"`

---

## Shell completion

`cce completion <shell>` prints a completion script to stdout. Install once:

| Shell | Install |
|---|---|
| **bash** | `cce completion bash >> ~/.bashrc` then `source ~/.bashrc` |
| **zsh** | `cce completion zsh >> ~/.zshrc` then `source ~/.zshrc` |
| **fish** | `cce completion fish > ~/.config/fish/completions/cce.fish` |
| **PowerShell** | `cce completion powershell >> $PROFILE` then `. $PROFILE` |

You get Tab completion for subcommands, flags, and — most usefully — your own env names after `-e` / `--env` / `use` / `show`.

```bash
cce -e <Tab>       # → claude  deepseek  kimi  ccr
cce use <Tab>      # → claude  deepseek  kimi  ccr
```

---

## Environment variables

| Variable | Purpose |
|---|---|
| `CCE_CONFIG_HOME` | Override config directory (default `~/.claude/cce/`) |
| `CCE_CLAUDE_BIN` | Full path to the `claude` executable (skip PATH lookup) |
| `CCE_QUIET=1` | Suppress the `[cce]` startup lines |
| `CCE_DEBUG=1` | Print stack traces on internal errors |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Could not find the claude executable` | Install Claude Code, ensure `claude` is on PATH, or set `CCE_CLAUDE_BIN=/full/path/to/claude` |
| `Env "X" does not exist` | `cce list` to see what's defined; `cce edit` to add one |
| `Unknown option: --foo` | All claude args go inside `-a "..."` (merge) or `-A "..."` (override). cce does not pass unknown flags through directly. |
| `-a and -A are mutually exclusive` | Pick one: `-a` to add to defaults, `-A` to replace them. |
| `default env "X" does not exist in config` | `cce use <name>` to switch, or `cce edit` to fix the config. Bare `cce` will fall back to the picker. |
| Config file got corrupted | Look for `config.json.bak.<timestamp>` next to it — `cce` saves a backup before failing |
| Switched env but still hitting old endpoint | Check `${VAR}` placeholders resolve in your shell env; verify with `cce show <name>` |

---

## 中文简介

`cce` 是 Claude Code 的多 provider 启动器。

- **一行命令**：`cce -e deepseek` 同时完成 env 注入 + 启动 claude
- **每进程独立**：每个窗口/每次调用都是独立的子进程，env 互不污染，可以同时跑多个不同 provider
- **默认参数管理**：常用的 claude 参数（如 `--permission-mode bypassPermissions`）存进 config 的 `args` 字段，全局或 per-env，启动时自动注入。`-a` 追加、`-A` 覆盖
- **交互式选择**：`cce pick` 弹方向键菜单选 env，选完直接起 claude
- **跨平台**：Windows / macOS / Linux 通过 `npm i -g @xiaofuzhou/cce` 一键安装
- **Shell 补全**：bash / zsh / fish / PowerShell 都支持

### 重要规则

cce **不再隐式透传** claude 参数。所有 claude 的 CLI flag（`-c`、`--permission-mode`、`--add-dir` 等）必须包在 `-a "..."` 或 `-A "..."` 字符串里传给 cce。这一变化让 cce 永远不会跟 claude 未来新增的 flag 冲突。

### 配置 env

term：一个 **env** 是一组命名的环境变量（`env` 字段名与 claude `settings.json` 的 `env` 块一致，可直接复制粘贴）。配置文件位于 `~/.claude/cce/config.json`，详见上文 [Configuration](#configuration) 章节。

### 与 cc-switch / claude-code-router 的关系

- **cc-switch**：GUI 全局切换工具，与本工具不冲突。`cc-switch` 改 `~/.claude/settings.json` 当作全局默认，`cce` 在子进程级别覆盖，两者可以共存
- **claude-code-router (CCR)**：把 CCR 配成 `cce` 的一个 env 即可（`ANTHROPIC_BASE_URL=http://127.0.0.1:3456`），需要时 `cce -e ccr` 走路由，不需要时直连其他 provider

---

## Links

- **npm**: https://www.npmjs.com/package/@xiaofuzhou/cce
- **GitHub**: https://github.com/zhouxiaofu/claude-code-env
- **Issues**: https://github.com/zhouxiaofu/claude-code-env/issues
- **Claude Code docs**: https://docs.claude.com/en/docs/claude-code

## License

[MIT](LICENSE)
