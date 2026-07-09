# Claude Code Env Launcher (`cce`) — Design Document

<div align="center">

[简体中文](./DESIGN.md) | **English**

</div>

> One command to inject provider env + launch Claude Code. Cross-platform,
> npm-installable, zero side effects.
>
> Target usage: `cce -e deepseek -a "--permission-mode bypassPermissions"`
> (claude args go inside `-a` strings; common values stored in config so bare
> `cce -e deepseek` auto-injects them too.)

---

## 1. Goals & Non-goals

### 1.1 Goals

- One command to inject a model provider's env vars and launch `claude`.
- Never modify `~/.claude/settings.json`. Never pollute any shell global.
- Every window/process gets independent env (env is only injected into the
  `claude` child process; the parent shell is untouched).
- Explicit management of claude CLI args (global defaults + per-env defaults +
  CLI `-a`/`-A`). Common flags are configured once and applied forever.
- Install globally with `npm i -g` to get the `cce` command.
- Cross-platform: Windows (PowerShell / CMD), macOS, Linux.
- Config file must be human-readable, easy to back up, and shareable between
  machines (once secrets are stripped).

### 1.2 Non-goals (deferred past v0.1)

- GUI configuration (`cc-switch` already covers this).
- Multi-model auto-routing (`claude-code-router` does this well; `cce` can
  coexist with it — just configure CCR as one of the envs).
- Config file encryption / OS Keychain integration (candidate for v0.2).
- Per-repo config overrides (candidate for v0.2).

---

## 2. Comparison with other approaches

| Approach | Switching granularity | One command? | Cross-platform? | npm-installable? |
|---|---|---|---|---|
| Copy `~/.claude/settings.json` by hand | global | ❌ | ✅ | — |
| `cc-switch` (GUI) | global | ❌ | ✅ | — |
| `claude-code-router` | global (proxy) | ❌ (must start router first) | ✅ | ✅ |
| **`cce`** | **per-process** | **✅** | **✅** | **✅** |

The core difference: `cce` modifies no global state. Env only lives for the
duration of the `claude` child process.

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────┐
│  User terminal                                            │
│                                                          │
│  $ cce -e deepseek -a "--permission-mode bypassPerms"    │
│         │                                                │
│         ▼                                                │
│  ┌──────────────┐  1. Read ~/.claude/cce/config.json     │
│  │  cce (Node)  │  2. Merge process.env + entry.env       │
│  │              │  3. Merge args (global + env + -a/-A)   │
│  │              │  4. spawn('claude', mergedClaudeArgs)    │
│  └──────┬───────┘     stdio: 'inherit'                   │
│         │                                                │
│         ▼                                                │
│  ┌─────────────────────────────────────────────┐         │
│  │  claude (child process)                      │         │
│  │  ANTHROPIC_BASE_URL = ...                    │         │
│  │  ANTHROPIC_AUTH_TOKEN = ...                  │         │
│  │  ANTHROPIC_MODEL = ...                       │         │
│  └─────────────────────────────────────────────┘         │
│                                                          │
│  cce exit code = claude exit code                         │
└──────────────────────────────────────────────────────────┘
```

Key points:
- `cce` is **only a launcher** — it doesn't stay resident or proxy traffic.
- The injected env is **only visible to the `claude` child process**. The parent
  shell is unchanged.
- When claude exits, cce forwards the exit code and exits. From the outside, it
  looks like "just running claude directly."

---

## 4. CLI Design

### 4.1 Launch mode (default behavior)

```bash
cce                                              # launch with default env (args from config)
cce -e deepseek                                  # switch to deepseek env
cce --env kimi                                   # same, long form
cce -e deepseek -a "--permission-mode bypassPermissions"   # merge claude args onto defaults
cce -e deepseek -a "-c"                          # claude's own -c (continue) via -a
cce -e deepseek -a "--resume X" -a "-c"          # multiple -a are concatenated
cce -e deepseek -A "--resume X"                  # override all config defaults
cce -e deepseek -A                               # launch bare claude with no args
```

> **Update (2026-07, supersedes the `-a`/`-A` model below):** `-a`/`-A` are
> removed in favor of an orthogonal model — args after `--` are forwarded to
> claude (merged with config defaults), `-o` / `--only` drops the config
> defaults, and `-c`/`-r`/`-n` are first-class aliases for claude's
> `--continue`/`--resume`/`--name`. Typing the old `-a`/`-A` hard-errors and
> prints the rewrite. Rationale: `--` is a universal convention and avoids
> quote re-splitting; splitting "which args" (`--`) from "keep defaults or not"
> (`-o`) into two orthogonal switches is more self-documenting than the
> case-paired `-a`/`-A`. See [usage.md → Claude arg management](usage.en.md#claude-arg-management).
> The original design is kept below as history.

**Arg rules** (redesigned for v0.1):

1. `cce` **no longer implicitly forwards** unknown args. Every claude CLI flag
   must be wrapped in `-a "..."` / `-A "..."`.
2. cce only recognizes these flags:
   - `-e` / `--env <name>` — select env
   - `-a "<str>"` — claude args, **merged** on top of config defaults (repeatable)
   - `-A "<str>"` — claude args, **fully override** all config defaults (mutually exclusive, single use)
   - `-h` / `--help` — cce help
   - `-v` / `--version` — cce version
3. Unknown flags → **error** with a migration hint ("Did you mean `-a \"...\"`?")
4. No `--` separator needed (there is no passthrough channel).
5. If the first positional arg is a known subcommand name, enter subcommand mode.

**Design rationale:** The old "implicit forwarding" caused a fundamental problem
— cce and claude share a flag namespace, so a future claude flag could collide
with an existing cce flag. By making it explicit, cce's flag space is **fully
closed** and can never collide with claude. The cost is that claude args must be
wrapped in strings, but with config `args` defaults, common flags are only typed
once.

### 4.2 Subcommands

| Command | What it does |
|---|---|
| `cce list` / `cce ls` | List all envs (with `*` marking the default) |
| `cce add [tpl] [name]` | Create an env from a template (interactively pick + fill fields); `--list` lists templates, `--templates <path>` mounts an external template file — see §15 |
| `cce show <name>` | Show an env's details (API keys auto-masked, e.g. `sk-***abcd`) |
| `cce edit` | Open config.json in `$EDITOR` (Windows default: notepad) — **the only add/edit/remove env path in v0.1** |
| `cce use <name>` | Set the default env (used by bare `cce`) |
| `cce use --none` | Clear the default; bare `cce` then launches without injection |
| `cce current` | Print the current default env name |
| `cce pick [-a "..."] [-A "..."]` | **Interactive menu** to pick an env, then spawn claude (`-a`/`-A` work like launch mode) |
| `cce --help` / `cce -h` | Show help |
| `cce --version` / `cce -v` | Show version |

> **v0.1 intentionally ships without `cce add` / `cce remove`**: All add/edit/remove
> goes through `cce edit` — open the JSON directly. Interactive add (provider
> template wizard) and remove (with confirmation) are deferred to v0.2. Rationale:
> ship what works; skip the interactive prompt code to keep dependencies minimal
> and bug surface small. Developers are fine editing JSON (the schema is simple
> and editors provide completion/validation via the `$schema` field).
>
> **Later update**: `cce add` was added in a later version, but scoped narrowly to
> "**quickly scaffold an env from a template**" (not a general add/remove wizard);
> see §15 for the design. `cce remove` is still not provided — deleting an env is
> just removing a block in `cce edit`.

### 4.3 Parser strategy

Closed flag space + no passthrough → extremely simple parser (handwritten, ~60 lines):

```
argv = process.argv.slice(2)
1. If argv[0] is a known subcommand → dispatch
2. Otherwise, launch mode, scan sequentially:
   - -e / --env <name>     → envName = next token
   - -e=<name> / --env=<name> → envName = right side of =
   - -a "<str>"            → mergeArgs.push(str)         (repeatable)
   - -A "<str>"            → if overrideArg !== null → error
                              if mergeArgs.length > 0 → error
                              overrideArg = str
   - -A (no value)         → same but str = ""
   - -h / --help / -v / --version → handle immediately
   - other                 → error: Unknown option, suggest -a "..." wrapping
3. Both mergeArgs and overrideArg → error
```

> No `commander`/`yargs`: those libs default to treating unknown flags as the
> tool's own, which is the opposite of our "unknown = error" semantics. You'd
> have to work around their defaults. Handwritten is direct and controllable.

---

## 5. Configuration file

### 5.1 Location

| Platform | Path |
|---|---|
| Windows | `%USERPROFILE%\.claude\cce\config.json` |
| macOS / Linux | `~/.claude/cce/config.json` |

**Design choice:** Placed under `~/.claude/` alongside Claude Code's own config
for easy co-backup; isolated in the `cce/` subdirectory to avoid future name
collisions with official files, and to leave room for completion scripts,
backups, and schema cache sidecar files.

The `CCE_CONFIG_HOME` env var overrides the directory (useful for team
conventions or CI isolation).

### 5.2 Schema (JSON)

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/<you>/claude-code-env/main/schema.json",
  "version": 1,
  "default": "deepseek",
  "args": "--permission-mode bypassPermissions",         // global default claude args
  "envs": {
    "deepseek": {
      "description": "DeepSeek (Anthropic-compatible endpoint)",
      "args": "--add-dir D:\\code\\deepseek-projects",   // per-env default (merged onto global)
      "env": {
        "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
        "ANTHROPIC_AUTH_TOKEN": "sk-xxxxxxxxxxxx",
        "ANTHROPIC_MODEL": "deepseek-chat",
        "ANTHROPIC_SMALL_FAST_MODEL": "deepseek-chat"
      }
    },
    "kimi": {
      "description": "Moonshot Kimi K2",
      "env": {
        "ANTHROPIC_BASE_URL": "https://api.moonshot.cn/anthropic",
        "ANTHROPIC_AUTH_TOKEN": "sk-xxxxxxxxxxxx",
        "ANTHROPIC_MODEL": "kimi-k2-0905-preview"
      }
    },
    "ccr": {
      "description": "Local claude-code-router",
      "env": {
        "ANTHROPIC_BASE_URL": "http://127.0.0.1:3456",
        "ANTHROPIC_AUTH_TOKEN": "any"
      }
    },
    "raw": {
      "description": "Clean launch, no global args",
      "args": "--verbose",
      "argsOverride": true,                              // ← global args dropped for this env
      "env": {}
    },
    "official": {
      "description": "Official Claude (clear overrides, use ~/.claude config)",
      "env": {}
    }
  }
}
```

**Field descriptions:**

- `version` — config schema version, for future migration.
- `default` — env name used by bare `cce`. Empty string or `null` means "no
  injection."
- `args` (root, optional) — global default claude CLI args as a shell-tokenized
  string. Prepended to every launch. Can be overridden by `argsOverride: true`
  or CLI `-A`.
- `envs.<name>.description` — optional, shown in list output.
- `envs.<name>.env` — env vars to inject. **Field names match claude
  `settings.json`'s `env` block exactly**, so you can copy-paste blocks directly.
  **Values may contain `${ENV_VAR}` placeholders**, resolved from `process.env`
  at launch (keeps secrets in your shell rc rather than this file).
- `envs.<name>.args` (optional) — per-env claude defaults. By default **merged**
  on top of the global `args`.
- `envs.<name>.argsOverride` (optional, default `false`) — if `true`, this env's
  `args` **replaces** the global `args` entirely.

### 5.3 Env injection algorithm

```js
function buildChildEnv(entry) {
  const env = { ...process.env };

  // 1. Strip all potentially stale ANTHROPIC_* and CLAUDE_* vars
  //    to prevent a stray shell export from interfering.
  const KNOWN_VARS = [
    'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY',
    'ANTHROPIC_MODEL', 'ANTHROPIC_SMALL_FAST_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
  ];
  for (const k of KNOWN_VARS) delete env[k];

  // 2. Inject entry.env (resolving ${VAR} placeholders)
  for (const [k, v] of Object.entries(entry.env || {})) {
    env[k] = expandEnvVars(v, process.env);
  }
  return env;
}
```

> **Design choice:** Defaulting to "strip then inject" prevents a shell
> `ANTHROPIC_BASE_URL` from silently overriding the env entry. If you
> deliberately want to keep a shell value, reference it in the env entry:
> `"ANTHROPIC_BASE_URL": "${ANTHROPIC_BASE_URL}"`.

### 5.4 Default args merge algorithm

cce centralizes claude CLI args management. Three layers, lowest to highest
priority:

| Layer | Source | Can override below? |
|---|---|---|
| 1. Global | config root `args` | (n/a) |
| 2. Per-env | `envs.<name>.args` + `argsOverride` | `argsOverride: true` replaces global entirely |
| 3. CLI | `-a "..."` / `-A "..."` | `-A` replaces global + per-env; `-a` only appends |

#### Merge rule (pure concat, no dedupe)

```js
function buildClaudeArgs(globalArgs, envEntry, mergeArgsList, overrideArg) {
  // CLI -A is the ultimate override: use it directly, skip all below
  if (overrideArg !== null) {
    return shellTokenize(overrideArg);
  }

  // Compute env layer (considering argsOverride)
  let envLayer;
  if (envEntry?.argsOverride) {
    envLayer = envEntry.args || '';                // replaces global
  } else {
    envLayer = [globalArgs || '', envEntry?.args || ''].filter(Boolean).join(' ');
  }

  // CLI -a appended after env layer
  const merged = [envLayer, ...mergeArgsList].filter(Boolean).join(' ');
  return shellTokenize(merged);
}
```

**Why no dedupe?** cce doesn't have claude's full flag schema (which are
boolean, which are repeatable, which are last-wins). Guessing would cause bugs.
Claude itself implements last-wins for most flags (`--permission-mode X
--permission-mode Y` → Y wins) and stacking for repeatable flags (`--add-dir`).
Pure concat + let claude handle it = always correct.

Cost: the command line gets longer, and claude may emit "flag X specified twice"
warnings on stderr. Acceptable. For a hard override → `-A`.

#### `-a` / `-A` CLI semantics

| Invocation | Behavior |
|---|---|
| `cce -e foo` | Use config defaults (global + env, per argsOverride) |
| `cce -e foo -a "X"` | Append `X` on top |
| `cce -e foo -a "X" -a "Y"` | Append `X Y` (multiple `-a` concatenated in order) |
| `cce -e foo -A "X"` | Use only `X`, ignore all config defaults |
| `cce -e foo -A` | No args at all, bare `claude` |
| `cce -e foo -a "X" -A "Y"` | **Error:** `-a and -A are mutually exclusive` |
| `cce -e foo -A "X" -A "Y"` | **Error:** `-A can only be specified once` |

#### Launch visibility

Every launch prints two lines on stderr (`CCE_QUIET=1` suppresses them):

```
[cce] env=deepseek  model=deepseek-chat  base_url=https://api.deepseek.com/anthropic
[cce] $ claude --permission-mode bypassPermissions --add-dir D:\code\deepseek-projects
```

The second line is the **final** spawn command (args merged and shell-tokenized
back to readable form), so the user can verify exactly what was passed to claude.

#### `cce show <name>` layer annotation

`cce show` output includes a section labeling the source of each arg:

```
Env: deepseek
DeepSeek V4 Pro

Environment variables:
  ANTHROPIC_AUTH_TOKEN  sk-e***1
  ...

Claude args (merged):
  --permission-mode bypassPermissions       (from global)
  --add-dir D:\code\deepseek-projects       (from env)
```

Source labels appear only in `cce show`, not in launch lines (to keep them concise).

#### Tokenizer rules (handwritten, zero dependency)

String → token implemented in **~30 lines**, **no external dependency**. Rules:

- Whitespace-delimited (outside quotes).
- Single/double quotes are paired; everything inside quotes is literal.
- **Backslash is always literal, never escapes** — this is the critical
  difference from POSIX shell.

Why not `shell-quote`: it eats `\X` as POSIX escapes, so a Windows path like
`D:\My Code\proj` is tokenized as `D:My` + `Codeproj`. Swapping to a
Windows-friendly library like `string-argv` would also solve it, but when the
rule set is simple enough for 30 lines, no dependency is preferable.

User guidance: "use quotes around values with spaces" (single or double). Unix
users are comfortable with quotes; Windows users rarely have spaces in paths,
and when they do, quoting is the obvious fix.

---

## 6. Cross-platform concerns

### 6.1 Finding the `claude` executable

`claude` lives in different places per install method:

| Install method | Windows | Unix |
|---|---|---|
| Native Installer | `%USERPROFILE%\.local\bin\claude.exe` | `~/.local/bin/claude` |
| `npm i -g @anthropic-ai/claude-code` | `%APPDATA%\npm\claude.cmd` | `<prefix>/bin/claude` |
| Custom PATH | anywhere | anywhere |

**Strategy:**
1. Try PATH lookup via Node `child_process.spawnSync` (`where`/`which` equivalent).
2. Fall back to the known paths above.
3. If still not found → clear error with an install link.
4. Allow `CCE_CLAUDE_BIN` to specify the full path explicitly.

### 6.2 Spawning `claude`

On Windows, `claude` is typically a `.cmd` shim. `child_process.spawn` needs
`{ shell: true }` to resolve it, but `shell: true` introduces quote-escaping
pitfalls.

**Recommended approach:** Use `cross-spawn` (community standard, handles
`.cmd`/`.bat` shims, shebangs, arg escaping):

```js
const cp = require('cross-spawn');
const child = cp.spawn(claudeBin, claudeArgs, {
  stdio: 'inherit',
  env: childEnv,
});
child.on('exit', (code) => process.exit(code ?? 0));
```

`stdio: 'inherit'` ensures TTY is passed straight through; claude's interactive
UI works exactly as it would when run directly.

### 6.3 Signal forwarding

`Ctrl+C` behavior differs between Windows and Unix. `stdio: 'inherit'` delegates
signal forwarding to the OS — no extra handling is needed in most cases. If
claude fails to receive SIGINT on Windows (a known occasional issue), add
explicit `process.on('SIGINT', () => child.kill('SIGINT'))`.

### 6.4 PSReadLine flicker on PowerShell

`stdio: 'inherit'` does not trigger this issue (it's not PTY emulation, just fd
inheritance). Verified in practice.

---

## 7. NPM package structure

```
claude-code-env/
├── package.json
├── README.md
├── LICENSE                       # MIT
├── bin/
│   └── cce.js                    # shebang entry — the thinnest possible layer, require ../src/cli
├── src/
│   ├── cli.js                    # arg parsing + dispatch
│   ├── config.js                 # config.json read/write
│   ├── launcher.js               # find claude + spawn
│   ├── commands/
│   │   ├── list.js
│   │   ├── add.js
│   │   ├── remove.js
│   │   ├── edit.js
│   │   ├── use.js
│   │   ├── show.js
│   │   ├── env.js
│   │   └── current.js
│   └── util/
│       ├── mask.js               # API key masking
│       ├── expand.js             # ${VAR} expansion
│       └── log.js                # colored logging
├── test/
│   └── *.test.js                 # node:test
└── schema.json                   # JSON Schema for config.json
```

### 7.1 `package.json`

```json
{
  "name": "claude-code-env",
  "version": "0.1.0",
  "description": "Per-process env launcher for Claude Code. One command to inject provider env (DeepSeek/Kimi/GLM/CCR/...) and start claude.",
  "bin": {
    "cce": "./bin/cce.js"
  },
  "files": ["bin", "src", "schema.json", "README.md", "LICENSE"],
  "engines": { "node": ">=18" },
  "type": "commonjs",
  "scripts": {
    "test": "node --test test/",
    "lint": "eslint .",
    "release": "npm test && npm publish"
  },
  "dependencies": {
    "cross-spawn": "^7.0.6",
    "picocolors": "^1.1.1"
  },
  "keywords": ["claude", "claude-code", "anthropic", "env", "launcher", "deepseek", "kimi", "glm"],
  "license": "MIT",
  "repository": "github:<you>/claude-code-env"
}
```

Design choices:
- **CommonJS not ESM**: CLI tool + shebang; CJS has the best compatibility and
  marginally faster startup.
- **Minimal dependencies**: `cross-spawn` + `picocolors` (dependency-free, a few KB).
  CLI parsing is handwritten.
- **Zero build step**: ship source directly; no TypeScript or bundler. If the
  codebase grows, switch to TS + `tsup` for a single-file output later.
- **`engines.node >= 18`**: stable LTS baseline, avoiding old-Node compat burden.

### 7.2 `bin/cce.js`

```js
#!/usr/bin/env node
require('../src/cli').run(process.argv.slice(2));
```

The `#!/usr/bin/env node` shebang makes it directly executable on Unix; npm
auto-generates a `.cmd` wrapper on Windows.

---

## 8. Security

### 8.1 API Key storage

v0.1 follows the same approach as `~/.claude/settings.json`: **plaintext JSON**.
This is the ecosystem default; align with it first. **Additional measures:**

1. **Set file permissions on first write:**
   - Unix: `chmod 600`
   - Windows: use `icacls` or `Set-Acl` to restrict to the current user (optional, documented, not enforced).
2. **Mask all API keys in terminal output** (list / show / env): `sk-abcd…wxyz` → `sk-abcd…***`.
3. **`${VAR}` placeholders**: let users keep keys in shell/system env; config.json only stores references — much safer.
4. **`.gitignore` guidance**: README emphasizes that config.json must **never** be committed.

### 8.2 Optional enhancements (v0.2+)

- OS Keychain integration (macOS Keychain / Windows Credential Manager / libsecret).
- Encrypted config file (derived from a machine-local key).
- Dry-run mode: `cce -e deepseek --print-env` to print without launching, for debugging.

---

## 9. Error handling & UX

| Scenario | Behavior |
|---|---|
| Can't find `claude` binary | Red error: `claude executable not found. Install: https://...` with `CCE_CLAUDE_BIN` hint |
| config.json not found | Auto-create an empty config with a friendly prompt "run `cce add` to add your first env" |
| `-e xxx` but env doesn't exist | List available env names |
| config.json corrupted (JSON parse error) | Show line number + backup `config.json.bak` hint |
| `cce` with `default` unset | Launch in "no injection" mode with a yellow `[cce] no env injected` line |
| Claude non-zero exit code | Silently forward the exit code; add no cce output (don't spam the user) |

On launch, one concise prefix line is printed by default (`CCE_QUIET=1` to disable):

```
[cce] env=deepseek  model=deepseek-chat  base_url=https://api.deepseek.com/anthropic
```

---

## 10. Implementation roadmap (Milestones)

### M1 — MVP (local-machine usable, ~half day)
- [x] Design document (this file)
- [ ] Repo init, `package.json`, `bin/cce.js` shebang
- [ ] config.json read/write (with init and field validation)
- [ ] CLI parser (handwritten)
- [ ] Launch mode: `cce` / `cce -e <name>` / `-a "..."` / `-A "..."`
- [ ] Subcommands: `list` / `current` / `use`
- [ ] cross-spawn integration, stdio passthrough, exit code forwarding
- [ ] Windows 11 verification (PowerShell + cmd)

### M2 — Full management
- [ ] `edit` / `show` / `env` (manage envs through `cce edit` JSON editing)
- [ ] `${VAR}` placeholder resolution
- [ ] API key masking output
- [ ] Tab completion scripts (PowerShell + bash + zsh)
- [ ] Error message polish

### M2.5 — Interactive management (v0.2 candidate)
- [ ] `cce add` (provider template wizard: DeepSeek/Kimi/GLM/CCR/Custom)
- [ ] `cce remove <name>` (with confirmation)
- [ ] `cce import` from cc-switch

### M3 — Release
- [ ] README (bilingual, with GIF demo)
- [ ] Unit test coverage for config + parser + masking
- [ ] GitHub Actions: lint + test on macOS/Win/Linux × Node 18/20/22
- [ ] `npm publish`
- [ ] GitHub release + HN / V2EX announcement

### M4 — Enhancements (community-feedback-driven)
- [ ] Per-repo `.cce.json` overrides
- [ ] Keychain integration
- [ ] `cce doctor` self-check (PATH, claude version, config validity)

---

## 11. Decision records

Decisions made through discussion:

1. ✅ **Command name**: `cce`
2. ✅ **Config location**: `~/.claude/cce/config.json` (under `~/.claude/` in a
   `cce/` subdirectory to avoid colliding with official files, with room for
   completion scripts, backups, and other sidecar files)
3. ✅ **Tech stack**: plain JS + CommonJS, zero build
4. ✅ **Shell completion**: v0.1 ships PowerShell + bash + zsh completion scripts
   with Tab completion for user-configured env names
5. 🟡 **Default env behavior** (implicit, following the recommended approach):
   bare `cce` with no `default` set → launch without injection, print a yellow
   warning
6. 🟡 **GitHub repo name** (implicit): suggested `claude-code-env`, npm package
   same name, bin as `cce`

### 11.1 Interactive picker (added in v0.1)

Decisions:

| Decision | Choice | Rationale |
|---|---|---|
| Trigger | New `cce pick` subcommand + bare `cce` (when no default set) auto-opens the menu | Doesn't break existing users who have a `default`; friendly to new users who don't |
| Implementation | Pure Node `readline` + raw mode, **no dependency** | Aligned with the project's minimal-dependency philosophy; only need list-select UI, not worth pulling in a full prompt framework |
| Interaction | ↑/↓ k/j to move, Enter to select, Esc/Ctrl+C/q to cancel, numbers 1–9 to jump | Works for keyboard power users and beginners alike |
| Post-pick behavior | Directly spawn claude; does **not** modify the `default` field | Separation of concerns: the menu is only for "this launch"; use `cce use` to change the default |
| Non-TTY | Error with hint to use `cce -e <name>`; doesn't hang | CI / pipe compatibility |
| Single env | Skip the menu, use it directly and print a note | A 1-option menu is noise |
| Zero envs | Error guiding user to `cce add` | Nothing to pick |

Implementation notes (`src/util/picker.js` + `src/commands/pick.js`):
- Rendering goes to stderr, keeping stdout clean for future scripting.
- Hide cursor before entering raw mode; cleanup (restore cursor) on exit,
  including exception paths — otherwise the user's terminal is left in a broken
  state.
- `pick.js`'s `pickFromConfig(cfg)` is reused by both the `cce pick` subcommand
  and `runLaunch`'s "no default fallback," avoiding logic duplication.

### 11.2 Default args injection (added in v0.1)

Decisions through multiple rounds of discussion:

| Decision | Choice | Rationale |
|---|---|---|
| Approach | **No implicit forwarding** of claude args; all claude flags must be in `-a "..."` / `-A "..."` | Old approach shared flag space with claude; a future claude flag could always collide. Explicit wrapping makes cce's flag space closed, zero conflict forever |
| Flag naming | `-a` (merge) / `-A` (override), corresponding to config fields `args` / `argsOverride` | "a = args" is instantly readable; case-paired opposites are a mainstream CLI convention (curl `-d/-D`, etc.) |
| Priority layers | Global `args` → per-env `args` → CLI `-a/-A`, 3 layers | "Global commonality + per-env difference + CLI one-off" covers every scenario |
| Merge semantics | **Pure concat, no dedupe**; let claude handle repeats via last-wins / stacking | cce lacks claude's full flag schema; guessing dedupe rules is error-prone. Pure concat is always correct; cost is longer commands |
| `argsOverride` per-env field | bool, default `false`; when `true`, the env's `args` replace global entirely | Satisfies "some envs don't want global args." Flat bool rather than nested enum; can add more modes later if needed |
| `-A` mutual exclusion | Multiple `-A`, or `-a` + `-A` together → error; bare `-A` = empty args | "Force override" semantics must be singular; repetition or mixing is contradictory |
| Config field type | String (shell-tokenizable), not array | Copy-pasting shell commands is easiest; arrays mainly benefit dedupe, which we don't do |
| Tokenizer | **Handwritten ~30 lines, zero dependency** | Test proved `shell-quote` eats `\X` on Windows paths (`D:\My Code\proj` → `D:My` + `Codeproj`, disastrous). Handwritten rules are simple and controllable: whitespace-delimited, quote-paired, **backslash always literal** |
| Launch visibility | Second line `[cce] $ claude ...` showing the full spawn command | User can instantly verify what cce actually passed to claude; invaluable for debugging |
| `cce show` | Output includes a "Claude args (merged)" section with source labels (`from global` / `from env`) | All debug-critical info in one place |

See §5.4 algorithm and §4.1 CLI usage for details.

### 11.3 v0.1 ships without `cce add` / `cce remove`

| Decision | Choice | Rationale |
|---|---|---|
| `cce add` | **Deferred to v0.2** | Interactive wizard (provider templates, key input, overwrite confirmation) is non-trivial code, and the v0.1 audience (developers) is fine writing JSON by hand. Ship the working version first, gather feedback, then decide what the wizard should look like |
| `cce remove` / `cce rm` | **Deferred to v0.2** | Same — deleting an env = removing a JSON block; `cce edit` already handles it |
| Alternative | Unified single path: `cce edit` opens `$EDITOR` (Windows default: notepad) | One command covers all add/edit/remove; schema.json provides editor completion/validation; no need to learn interactive prompt shortcuts |
| Impact | Remove `src/commands/add.js` + `remove.js` + `util/prompt.js`; remove all references from parser/cli/help/completion | ~250 lines cut + one readline prompt dependency path eliminated; smaller bug surface |

### 11.4 `cce env` subcommand removed (v0.1)

| Decision | Choice | Rationale |
|---|---|---|
| Keep `cce env`? | **No** | The word "env" is already overloaded in cce (subcommand / `-e` flag / config `envs` / config `env` field — four meanings). Removing the subcommand reduces ambiguity |
| Replacement | `cce show <name>` | `show` already displays an env's variables (masked), and the new version also shows the merged claude args; fully covers the original "view" use case |
| Lost capability | `cce env --raw` for script-friendly KEY=VALUE output | Assessed as non-core in v0.1; can add `cce show --raw` or `cce show --format=env` if requested |
| Impact | Remove `src/commands/env.js`; remove all references from parser/cli/help/completion | One file + one switch case + a few completion entries; under 50 lines |

### 11.5 Completion script design addendum

Completion key point: when the second token follows `-e` / `--env`, read the
`envs` key list from `~/.claude/cce/config.json` and offer completion.

**Install method** (v0.1):
- `cce completion powershell` → print PowerShell completion script to stdout; user appends to `$PROFILE`
- `cce completion bash` → print bash completion script; user sources into `~/.bashrc`
- `cce completion zsh` → print zsh completion script

Do not auto-write to the user's profile (to avoid surprising them). README
provides one-line install hints. v0.2 could consider `cce completion install
<shell>` for automatic installation.

---

## 12. Appendix: Relationship to other tools

cce is only a launcher — it doesn't compete with ecosystem tools, it composes
with them:

- **claude-code-router (CCR)**: configure CCR as one of your cce envs
  (`ANTHROPIC_BASE_URL=http://127.0.0.1:3456`). Run `cce -e ccr` when you want
  multi-model routing, connect directly to other providers when you don't.
- **Local proxy**: same idea — configure your proxy as an env.
- **cc-switch (GUI)**: edits `~/.claude/settings.json` as the global default.
  cce overrides at the child-process level via `--settings` temp file (see §13.1).
  The two can coexist.

The core difference remains: cce modifies no global state. Env only lives for
the duration of the `claude` child process.

---

## 13. v0.2 iteration: settings.json env reconciliation + i18n

### 13.1 settings.json env reconciliation (solving "reverse override")

**Problem:** cce injects provider env into the `claude` child process, but
Claude Code *also* reads the `env` block from `~/.claude/settings.json`, and its
precedence may be higher than process env — so cce's injection is silently
reversed and the switch is ineffective.

**Solution:** cce **never edits** the real `~/.claude/settings.json`. Instead it
reads its `env`, recomputes a reconciled `env` according to the selected mode,
writes it to `~/.claude/cce/tmp/settings-<pid>-<rand>.json`, and launches with
`claude --settings <tempfile>`. The temp file is deleted when claude exits.

- `claude --help` confirms: `--settings <file-or-json>` loads **additional**
  settings at "command-line argument" precedence — **higher** than user
  `~/.claude/settings.json` (the lowest layer). So the temp file's `env` wins
  over user keys with the same name.
- `--settings` **merges** rather than replaces; for each key the higher layer
  wins and lower-layer-only keys merge up. So
  `effective[k] = (k in tempEnv) ? tempEnv[k] : userEnv[k]`.
- The "can't delete user-only keys" limitation is worked around by writing
  stale keys as **empty strings** (tested: claude treats empty-string env values
  as unset).

**Three modes** (`tempEnv` = what gets written to the temp file):

| Mode | CLI value | `tempEnv` contents | Effect |
|---|---|---|---|
| `override` *(default)* | `override` | `entry.env` + stale `ANTHROPIC_*` keys present only in userEnv set to `""` | This env fully wins; leftover anthropic keys are neutralized. User's non-anthropic keys are preserved. |
| `merge-cce` | `cce` | `entry.env` | Union with user; **this env wins** on conflicts. |
| `merge-claude` | `claude` | `entry.env` minus keys already in userEnv | Union with user; **settings.json wins** on conflicts. |

**Why single-channel:** `buildChildEnv` no longer injects anthropic vars into
the process env — it only **strips** `KNOWN_ANTHROPIC_VARS` (to prevent shell
residue), and provider env travels exclusively through the temp settings file.
Reason: the priority of process-env vs settings-env is undocumented, whereas
`--settings` priority is well-defined. Dual-channel would also self-contradict
in `merge-claude` mode. Single-channel = single, predictable priority.

**Layering** (same structure as args): root `settingsMode` → per-env
`settingsMode` → CLI `-m/--merge-mode`. Higher wins, default `override`.

**Safety:** temp filenames include `pid`+random (no clash with concurrent
windows); `chmod 600`; cleanup on normal exit / error / signal /
`process.on('exit')`; orphan sweep on launch (deletes temp files older than 6
hours from crash residue). Temp files contain expanded plaintext tokens but
their lifetime is the claude process lifetime and they never touch real config
— strictly safer than persisting secrets into `settings.json`.

> Consistent with §1.1 "no modification of settings.json, zero global side
> effects": the temp file only lives for the child process lifecycle; the real
> settings.json is never touched.

### 13.2 i18n (multi-language)

- **Detection precedence:** `CCE_LANG` env var > config `lang` > OS locale
  (`Intl` / `LANG`) > fallback `en`.
- **No `--lang` flag:** cce deliberately maintains a minimal, closed flag space
  (§4.1). Beyond the universal `-h`/`-v`, no "non-launch" flags are added.
  Language — something that only affects cce's own output — follows the
  mainstream split:
  - Per-run override → `CCE_LANG` env var (the locale convention, mirroring
    `LANG`/`LC_ALL`).
  - Persistent preference → `cce lang` subcommand (mirroring `git config` /
    `gh config set`): `cce lang` to see the current source, `cce lang
    en|zh-CN` to write config, `cce lang auto` to reset.
- **Implementation:** `src/i18n/{index,en,zh-CN}.js`, zero dependencies.
  `t(key, params)` looks up current language → fallback to en → fallback to
  the raw key name. `{name}` interpolation. English is the source of truth;
  a test enforces identical key sets across both catalogs.
- **Scope:** help (full bilingual sections), warnings / errors / picker / all
  command prompts. The startup summary line (`env=… model=… settings=…`) is
  data and is not translated.
- `lang` must be resolved before loading the full config (which may emit
  localized errors), hence `config.peekLang()` does a lightweight, non-throwing
  read.

### 13.3 New / changed fields

```jsonc
{
  "lang": null,                 // "en" | "zh-CN" | null (auto)
  "settingsMode": "override",   // global default: override | merge-cce | merge-claude
  "envs": {
    "deepseek": {
      "settingsMode": "merge-cce",   // per-env override (optional; inherits global if omitted)
      "env": { /* ... */ }
    }
  }
}
```

New CLI: `-m/--merge-mode <override|cce|claude>` (launch modifier),
`cce lang [en|zh-CN|auto]` (subcommand). The new env read point respects
`CLAUDE_CONFIG_DIR` (consistent with claude).

---

## 15. Create an env from a template (`cce add`)

The `cce add` deferred in §11.3 was reintroduced, but does **exactly one thing**:
take a template, keep its fixed parts pre-filled, prompt the user for a few fields
(usually a token), and write a finished env into `config.json`. The core lives in
`src/templates.js` (load/merge) + `src/commands/add.js` (orchestration) +
`src/util/prompt.js` (text input).

### 15.1 Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Command name | `cce add` (optional `[template] [name]`) | User's call; reads plainly and matches `use`/`edit`/`pick` |
| Scope | **Template scaffolding only**, not a general add/remove wizard | Narrowed to the real pain point — newcomers wiring up DeepSeek/Kimi/GLM. Arbitrary edits stay in `cce edit`; no `cce remove` |
| **No placeholders** | A template's `env` holds fixed values; a separate `required` array lists fields to fill, where each `name` is the env key and the user's input is the value, merged into `env` after filling | Avoids clashing with the runtime `${VAR}` semantics (resolved from the shell at launch, §13.1) — an earlier `{{TOKEN}}` idea would collide with it, so no placeholders at all |
| Required-field shape | `{ name, description, default? }`; empty input takes the default if present, else re-prompts | `required` = mandatory; `default` lets fields like a model name be accepted with Enter |
| Name validation | Reuses the schema rule `^[A-Za-z0-9][A-Za-z0-9._-]*$` (`config.isValidEnvName`) | Matches the `envs` `patternProperties`, so names from `cce add` always pass the schema |
| Collision handling | A two-option picker: overwrite existing / rename; re-checks after rename, looping | No silent overwrite; a non-TTY collision errors out |
| Interactivity gate | Picking / filling / the two-option choice all need a TTY (`stdin && stdout`) | With full args and a no-field template, a pure non-interactive create works; otherwise it reports needing a TTY rather than hanging |

### 15.2 Template sources & resolution chain

A later source **replaces an earlier same-named entry wholesale** (no deep merge —
predictable):

```
Built-in src/templates.builtin.json
  └─ ~/.claude/cce/templates.json        (user file, optional)
       └─ cce add --templates <path>      (this run only)
```

- Built-ins ship with the package (`files` already includes `src/`, no extra
  config); currently DeepSeek, Kimi, GLM.
- A `--templates` path that's missing / invalid JSON → error (`TemplateError`); an
  absent user file is silently skipped.
- After several rounds, **only `--templates` is kept** as the external entry point
  (env var, config field, and a templates directory were all dropped) to keep the
  surface minimal.

### 15.3 Multi-language description (i18n integration)

Both a template's `description` and each `required[].description` may be a
per-language object like `{ "en": …, "zh-CN": … }` (a plain string still works).
A new `i18n.localize(value)` resolves it: current lang → fall back to `en` → fall
back to the first non-empty value; `null` / empty object / no non-empty value →
`''` (rendered as nothing). When the env is created, the template's multi-language
description is **collapsed to a single current-language string** and stored in that
env's single-string `description`.

### 15.4 What was added / changed

- New `src/templates.builtin.json`, `src/templates.js` (incl. the pure
  `buildEnvFromTemplate(tpl, answers)` for testability), `src/commands/add.js`,
  `src/util/prompt.js`.
- `src/i18n/index.js` exports `localize`; `src/config.js` adds `ENV_NAME_RE` /
  `isValidEnvName`.
- `parser.js` / `cli.js` register `add`; `help.js`, `completion.js` (template-name
  completion + `--list`/`--templates`, plus an internal `completion --templates`
  emitter), and `en.js`/`zh-CN.js` (new `add.*` keys) follow.
- Tests in `test/templates.test.js`: `localize` fallbacks, template normalization,
  `buildEnvFromTemplate`, source-override merge, missing-file / bad-JSON errors,
  name validation.

> **Superseded later**: §15.2's "bundled with the package" + the `--templates` entry
> were replaced by the remote-templates design in v0.6; `cce remove` shipped in v0.5
> (with confirmation). Current design is §16.

---

## 16. Remote templates + `cce template` (v0.6)

### 16.1 Motivation

Bundling the default templates in the npm package freezes them per release — changing
a model name needs a publish, and users only get it after upgrading. Fetching the
defaults live from the GitHub repo (with a local cache) means users always get the
latest, and editing templates no longer requires a release.

### 16.2 Key trade-offs

| Decision | Choice | Why |
|---|---|---|
| Keep a bundle | **No** (user's call) | Running `npm i -g` implies network; on offline/failure we print the URL for a manual download — more controllable than a frozen bundle |
| Default source | jsDelivr primary + GitHub raw fallback | jsDelivr is reachable in mainland China; raw is often blocked, fallback only |
| Source file location | repo-root `templates/builtin.json` (out of `src/`, not packaged) | decoupled from code; `files` only has `src/`, so it's never shipped |
| TTL | 24h, from `cache.json` `fetchedAt` | not file mtime (rewritten by backup/sync/copy — unreliable) |
| Cache files | payload in `templates.remote.json` (mirrors remote), metadata in `cache.json` | mirror shape → a failed download can be saved verbatim to that path, no import command |
| Unified cache | drop `update-check.json`, all machine state in `cache.json` (`update` / `template` sections) | one cache file; the old file is left orphaned (few users, low impact) |
| One-time source | `cce add --from <path\|url>` (replaces `--templates`), `^https?://` ⇒ URL else path | one entry for local/remote; no cache write, no config change |
| Intranet/offline | `config.template.url` (single mirror, no fallback) + `config.template.offline` (never network, skip TTL) | two paths: set url if you have a mirror; else drop the cache file + offline |

### 16.3 Load chain

```
base layer: the --from source  OR  the remote/cache templates.remote.json
  └─ overlaid by ~/.claude/cce/templates.json (user file)
empty result → contextual error (offline-no-cache / fetch-failed / --from-empty) printing the URL + save path
```

Remote layer: `offline` → read cache only, no network, ignore TTL; else fresh cache
(`now-fetchedAt<24h`) is used, stale/absent triggers a fetch (`config.template.url` if
set, else jsDelivr→raw). Success writes the cache + an `etag` into `cache.json` (next
run sends `If-None-Match`; a 304 just refreshes `fetchedAt`); all-fail falls back to a
stale cache (warns) or errors.

### 16.4 The `cce template` subcommand (alias `tpl`)

Bare `cce template` prints a status overview (url / offline / cache count + age, **no
network**); `ls`/`list` lists templates (replaces `cce add --list`); `show <name>`
shows a single template's env + required fields; `refresh` forces a fetch (ignoring TTL
+ offline); `url [<url>|--none]` and `offline [on|off]` read/write `config.template`.
**Template-name completion (`completion --templates`) is cache-only (`allowFetch:false`)
— never network, never throws.**

### 16.5 What was added / changed

- New `src/cache.js` (unified `cache.json`), `src/commands/template.js`; moved `src/templates.builtin.json` → `templates/builtin.json`.
- Rewrote `src/templates.js`: remote fetch + cache + `--from` + offline + contextual errors; `loadTemplates` is now **async**.
- `src/update.js` `readState`/`writeState` became thin wrappers over `cache.js` `readUpdate`/`writeUpdate`.
- `src/config.js` + `schema.json` gained `template { url, offline }`; `src/commands/add.js` renamed `--templates`→`--from` and dropped `--list`/`runList`.
- `parser.js`/`cli.js` register `template`/`tpl` (dispatch made async); `completion.js` adds the `template` subcommand + `--from` for all four shells; `help.js` and i18n (`template.*` keys; removed `add.list*`/`add.noTemplates*`/`add.templatesNeedsPath`) follow.
- Tests: rewrote `test/templates.test.js` (offline cache + user overlay, `--from`, stubbed fetch writing the cache); added `test/cache.test.js`.
