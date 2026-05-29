# cce — Full Usage Guide

<div align="center">

[简体中文](./usage.md) | **English**

</div>

This is the complete reference for **`cce`** (Claude Code Env Launcher). For a
quick introduction and install instructions, see the [README](../README.en.md).

> **One-line model:** `cce` reads a small config of named *environments*, injects
> the one you pick into a fresh `claude` child process, and exits with claude's
> exit code. Nothing global is touched — every terminal window can run a
> different provider in parallel.

---

## Table of contents

- [Concepts](#concepts)
- [Command reference](#command-reference)
  - [Launch mode](#launch-mode)
  - [Subcommands](#subcommands)
- [Create an env from a template](#create-an-env-from-a-template)
- [Configuration file](#configuration-file)
  - [Location](#location)
  - [Full schema](#full-schema)
  - [Annotated example](#annotated-example)
- [Claude args management](#claude-args-management)
- [settings.json reconciliation](#settingsjson-reconciliation)
  - [The problem](#the-problem)
  - [How cce solves it](#how-cce-solves-it)
  - [The three modes](#the-three-modes)
  - [Choosing a mode (layering)](#choosing-a-mode-layering)
  - [Temp file lifecycle & safety](#temp-file-lifecycle--safety)
- [Env-leak protection](#env-leak-protection)
- [Language / i18n](#language--i18n)
- [Interactive picker](#interactive-picker)
- [Shell completion](#shell-completion)
- [Updating cce](#updating-cce)
- [Environment variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

---

## Concepts

An **env** is a named bundle of environment variables (plus optional default
claude args). The `env` block uses the **exact same shape** as Claude Code's own
`~/.claude/settings.json` `env` block, so you can copy-paste provider blocks
straight in.

`cce` is *only a launcher*. It does not proxy traffic, does not run in the
background, and does not modify any global state. When you run `cce -e deepseek`:

1. It reads `~/.claude/cce/config.json`.
2. It resolves the `deepseek` env (expanding any `${VAR}` placeholders).
3. It reconciles that env with your `~/.claude/settings.json` (see
   [settings.json reconciliation](#settingsjson-reconciliation)).
4. It spawns `claude` with `stdio: 'inherit'`, so claude's interactive UI works
   exactly as if you'd run it directly.
5. When claude exits, `cce` forwards its exit code and any temp file is deleted.

---

## Command reference

```
cce [options]                 launch claude with the default or selected env
cce <subcommand> [args...]    manage envs
```

### Launch mode

| Option | Description |
|---|---|
| `-e, --env <name>` | Use a specific env for this launch (otherwise the config `default`). |
| `-a "<args>"` | **Merge** claude args onto the config defaults (repeatable). |
| `-A "<args>"` | **Override**: use only these claude args, drop all config defaults. A bare `-A` at the end of the command launches claude with no args at all. |
| `-m, --merge-mode <mode>` | How this env's `env` reconciles with `settings.json`: `override` (default), `cce`, or `claude`. See [reconciliation](#settingsjson-reconciliation). |
| `-h, --help` | Show help. |
| `-v, --version` | Show version. |

> **Important:** `cce` does **not** pass unknown flags through to claude. Every
> claude CLI flag must be wrapped in `-a "..."` or `-A "..."`. This keeps cce's
> own flag space closed, so it can never collide with a future claude flag.

```bash
cce                                              # default env + config args
cce -e kimi                                      # switch env for this run
cce -e kimi -a "--permission-mode bypassPermissions"   # merge extra claude args
cce -e kimi -a "-c"                              # claude's own -c, wrapped in -a
cce -e kimi -A "--resume SESSION_ID"             # override all config defaults
cce -e kimi -A                                   # launch bare claude, no args
cce -e kimi -m cce                               # merge env with settings.json, kimi wins
```

### Subcommands

| Command | Description |
|---|---|
| `list`, `ls` | List all envs; `*` marks the current default. |
| `add [tpl] [name]` | **Create an env from a template** (interactively pick a template and fill in fields). `--from <path\|URL>` uses an alternate template source for this run. See [Create an env from a template](#create-an-env-from-a-template). |
| `remove`, `rm [name]` | Remove an env (asks to confirm; `-y` skips; no name = picker). Clears the default if the removed env was it. |
| `template`, `tpl [...]` | Manage the template source and cache: `ls`/`list`, `show <name>`, `refresh`, `url`, `offline`. See [Managing templates (cce template)](#managing-templates-cce-template). |
| `show <name>` | Show an env's variables, its resolved settings mode, and the merged claude args (with per-layer source labels). API tokens are masked. |
| `edit` | Open `config.json` in `$EDITOR` (Windows default: notepad). The canonical way to add/edit/remove envs by hand. |
| `use <name>` | Set the default env. `cce use --none` clears it. |
| `current` | Print the current default env name. |
| `lang [en\|zh-CN\|auto]` | Show or set the UI language (persists to config). See [Language / i18n](#language--i18n). |
| `pick [-a/-A/-m ...]` | Interactively pick an env from a menu, then launch claude. |
| `completion <shell>` | Print a shell completion script (`bash`/`zsh`/`fish`/`powershell`). |
| `update [--check]` | Update cce itself to the latest npm version. Add `--check` to report only, without installing. See [Updating cce](#updating-cce). |
| `help` | Show help. |

> `cce add` does exactly one thing: **quickly scaffold an env from a template**.
> For bulk add/edit or fine-grained hand-editing, `cce edit` opens the JSON
> directly (the file carries a `$schema` reference, so editors give you completion
> and validation).

---

## Create an env from a template

`cce add` scaffolds an env from a **template**: the fixed parts (base URL, model,
etc.) are pre-filled, you supply only the few fields that are yours (usually an
API key), and it writes the whole thing into `config.json`.

```bash
cce add                          # pick a template → fill fields → name it → write
cce add deepseek                 # use the "deepseek" template directly, skip the menu
cce add deepseek ds              # also preset the new env's name to "ds"
cce template ls                  # just list available templates (name/description/source), no creation
cce add --from ./team.json       # use an external template file (path) for this run
cce add --from https://host/t.json  # use a remote template file (URL) for this run
```

**A run goes roughly like this:**

1. **Pick a template** — with no template name, an arrow-key menu opens; with a
   name (`cce add deepseek`) it's used directly.
2. **Fill the fields** — each field the template marks as required is prompted in
   turn (e.g. `ANTHROPIC_AUTH_TOKEN`). A field with a default accepts it on Enter;
   one without a default re-prompts on empty input (it is, after all, required).
   This step is skipped when the template has no fields to fill.
3. **Name it + dedupe** — name the env (defaults to the template name, Enter to
   accept). The name must match `[A-Za-z0-9][A-Za-z0-9._-]*`. **If the name already
   exists**, you choose: **overwrite the existing one**, or **give the new one a
   different name**.
4. **Write** — the template's fixed entries plus your filled fields merge into the
   `env` written to `config.json`, and you're asked whether to set it as the default.

> Picking and filling both need a **TTY** (a human at a terminal). In scripts/pipes,
> pass everything up front — `cce add <template> <name>` — with a template that has
> no fields to fill; otherwise cce tells you it needs a TTY rather than hanging.

### Where templates come from

The default templates are **no longer bundled with the npm package** — they are
fetched live from the GitHub repo (so you always get the latest) and cached
locally. `cce add` layers the sources below, where a **later source overrides an
earlier one by template name**:

```
Default templates (fetched remotely + cached in templates.remote.json)
  └─ overridden by → ~/.claude/cce/templates.json   (your own templates, optional)
```

With `--from <path|URL>`, the **default layer is replaced** by the source you give
(no remote fetch of the defaults); your `templates.json` still layers on top.

- **Default (remote + cache)**: on the first `cce add`, DeepSeek/Kimi/GLM and friends
  are downloaded from the default source into `~/.claude/cce/templates.remote.json`.
  For the next **24 hours** the cache is used as-is; after that it refetches once.
  The default source is jsDelivr (a CDN, reachable in mainland China), falling back
  to GitHub raw.
  - **If the download fails**, cce prints the template URL and the path to save it
    to — download it on a networked device and drop it in there.
  - Use the `cce template` commands to inspect / refresh / re-point / go offline (next section).
- **User file**: drop a `templates.json` in the config dir (next to `config.json`)
  to add your own templates, or override a default one by reusing its key.
- **`--from <path|URL>`**: affects this run only (no cache write, no config change).
  A value starting with `http://` / `https://` is treated as a URL, otherwise as a
  local file path. Handy for trying a template file someone sent you.

### Managing templates (cce template)

`cce template` (alias `cce tpl`) centralizes the source and cache of the default
templates. **It only matters when you use the default templates (no `--from`).**

```bash
cce template                 # status: current url, offline flag, #cached templates / how long ago fetched
cce template ls              # list available templates (= the old cce add --list)
cce template list            # same as ls
cce template show deepseek   # show a template's fixed env + fields to fill
cce template refresh         # re-download now (ignores the 24h TTL and offline flag); prints the URL on failure
cce template url <url>       # point the default source at a single URL (e.g. an intranet mirror) — no jsDelivr/raw fallback
cce template url --none      # clear the override, back to the default sources
cce template offline on      # offline: never hit the network, use the local cache only, skip the 24h TTL
cce template offline off     # turn offline off
```

> **Intranet / air-gapped machines**: two options. ① If you have an internal mirror,
> `cce template url <mirror>`. ② Otherwise download the default template file on a
> networked device, copy it to `~/.claude/cce/templates.remote.json`, then
> `cce template offline on` — now `cce add` never touches the network.

### Template file format

A template file is a JSON object whose **keys are the template names**. Each template:

```jsonc
{
  "deepseek": {
    // description can be a per-language object (shown in your current UI language),
    // or just a plain string.
    "description": { "en": "DeepSeek (Claude-compatible API)", "zh-CN": "DeepSeek（兼容 Claude 接口）" },

    // Fixed entries: copied straight into the new env's `env`, no input needed.
    "env": {
      "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
      "ANTHROPIC_MODEL":    "deepseek-chat"
    },

    // Required entries: prompted at creation time, then merged into the env above.
    "required": [
      {
        "name": "ANTHROPIC_AUTH_TOKEN",
        "description": { "en": "Your DeepSeek API Key", "zh-CN": "你的 DeepSeek API Key" },
        "default": ""    // optional; accepted on Enter when present
      }
    ]
  }
}
```

| Field | Description |
|---|---|
| `description` | Template description. **Either a string or a per-language object** (e.g. `{ "en": ..., "zh-CN": ... }`). Resolved to the current UI language: current lang → fall back to `en` → fall back to the first non-empty value; nothing shown if all empty. |
| `env` | The **pre-filled** environment variables (base URL, model, etc.); copied into the new env verbatim. Values must be strings. |
| `required` | An array of fields the **user must fill in**. Each entry's `name` is the env key to write; the user's input is the value. |
| `required[].name` | The env key this field fills (e.g. `ANTHROPIC_AUTH_TOKEN`). |
| `required[].description` | The prompt text for this field; also a per-language object or a string. |
| `required[].default` | Optional default value; accepted on Enter at fill time. |

> A template's multi-language `description` is **collapsed to a single string in
> the current UI language** when the env is created, and stored in that env's
> `description` field (env descriptions in config.json are single strings).

---

## Configuration file

### Location

| Platform | Path |
|---|---|
| Windows | `%USERPROFILE%\.claude\cce\config.json` |
| macOS / Linux | `~/.claude/cce/config.json` |

Override the directory with the `CCE_CONFIG_HOME` env var (useful for CI or team
conventions). The first run writes a starter config if none exists.

> The same directory also holds two cce-managed files you never need to edit:
> - `cache.json` — cache state (update-check records, template last-fetch time/etag, etc.).
> - `templates.remote.json` — the downloaded default templates (same shape as the
>   remote; you can drop it in by hand for offline use).

### Full schema

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | integer | yes | Config schema version (currently `1`). |
| `default` | string \| null | no | Env name used when `cce` is run with no `-e`. `null`/missing → bare `cce` opens the picker (TTY) or launches without injection (non-TTY). |
| `lang` | `"en"` \| `"zh-CN"` \| null | no | UI language. `null` = auto-detect from OS locale. Overridden by `CCE_LANG`; set with `cce lang`. |
| `args` | string | no | **Global** default claude CLI args (shell-tokenized). Prepended to every launch. |
| `settingsMode` | `"override"` \| `"merge-cce"` \| `"merge-claude"` | no | **Global** default reconciliation mode. Default `override`. |
| `updateMode` | `"auto"` \| `"prompt"` \| `"off"` | no | How self-update behaves at launch. Default `auto`. See [Updating cce](#updating-cce). |
| `template` | object | no | Template source settings. Prefer managing via `cce template url` / `cce template offline` over hand-editing. |
| `template.url` | string \| null | no | Remote URL for the default templates. `null` = use the built-in default sources (jsDelivr + GitHub raw fallback). Set to a single URL (e.g. an intranet mirror) to use only that, with no fallback. |
| `template.offline` | boolean | no | Default `false`. When `true`, `cce add` never hits the network: it uses the local cache `templates.remote.json` and skips the 24h TTL check. |
| `envs.<name>` | object | yes | A named env. The key is what you pass to `-e`. Must match `[A-Za-z0-9][A-Za-z0-9._-]*`. |
| `envs.<name>.description` | string | no | Shown in `cce list` and `cce show`. |
| `envs.<name>.env` | object | yes | Env vars injected for this provider. Same shape as claude's `settings.json` `env` block. Values may contain `${VAR}` placeholders, resolved from the parent shell at launch. |
| `envs.<name>.args` | string | no | Per-env claude args. Merged onto global `args` by default. |
| `envs.<name>.argsOverride` | boolean | no | Default `false`. If `true`, this env's `args` **replace** the global `args`. |
| `envs.<name>.settingsMode` | enum | no | Per-env reconciliation mode. Omit to inherit the global `settingsMode`. |

### Annotated example

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/zhouxiaofu/claude-code-env/main/schema.json",
  "version": 1,
  "default": "deepseek",

  // UI language: null = auto-detect. Set with `cce lang en|zh-CN|auto`.
  "lang": null,

  // Global default claude args — applied to every launch.
  // Skip them for one run with `-A "..."`.
  "args": "--permission-mode bypassPermissions",

  // Global default for how an env's `env` reconciles with ~/.claude/settings.json.
  "settingsMode": "override",

  "envs": {
    "deepseek": {
      "description": "DeepSeek (Anthropic-compatible endpoint)",
      // Per-env args merged on top of global → effective:
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
      // Per-env override of the reconciliation mode.
      "settingsMode": "merge-cce",
      "env": {
        "ANTHROPIC_BASE_URL":   "https://api.moonshot.cn/anthropic",
        // ${VAR} is resolved from your shell env at launch time — keep secrets
        // out of this file by exporting KIMI_KEY in your shell rc.
        "ANTHROPIC_AUTH_TOKEN": "${KIMI_KEY}",
        "ANTHROPIC_MODEL":      "kimi-k2-0905-preview"
      }
    },

    "official": {
      "description": "Official Claude subscription (use ~/.claude credentials)",
      // Empty env means: don't override ANTHROPIC_* — let claude use its own
      // Pro/Max subscription auth. With override mode, any stale anthropic keys
      // in settings.json are neutralized so they can't leak in.
      "env": {}
    }
  }
}
```

---

## Claude args management

`cce` centralizes the CLI args passed to claude so you don't retype them. There
are three layers, lowest to highest priority:

| Layer | Source | Notes |
|---|---|---|
| 1. Global | config root `args` | Applied to every launch. |
| 2. Per-env | `envs.<name>.args` + `argsOverride` | `argsOverride: true` *replaces* the global layer for that env. |
| 3. CLI | `-a "..."` / `-A "..."` | `-a` appends; `-A` replaces everything below it. |

Combining is **pure concatenation — cce never dedupes**:

```
final = (env.argsOverride ? "" : globalArgs) + " " + env.args + " " + all -a "..."
```

The result is shell-tokenized into argv and handed to claude, which resolves
repeats itself (most flags are last-wins; repeatable flags like `--add-dir`
stack). To force an exact arg set, use `-A`.

| Command | What spawns |
|---|---|
| `cce -e deepseek` | `claude --permission-mode bypassPermissions --add-dir D:\code` |
| `cce -e deepseek -a "--resume X"` | `claude --permission-mode bypassPermissions --add-dir D:\code --resume X` |
| `cce -e deepseek -A "--resume X"` | `claude --resume X` |
| `cce -e deepseek -A` | `claude` (no args) |
| `cce -e foo -a "X" -A "Y"` | **Error:** `-a and -A are mutually exclusive` |

**Tokenizer rule (Windows-friendly):** backslashes are always literal; only
quotes group tokens. So `--add-dir D:\code` just works. For paths with spaces,
quote them: `--add-dir 'D:\My Code'`.

---

## settings.json reconciliation

### The problem

`cce` injects provider env into the `claude` child process — but Claude Code
*also* reads the `env` block in your `~/.claude/settings.json`. If that file
still contains, say, an old `ANTHROPIC_BASE_URL`, it can quietly win and make
your env switch silently ineffective.

### How cce solves it

`cce` **never edits your real `settings.json`**. Instead it:

1. Reads the `env` block from `~/.claude/settings.json` (read-only).
2. Computes a reconciled `env` according to the selected mode.
3. Writes it to a unique temp file: `~/.claude/cce/tmp/settings-<pid>-<rand>.json`.
4. Launches `claude --settings <tempfile>`.
5. Deletes the temp file when claude exits.

`claude --settings <file>` loads *additional* settings at command-line
precedence — **higher** than user `settings.json` — and **merges** rather than
replaces. So for any key, the effective value is:

```
effective[key] = (key in tempEnv) ? tempEnv[key] : userEnv[key]
```

Because `--settings` can't *delete* a user-only key, `cce` neutralizes stale
keys by writing them as an **empty string**, which Claude Code treats as unset.

### The three modes

`tempEnv` is what gets written to the temp file (`entry.env` is the selected
cce env's `env`, already `${VAR}`-expanded; `userEnv` is your settings.json `env`):

| Mode | CLI value (`-m`) | `tempEnv` contents | Effect |
|---|---|---|---|
| **override** *(default)* | `override` | `entry.env` + stale `ANTHROPIC_*` keys present only in `userEnv` set to `""` | This env fully wins; leftover anthropic keys in settings.json are neutralized. Non-anthropic user keys are preserved. |
| **merge-cce** | `cce` | `entry.env` | Union with settings.json; **this env wins** on conflicts. |
| **merge-claude** | `claude` | `entry.env` minus keys already in `userEnv` | Union with settings.json; **settings.json wins** on conflicts. |

> **Why a single channel?** Anthropic env now travels *only* through the temp
> settings file, never through the child's process env (cce still strips stale
> anthropic vars from the inherited env — see below). The precedence of
> process-env vs settings-env is undocumented, whereas `--settings` precedence is
> well-defined. Routing everything through one channel makes the outcome
> predictable, and avoids a contradiction in `merge-claude` mode.

### Choosing a mode (layering)

Mode is resolved exactly like args — highest layer wins:

```
CLI -m/--merge-mode   >   envs.<name>.settingsMode   >   root settingsMode   >   "override"
```

```bash
# Per-run:
cce -e kimi -m cce

# Per-env (config.json):
"envs": { "kimi": { "settingsMode": "merge-cce", "env": { ... } } }

# Global default (config.json root):
"settingsMode": "merge-claude"
```

Run `cce show <name>` to see the resolved mode and where it came from.

### Temp file lifecycle & safety

- **Unique names** (`settings-<pid>-<rand>.json`) — concurrent windows never
  clash.
- **`chmod 600`** on POSIX (best-effort; ignored where unsupported).
- **Cleanup on every exit path** — normal exit, error, signal, and
  `process.on('exit')`.
- **Orphan sweep** — on launch, temp files older than 6 hours (left by a
  `SIGKILL`/power loss) are deleted. The age threshold guarantees a live session
  is never touched.
- The temp file holds expanded plaintext tokens, but its lifetime is the
  claude process lifetime and it never touches your real config — strictly safer
  than persisting secrets into `settings.json`.

---

## Env-leak protection

Before spawning claude, `cce` strips these vars from the inherited process env so
a stray `export ANTHROPIC_BASE_URL=...` in your shell can't silently override your
env:

```
ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_API_KEY,
ANTHROPIC_MODEL, ANTHROPIC_SMALL_FAST_MODEL,
ANTHROPIC_DEFAULT_HAIKU_MODEL, ANTHROPIC_DEFAULT_SONNET_MODEL,
ANTHROPIC_DEFAULT_OPUS_MODEL
```

To deliberately keep a shell value, reference it from the env entry:
`"ANTHROPIC_BASE_URL": "${ANTHROPIC_BASE_URL}"`.

---

## Language / i18n

`cce`'s output (help, warnings, errors, prompts) is available in **English** and
**Simplified Chinese (zh-CN)**. The startup summary line is data and is not
translated.

**Detection precedence:**

```
CCE_LANG env var   >   config `lang`   >   OS locale   >   English
```

**Per-run override** — set the `CCE_LANG` env var (mirrors the `LANG`/`LC_ALL`
convention):

```bash
CCE_LANG=zh-CN cce --help     # this run only
```

**Persistent preference** — the `cce lang` subcommand (mirrors `git config`):

```bash
cce lang            # show the current language and where it comes from
cce lang zh-CN      # persist Simplified Chinese to config
cce lang en         # persist English
cce lang auto       # clear the setting → back to auto-detect
```

> There is deliberately no `--lang` flag: `cce` keeps a minimal, closed set of
> non-launch flags (just `-h`/`-v`). A setting that only affects cce's own output
> belongs in an env var (per-run) and a subcommand (persistent), the same split
> most CLIs use.

---

## Interactive picker

`cce pick` opens a keyboard menu and then launches claude with the chosen env:

```
Pick an env to launch claude:

❯ * deepseek   DeepSeek (Anthropic-compatible endpoint)
    kimi       Moonshot Kimi K2
    official   Official Claude subscription

  ↑/↓ navigate · Enter select · Esc/Ctrl+C cancel
```

- `*` marks the current default; the cursor starts there.
- `↑/↓` or `k/j` move, number keys `1`–`9` jump, `Enter` selects, `Esc`/`Ctrl+C`/`q` cancels.
- Picking does **not** change your default — use `cce use <name>` for that.
- Bare `cce` also opens the picker when you have envs but no default set.
- `-a` / `-A` / `-m` work too: `cce pick -a "--verbose" -m cce`.
- Requires a TTY. In non-interactive contexts (CI, pipes) use `cce -e <name>`.

---

## Shell completion

`cce completion <shell>` prints a completion script to stdout. Install once:

| Shell | Install |
|---|---|
| **bash** | `cce completion bash >> ~/.bashrc` then `source ~/.bashrc` |
| **zsh** | `cce completion zsh >> ~/.zshrc` then `source ~/.zshrc` |
| **fish** | `cce completion fish > ~/.config/fish/completions/cce.fish` |
| **PowerShell** | `cce completion powershell >> $PROFILE` then `. $PROFILE` |

You get Tab completion for subcommands, flags, the `-m`/`lang` value lists, and —
most usefully — your own env names after `-e` / `--env` / `use` / `show`:

```bash
cce -e <Tab>       # → deepseek  kimi  official
cce -m <Tab>       # → override  cce  claude
cce lang <Tab>     # → en  zh-CN  auto
```

---

## Updating cce

cce can upgrade **itself** to the latest npm version, either **manually** or
**automatically at launch**.

### Manual update

```bash
cce update          # check for the latest version; install it if newer
cce update --check  # check and report only, never install
```

`cce update` always queries npm **live**, so its result is always current
(unaffected by the cache below). Under the hood it runs
`npm i -g @xiaofuzhou/cce@latest`.

> If you're running cce from a source checkout (`git clone`), `cce update` tells
> you to update with `git pull` instead of reinstalling over your working tree.

### Automatic check at launch

Every time cce launches claude, it also takes a quick look in the **background**
for a newer version — this **never slows down the launch** (it reads a local
cache; the network check happens in the background). What it does with the
result is controlled by `updateMode` in your config:

| `updateMode` | Behavior |
|---|---|
| `auto` (default) | When a newer version is found, update **silently in the background**; on the next launch it prints one line: "cce was updated to vX.Y.Z in the background". Never interrupts you. |
| `prompt` | **Don't auto-install.** On your next launch in a terminal, show a menu to choose **Update now** / **Skip this version**. After "Skip", that version is never offered again until a newer one ships. |
| `off` | **Never check** at launch (manual `cce update` still works). |

Set it by opening the config with `cce edit` and editing the root `updateMode`:

```jsonc
{
  "updateMode": "prompt",
  ...
}
```

**A few details:**

- The check result is **cached for ~3 hours**, so launches neither hit the
  network constantly nor nag you every time.
- The **Update now / Skip** menu only appears in a real interactive terminal
  (TTY). In non-TTY contexts (scripts, pipes, CI) it shows nothing and never
  blocks.
- After an install, you must **re-run cce** to use the new version (the
  currently running process is unaffected).

---

## Environment variables

| Variable | Purpose |
|---|---|
| `CCE_CONFIG_HOME` | Override the cce config directory (default `~/.claude/cce/`). |
| `CLAUDE_CONFIG_DIR` | Where cce reads claude's `settings.json` (default `~/.claude/`). Mirrors claude's own var. |
| `CCE_CLAUDE_BIN` | Full path to the `claude` executable (skip PATH lookup). |
| `CCE_LANG` | UI language for this run (`en` \| `zh-CN`); overrides config. Persist with `cce lang`. |
| `CCE_NO_UPDATE_CHECK=1` | Disable the launch-time update check for this run (see [Updating cce](#updating-cce)). |
| `CCE_QUIET=1` | Suppress the `[cce]` startup lines. |
| `CCE_DEBUG=1` | Print stack traces on internal errors. |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Could not find the claude executable` | Install Claude Code, ensure `claude` is on PATH, or set `CCE_CLAUDE_BIN=/full/path/to/claude`. |
| `Env "X" does not exist` | `cce list` to see what's defined; `cce edit` to add one. |
| `Unknown option: --foo` | All claude args go inside `-a "..."` (merge) or `-A "..."` (override). |
| `-a and -A are mutually exclusive` | Pick one: `-a` adds to defaults, `-A` replaces them. |
| `default env "X" does not exist in config` | `cce use <name>` to switch, or `cce edit` to fix. Bare `cce` falls back to the picker. |
| Switched env but still hitting the old endpoint | Likely a stale key in `~/.claude/settings.json`. `override` mode neutralizes it; check `cce show <name>` and verify `${VAR}` placeholders resolve. |
| `Could not read <settings.json> — treating it as empty` | Your `settings.json` is invalid JSON; reconciliation skipped it. Fix the JSON. |
| Config file got corrupted | A backup `config.json.bak.<timestamp>` is saved next to it before cce fails. |

---

## See also

- [README](../README.en.md) — quick start and overview
- [DESIGN.md](DESIGN.en.md) — design rationale and decision records
- [Claude Code docs](https://docs.claude.com/en/docs/claude-code)
