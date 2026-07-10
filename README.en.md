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

cce add            # Step 1: choose a provider
                   #     claude   Claude official (through a local proxy)
                   #     deepseek DeepSeek
                   #   › glm      Zhipu GLM
                   #     kimi     Kimi
                   #     mimo     Xiaomi MiMo
                   # Step 2: answer provider-specific prompts (GLM shown here)
                   #   paste the API key
                   #   choose a model: GLM-5.2 / GLM-5.1
                   # Finally, confirm the suggested env name (such as glm-5.2)
                   # and choose whether to make it the default
cce                # launch Claude Code with the default env
```

Each provider has one template entry. After you choose it, the template asks only for the relevant details: model (Kimi / GLM), plan (MiMo pay-as-you-go / Token Plan), local proxy port (official Claude), and API key. The base URL and model mappings are generated automatically, and the answers are used to suggest an env name. `cce add deepseek` skips the provider menu; templates are fetched from GitHub, cached locally, and managed with `cce template`.

Prefer doing it by hand? `cce edit` opens the config file (`~/.claude/cce/config.json`):

```jsonc
{
  "version": 1,
  "default": "deepseek",
  // Shared environment-variable base for every env
  "env": {
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  },
  // Want to skip Claude Code's permission prompts every time? Add this line
  // (global — applies to every env):
  "args": "--permission-mode bypassPermissions",
  "envs": {
    "deepseek": {
      // Or set args on a single env to override/extend the global one
      "env": {
        "ANTHROPIC_BASE_URL":   "https://api.deepseek.com/anthropic",
        "ANTHROPIC_AUTH_TOKEN": "sk-xxxxxxxxxxxx",
        "ANTHROPIC_MODEL":      "deepseek-v4-pro"
      }
    }
  }
}
```

### Shared env and default arguments

The root-level `env` is a shared base for every configured env. A matching key in a specific env overrides it; set that key to `""` or `null` to remove the shared value for just that env. After the two layers are merged, the result still applies only to the `claude` child process launched by this command.

`args` stores default flags passed to `claude`: root-level flags apply to every env, while flags inside a specific env apply only there. At launch, you can append more arguments or drop these defaults and use only the arguments from that invocation; see the `cce` launch options below.

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

### `cce`: launch Claude Code

```text
cce [launch options] [-- Claude arguments...]
```

Bare `cce` launches Claude Code with the default env. If no default is configured, it opens the env picker in an interactive terminal.

| Launch option | Effect |
|---|---|
| `-e, --env <name>` | use a specific env instead of the default |
| `-o, --only` | drop default `args` from the config and use only arguments from this invocation |
| `-c, --continue` | continue the latest conversation |
| `-r, --resume [id]` | resume by session ID, or omit the ID to let Claude prompt for one |
| `-n, --name <name>` | set a display name for this session |
| `-m, --merge-mode <mode>` | temporarily select the env merge mode: `override`, `cce`, or `claude` |
| `-- <Claude arguments...>` | pass everything after `--` to Claude verbatim, appended after config defaults |

For example:

```bash
cce -e kimi -c                              # continue the latest conversation with the kimi env
cce -e kimi -- --permission-mode default    # append a Claude argument after config defaults
cce -e kimi -o -- --resume XYZ              # drop config defaults and resume one session only
```

`-c`, `-r`, and `-n` can be combined with `-o` and `--`. Before `--`, use only cce launch options; put all other Claude arguments after it.

### Management commands

| Command | What it does |
|---|---|
| `cce pick` | choose an env from a menu, then launch |
| `cce add` / `cce remove` | create an env from a template / delete an env |
| `cce list` / `cce show <name>` | list envs / inspect the effective config for one env |
| `cce use <name>` / `cce current` | set / show the default env |
| `cce edit` | edit the config file directly |
| `cce template` | inspect, refresh, or configure template sources |
| `cce update` | upgrade cce to the latest npm version |

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
