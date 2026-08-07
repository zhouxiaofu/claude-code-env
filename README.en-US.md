

# cce — Claude Code Multi-Provider Launcher

<div align="center">

**Chinese** | [English](./README.en.md)

</div>

[![npm version](https://img.shields.io/npm/v/@xiaofuzhou/cce.svg)](https://www.npmjs.com/package/@xiaofuzhou/cce)
[![license](https://img.shields.io/npm/l/@xiaofuzhou/cce.svg)](LICENSE)
[![node](https://img.shields.io/node/v/@xiaofuzhou/cce.svg)](https://nodejs.org)

**Run [Claude Code](https://docs.claude.com/en/docs/claude-code) on any third-party model with a single command** — DeepSeek, Kimi, Zhipu GLM, Anthropic official, or self-hosted proxies.

cce stores provider configurations (endpoint URLs, API Keys, models) as named startup profiles. At launch, it only injects them into the **newly spawned `claude` subprocess** — it never touches any global files, so multiple terminal windows can **simultaneously** use different providers.

```bash
cce                # Launch Claude Code with the default configuration
cce -e deepseek    # This window uses DeepSeek
cce -e kimi        # Another window uses Kimi simultaneously, without interference
cce pick           # Or open a menu to select one
```

---

## Get Started with Third-Party APIs in 30 Seconds

```bash
npm install -g @xiaofuzhou/cce   # Requires Node ≥ 18, claude must be in PATH

cce add            # Step 1: Select a provider
                   #     claude   Anthropic Official (uses local proxy)
                   #     deepseek DeepSeek
                   #   › glm      Zhipu GLM
                   #     kimi     Kimi
                   #     mimo     Xiaomi MiMo
                   # Step 2: Continue filling out the template (example for GLM)
                   #   Paste API Key
                   #   Select model: GLM-5.2 / GLM-5.1
                   # Finally, confirm the suggested env name (e.g., glm-5.2), and choose whether to set it as default
cce                # Launch Claude Code using the default env
```

Each provider corresponds to a single template entry. After selection, the template will dynamically ask for details like model (Kimi / GLM), plan (MiMo Pay-As-You-Go / Token Plan), local proxy port (Anthropic official), and API Key. Endpoint URLs, model mappings, etc., are automatically generated, and env names are suggested based on your choices. You can also skip the provider menu with `cce add deepseek`; templates are fetched from GitHub and cached locally, and can be managed with `cce template`.

Prefer not to use a template? Directly edit the configuration file with `cce edit` (`~/.claude/cce/config.json`):

```jsonc
{
  "version": 1,
  "default": "deepseek",
  // Base environment variables shared across all configurations
  "env": {
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  },
  // Want to skip Claude Code permission prompts every time? Add this line (applies globally to all envs):
  "args": "--permission-mode bypassPermissions",
  "envs": {
    "deepseek": {
      // You can also add args specific to a single env (overrides/appends to global, see below)
      "env": {
        "ANTHROPIC_BASE_URL":   "https://api.deepseek.com/anthropic",
        "ANTHROPIC_AUTH_TOKEN": "sk-xxxxxxxxxxxx",
        "ANTHROPIC_MODEL":      "deepseek-v4-pro"
      }
    }
  }
}
```

### Shared Env Vars & Default Arguments

The root-level `env` serves as the base environment variable layer shared across all configurations. Keys with the same name in specific envs will override it; `null` converts to an empty string after merging, functioning identically to explicitly setting `""` to clear a value. Whether it overrides the corresponding value in `settings.json` depends on `settingsMode`: under `override` / `cce`, CCE takes precedence; under `claude`, `settings.json` takes precedence. The final merged result only applies to the `claude` subprocess for that specific launch.

The `args` field stores default arguments passed to `claude`: placing it at the root level applies to all envs, while placing it within a specific env applies only to that env. You can append additional arguments at launch, or discard these defaults to use only the current session's arguments. For exact syntax, see the `cce` launch options below.

---

## Differences from cc-switch

In short: [cc-switch](https://github.com/farion1231/cc-switch) switches providers by **modifying global configuration** (`~/.claude/settings.json`), leaving only one global copy. In contrast, cce injects environment variables into the **subprocess launched each time**, leaving the global configuration completely untouched.

| | **cce** | cc-switch |
|---|---|---|
| **Form** | CLI, installed via `npm i -g` | GUI application |
| **Switching Method** | Injects env vars into subprocess at launch | Modifies `~/.claude/settings.json` |
| **Multiple windows with different providers** | ✅ Independent per process | ❌ Shared globally |
| **Modifies global config** | Never | Changes on every switch |
| **Scriptable / CI-friendly** | ✅ | ❌ |

They are not mutually exclusive and can coexist: cc-switch manages the global default, while cce provides temporary per-window overrides. If using [claude-code-router](https://github.com/musistudio/claude-code-router), configure it as an env for cce (`ANTHROPIC_BASE_URL=http://127.0.0.1:3456`) to route requests on demand.

---

## Common Commands

### `cce`: Launch Claude Code

```text
cce [launch options] [-- Claude args...]
```

Running `cce` alone will launch Claude Code using the default env. If no default env is set, an interactive selection menu will appear in the terminal.

| Launch Option | Purpose |
|---|---|
| `-e, --env <name>` | Use a specific env instead of the default |
| `-o, --only` | Discard default `args` from config, use only arguments provided in this command |
| `-c, --continue` | Continue the most recent session |
| `-r, --resume [id]` | Resume a session; specify an ID or omit to let Claude interactively choose |
| `-n, --name <name>` | Set a display name for this session |
| `-m, --merge-mode <mode>` | Temporarily set env merge mode: `override`, `cce`, or `claude` |
| `-- <Claude args...>` | Pass arguments after `--` directly to Claude, appending them after config defaults |

For example:

```bash
cce -e kimi -c                              # Continue the most recent session using the kimi env
cce -e kimi -- --permission-mode default    # Append Claude arguments after the config defaults
cce -e kimi -o -- --resume XYZ              # Discard config defaults, only resume a specific session
```

The `-c`, `-r`, and `-n` flags can be combined with `-o` and `--`. Only place cce-specific launch options before `--`; all other Claude arguments should be grouped after `--`.

### Management Commands

| Command | Purpose |
|---|---|
| `cce pick` | Open menu to select an env and launch |
| `cce add` / `cce remove` | Create / delete envs from templates |
| `cce list` / `cce show <name>` | List envs / view final config for a specific env |
| `cce use <name>` / `cce current` | Set / check default env |
| `cce edit` | Directly edit the config file |
| `cce template` | View, refresh, or configure template sources |
| `cce update` | Upgrade cce to the latest npm version |

Additional features: Default argument management (global or per-env), three merge modes with `~/.claude/settings.json` (cce never modifies this file), bilingual (EN/ZH) interface, Tab completion for four shells (including env names), and automatic background updates on launch. See the docs for more:

- **[Usage Guide](docs/usage.md)** — Complete config schema, merge semantics, and troubleshooting
- **[Design Doc](docs/DESIGN.md)** — Architecture and decision records

---

## Links

- **npm**: https://www.npmjs.com/package/@xiaofuzhou/cce
- **GitHub**: https://github.com/zhouxiaofu/claude-code-env
- **Issues**: https://github.com/zhouxiaofu/claude-code-env/issues

## License

[MIT](LICENSE)
