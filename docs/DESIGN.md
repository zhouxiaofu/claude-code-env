# Claude Code Env Launcher (`cce`) —— 设计文档

<div align="center">

**简体中文** | [English](./DESIGN.en.md)

</div>

> 一行命令注入 env + 启动 Claude Code，跨平台、npm 可装、零侵入。
>
> 目标用法：`cce -e deepseek -a "--permission-mode bypassPermissions"`（claude 参数包在 `-a` 字符串里；常用值放进 config 后裸 `cce -e deepseek` 也会自动注入）

---

## 1. 目标与非目标

### 1.1 目标

- 一条命令完成「注入指定模型 provider 的环境变量 + 启动 `claude`」。
- 不修改 `~/.claude/settings.json`，不污染任何 shell 全局变量。
- 支持每个窗口/进程独立的 env（因为 env 只注入到 `claude` 子进程，父 shell 完全不变）。
- 显式管理传给 claude 的 CLI 参数（全局默认 + per-env 默认 + 命令行 `-a`/`-A`），常用 flag 配一次永久生效。
- 通过 `npm i -g` 安装即可全局获得 `cce` 命令。
- 跨平台：Windows（PowerShell / CMD）、macOS、Linux。
- 配置文件人类可读、易备份、易在多机间同步（剔除密钥后）。

### 1.2 非目标（v0.1 暂不做）

- GUI 配置界面（`cc-switch` 已经有了）。
- 多模型自动路由（`claude-code-router` 已经做得很好，本工具可以与之共存：把 CCR 当作其中一个 provider 即可）。
- 配置文件加密 / OS Keychain 集成（v0.2 再考虑）。
- 项目级（per-repo）配置覆盖（v0.2）。

---

## 2. 与其他方案的差异

| 方案 | 切换粒度 | 一行命令 | 跨平台 | npm 装 |
|---|---|---|---|---|
| `~/.claude/settings.json` 多副本手动 copy | 全局 | ❌ | ✅ | — |
| `cc-switch` (GUI) | 全局 | ❌ | ✅ | — |
| `claude-code-router` | 全局代理 | ❌（要先起 router） | ✅ | ✅ |
| **本工具 `cce`** | **每进程** | **✅** | **✅** | **✅** |

核心区别：`cce` 不修改任何全局状态，env 只活在 `claude` 子进程的生命周期里。

---

## 3. 整体架构

```
┌──────────────────────────────────────────────────────────┐
│  用户终端                                                  │
│                                                          │
│  $ cce -e deepseek -a "--permission-mode bypassPerms"    │
│         │                                                │
│         ▼                                                │
│  ┌──────────────┐  1. 读 ~/.claude/cce/config.json       │
│  │  cce (Node)  │  2. 合并 process.env + entry.env       │
│  │              │  3. 合并 args（global + env + -a/-A）    │
│  │              │  4. spawn('claude', mergedClaudeArgs)    │
│  └──────┬───────┘     stdio: 'inherit'                   │
│         │                                                │
│         ▼                                                │
│  ┌─────────────────────────────────────────────┐         │
│  │  claude (子进程)                              │         │
│  │  ANTHROPIC_BASE_URL = ...                    │         │
│  │  ANTHROPIC_AUTH_TOKEN = ...                  │         │
│  │  ANTHROPIC_MODEL = ...                       │         │
│  └─────────────────────────────────────────────┘         │
│                                                          │
│  cce 退出码 = claude 退出码                                 │
└──────────────────────────────────────────────────────────┘
```

要点：
- `cce` 本身**只是一个启动器**，不长驻、不代理网络流量。
- 注入的 env **只对 `claude` 子进程可见**，父 shell 不变。
- claude 退出后，cce 透传退出码退出，整套流程对外像「就是直接跑 claude」。

---

## 4. CLI 设计

### 4.1 启动模式（默认行为）

```bash
cce                                              # 用默认 env 启动 claude（args 来自 config）
cce -e deepseek                                  # 切到 deepseek env
cce --env kimi                                   # 同上，长形式
cce -e deepseek -a "--permission-mode bypassPermissions"   # claude args 合并到 config 默认
cce -e deepseek -a "-c"                          # claude 的 -c（continue）写进 -a 里
cce -e deepseek -a "--resume X" -a "-c"          # 多个 -a 全部拼接
cce -e deepseek -A "--resume X"                  # 覆盖 config 所有默认 args
cce -e deepseek -A                               # 完全无 args，裸 claude
```

**参数规则**（v0.1 重新设计）：
1. `cce` **不再隐式透传**任何未知参数。所有 claude 的 CLI flag 都必须包在 `-a "..."` / `-A "..."` 字符串里。
2. cce 自己只识别这几个 flag：
   - `-e` / `--env <name>`：选 env
   - `-a "<str>"`：claude args，**合并**到 config 默认之上（可重复）
   - `-A "<str>"`：claude args，**强力覆盖**所有 config 默认（互斥，单次）
   - `-h` / `--help`：cce 帮助
   - `-v` / `--version`：cce 版本
3. 遇到任何未知 flag → **报错**，并给出迁移提示（"Did you mean `-a \"...\"`?"）
4. 不再需要 `--` 分隔符（因为根本没有透传通道）。
5. 如果第一个位置参数是已知子命令名，则进入子命令模式而非启动模式。

**设计理由**：旧版的"未知 flag 自动透传"导致一个根本性问题——cce 和 claude 的 flag 空间共享，未来 claude 加新 flag 可能跟 cce 已有 flag 冲突。改成显式后，cce 的 flag 空间**完全封闭**，永远不会与 claude 撞车。代价是 claude 参数要包字符串，但配合 config 的 `args` 默认值，常用参数只写一次。

### 4.2 子命令

| 命令 | 作用 |
|---|---|
| `cce list` / `cce ls` | 列出所有 env（带 ✓ 标记当前默认） |
| `cce add [模板] [名称]` | 从模板创建 env（交互式选模板 + 填字段）；`--list` 列模板，`--templates <路径>` 挂外部模板文件 —— 见 §15 |
| `cce show <name>` | 显示某 env 的详情（API key 自动脱敏，例如 `sk-***abcd`） |
| `cce edit` | 用 `$EDITOR`（Windows 默认 notepad）打开 config.json —— **v0.1 唯一的"增/改/删 env"路径** |
| `cce use <name>` | 把某 env 设为默认（裸 `cce` 时使用） |
| `cce use --none` | 清除默认，裸 `cce` 时不注入任何 env |
| `cce current` | 打印当前默认 env 名 |
| `cce pick [-a "..."] [-A "..."]` | **交互式菜单**选 env，选完直接 spawn claude（`-a`/`-A` 同启动模式） |
| `cce completion <shell>` | 输出 shell 补全脚本（bash/zsh/fish/powershell） |
| `cce lang [en\|zh-CN\|auto]` | 查看/设置界面语言（持久写入 config） |
| `cce update [--check]` | 把 cce 自己升级到 npm 最新版（`--check` 只查不装）—— 见 §11.5 |
| `cce --help` / `cce -h` | 帮助 |
| `cce --version` / `cce -v` | 版本号 |

> **v0.1 不内置 `cce add` / `cce remove`**：增/改/删 env 统一走 `cce edit` 直接改 JSON。交互式 add（厂商模板向导）和 remove（带确认）推迟到 v0.2。理由：能用就先发，把交互式 prompt 那块代码省了，依赖最小、bug 面最小；用户编辑 JSON 也并不痛苦（schema 简单、有 `$schema` 字段给编辑器做补全和校验）。
>
> **后续更新**：`cce add` 已在后续版本加入，但定位收窄为「**照模板快速生成一套 env**」（而非通用的增删 env 向导），设计见 §15。`cce remove` 仍不做 —— 删 env 就是在 `cce edit` 里删一段。

### 4.3 解析策略

封闭 flag 空间 + 无透传，parser 极简（手写约 60 行）：

```
argv = process.argv.slice(2)
1. 如果 argv[0] 是已知子命令名 → 进入子命令分支
2. 否则进入启动模式，顺序扫描：
   - -e / --env <name>     → envName = next token
   - -e=<name> / --env=<name> → envName = 等号右侧
   - -a "<str>"            → mergeArgs.push(str)         （可重复）
   - -A "<str>"            → if overrideArg !== null → error
                              if mergeArgs.length > 0 → error
                              overrideArg = str
   - -A（无值）             → 同上但 str = ""
   - -h / --help / -v / --version → 立即处理
   - 其他 → 报错：Unknown option，建议用 -a "..." 包装
3. mergeArgs 和 overrideArg 同时出现 → 报错
```

> 不用 `commander`/`yargs`：未知 flag 默认会被它们当成 cce 自己的 flag 处理，跟我们的"未知就报错"语义相反，反而要绕一圈关掉它们的默认行为。手写直接、可控。

---

## 5. 配置文件

### 5.1 位置

| 平台 | 路径 |
|---|---|
| Windows | `%USERPROFILE%\.claude\cce\config.json` |
| macOS / Linux | `~/.claude/cce/config.json` |

**设计取舍**：放在 `~/.claude/` 下与 Claude Code 官方配置同处一个家目录，便于一起备份；用 `cce/` 子目录隔离，避免与官方文件未来重名，也方便日后放补全脚本、备份、schema 缓存等 sidecar 文件。

环境变量 `CCE_CONFIG_HOME` 可覆盖默认目录（便于团队约定/CI 隔离）。

### 5.2 Schema（JSON）

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/<you>/claude-code-env/main/schema.json",
  "version": 1,
  "default": "deepseek",
  "args": "--permission-mode bypassPermissions",         // 全局默认 claude args
  "envs": {
    "deepseek": {
      "description": "DeepSeek Chat（官方 Anthropic 兼容端点）",
      "args": "--add-dir D:\\code\\deepseek-projects",   // env 专属默认（合并到全局）
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
      "description": "本地 claude-code-router",
      "env": {
        "ANTHROPIC_BASE_URL": "http://127.0.0.1:3456",
        "ANTHROPIC_AUTH_TOKEN": "any"
      }
    },
    "raw": {
      "description": "纯净启动，不要任何全局 args",
      "args": "--verbose",
      "argsOverride": true,                              // ← 全局 args 不生效
      "env": {}
    },
    "official": {
      "description": "官方 Claude（清空覆盖，使用 ~/.claude 配置）",
      "env": {}
    }
  }
}
```

**字段说明**：

- `version`：配置文件 schema 版本，便于将来迁移。
- `default`：裸 `cce` 命令使用的 env 名；可以为空字符串或 `null` 表示「不注入任何 env」。
- `args`（根级，可选）：全局默认 claude 命令行参数，字符串形式（shell-tokenize）。每次启动 claude 时默认前置注入；可被 per-env 的 `argsOverride: true` 或 CLI 的 `-A` 覆盖。
- `envs.<name>.description`：可选，列表时展示。
- `envs.<name>.env`：要注入的环境变量键值对（**字段名与 claude `~/.claude/settings.json` 的 `env` 块一致**，可直接复制粘贴）。**值可以包含 `${ENV_VAR}` 占位符**，运行时从 `process.env` 替换（方便把 key 放到 `.bashrc`/系统环境里）。
- `envs.<name>.args`（可选）：该 env 的 claude 默认参数。默认行为是**合并**到全局 `args` 之上。
- `envs.<name>.argsOverride`（可选，默认 `false`）：若为 `true`，该 env 的 `args` **完全替换**全局 `args`（不再合并）。

### 5.3 env 注入算法

```js
function buildChildEnv(entry) {
  const env = { ...process.env };

  // 1. 先清掉所有可能残留的 ANTHROPIC_* 和 CLAUDE_*（防止上一次 export 污染）
  //    但保留用户在 shell 里显式设置的——通过对比 parent shell 的初始 env？
  //    实际取舍：直接清掉以下白名单变量，简单可预期
  const KNOWN_VARS = [
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_MODEL',
    'ANTHROPIC_SMALL_FAST_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
  ];
  for (const k of KNOWN_VARS) delete env[k];

  // 2. 再把 entry.env 注入（并解析 ${VAR} 占位符）
  for (const [k, v] of Object.entries(entry.env || {})) {
    env[k] = expandEnvVars(v, process.env);
  }
  return env;
}
```

> **设计取舍**：默认「先清后注」可以避免 shell 中的 `ANTHROPIC_BASE_URL` 干扰 env 的预期行为。若用户想强制保留 shell 的某个变量，可以在 env 里写 `"ANTHROPIC_BASE_URL": "${ANTHROPIC_BASE_URL}"` 显式回填。

### 5.4 默认参数 (args) 合并算法

cce 把"传给 claude 的 CLI 参数"集中管理，避免每次手打。三层优先级（从低到高）：

| 层 | 来源 | 是否可覆盖下层 |
|---|---|---|
| 1. 全局 | config 根 `args` | （无下层） |
| 2. per-env | `envs.<name>.args` + `argsOverride` | `argsOverride: true` 时**完全替换**全局 |
| 3. CLI | `-a "..."` / `-A "..."` | `-A` 完全替换全局 + per-env，`-a` 仅追加 |

#### 合并规则（pure concat，不 dedupe）

```js
function buildClaudeArgs(globalArgs, envEntry, mergeArgsList, overrideArg) {
  // CLI -A 是终极覆盖：直接用，跳过所有下层
  if (overrideArg !== null) {
    return shellTokenize(overrideArg);
  }

  // 计算 env 层（考虑 argsOverride）
  let envLayer;
  if (envEntry?.argsOverride) {
    envLayer = envEntry.args || '';                // 覆盖全局
  } else {
    envLayer = [globalArgs || '', envEntry?.args || ''].filter(Boolean).join(' ');
  }

  // CLI -a 拼到 env 层之后
  const merged = [envLayer, ...mergeArgsList].filter(Boolean).join(' ');
  return shellTokenize(merged);
}
```

**为什么不 dedupe？**

cce 没有 claude 完整 flag schema（哪些是 boolean、哪些可重复、哪些 last-wins），主动 dedupe 容易猜错。claude 自己对大部分 flag 实现 last-wins（`--permission-mode bypassPermissions --permission-mode default` 最终用 `default`），对可叠加 flag（`--add-dir`）支持多次出现。所以纯拼接 + 让 claude 处理，最稳。

代价：命令行会变长，claude 可能在 stderr 打 warning（"flag X specified twice"）。能接受。真要硬覆盖 → `-A`。

#### `-a` / `-A` 的 CLI 语义

| 调用形式 | 行为 |
|---|---|
| `cce -e foo` | 用 config 默认（全局 + env，按 argsOverride 决定） |
| `cce -e foo -a "X"` | 上面之上追加 `X` |
| `cce -e foo -a "X" -a "Y"` | 上面之上追加 `X Y`（多个 `-a` 顺序拼） |
| `cce -e foo -A "X"` | 只用 `X`，无视一切 config 默认 |
| `cce -e foo -A` | 完全无 args，裸 `claude` |
| `cce -e foo -a "X" -A "Y"` | **报错**：`-a 和 -A 互斥` |
| `cce -e foo -A "X" -A "Y"` | **报错**：`-A 只能出现一次` |

#### 启动可见性

每次启动 cce 在 stderr 打两行（`CCE_QUIET=1` 可关）：

```
[cce] env=deepseek  model=deepseek-chat  base_url=https://api.deepseek.com/anthropic
[cce] $ claude --permission-mode bypassPermissions --add-dir D:\code\deepseek-projects
```

第二行是**最终** spawn 命令（已合并 args，已 shell-tokenize 后回拼成可读形式），让用户一眼能确认到底传了什么给 claude。

#### `cce show <name>` 加分层信息

`cce show` 输出新增一节，标注每条 args 的来源：

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

来源标注只在 `cce show` 里出现，启动行不打（保持简洁）。

#### Tokenize 规则（自写，零依赖）

字符串 → token **手写 ~30 行** 实现，**不引外部依赖**。规则：

- 空白分隔（引号外）
- 单引号/双引号成对，引号内全部按字面值
- **反斜杠永远是字面值，从不转义** —— 这是关键差别于 POSIX shell

为什么不用 `shell-quote`：它按 POSIX shell 语义把 `\X` 当转义吃掉，结果 Windows 路径 `D:\My Code\proj` 被切成 `D:My` + `Codeproj`。换 `string-argv` 等 Windows 友好库也能解，但既然规则简单（30 行能写完）就不引依赖。

用户口径：「想包空格的值就用引号」（单/双都行）。Unix 用户用引号没负担，Windows 用户 99% 的路径不带空格也无需引号。

---

## 6. 跨平台关键点

### 6.1 找到 `claude` 可执行文件

不同安装方式下 `claude` 的位置不同：

| 安装方式 | Windows | Unix |
|---|---|---|
| Native Installer | `%USERPROFILE%\.local\bin\claude.exe` | `~/.local/bin/claude` |
| `npm i -g @anthropic-ai/claude-code` | `%APPDATA%\npm\claude.cmd` | `<prefix>/bin/claude` |
| 自定义 PATH | 任意 | 任意 |

**策略**：
1. 优先用 `which`/`where` 同等机制（Node `child_process.spawnSync`）查 `claude` 是否在 PATH。
2. 找不到时，回退到上述已知路径表。
3. 仍找不到 → 报清晰错误，附 install 链接。
4. 允许 `CCE_CLAUDE_BIN` 环境变量显式指定。

### 6.2 spawn `claude`

Windows 的 `claude` 通常是 `.cmd` shim，`child_process.spawn` 需要 `{ shell: true }` 才能正确解析；但 `shell: true` 又有引号转义陷阱。

**推荐方案**：使用 `cross-spawn` 库（社区事实标准，处理 `.cmd`/`.bat` shim、shebang、参数转义），最终调用：

```js
const cp = require('cross-spawn');
const child = cp.spawn(claudeBin, claudeArgs, {
  stdio: 'inherit',
  env: childEnv,
});
child.on('exit', (code) => process.exit(code ?? 0));
```

`stdio: 'inherit'` 保证 TTY 直接透传，claude 的交互 UI 完全正常工作。

### 6.3 信号转发

`Ctrl+C` 在 Windows 上的处理与 Unix 不同。`stdio: 'inherit'` 已经把信号转发交给操作系统层，**绝大多数场景不需要额外处理**。如果遇到 claude 收不到 SIGINT 的情况（Windows 上偶发），再加显式 `process.on('SIGINT', () => child.kill('SIGINT'))`。

### 6.4 PowerShell 的 PSReadLine 闪烁

`stdio: 'inherit'` 不会触发这个问题（不是 PTY 模拟，只是 fd 继承），实测无影响。

---

## 7. NPM 包结构

```
claude-code-env/
├── package.json
├── README.md
├── LICENSE                       # MIT
├── bin/
│   └── cce.js                    # shebang 入口，最薄一层，require ../src/cli
├── src/
│   ├── cli.js                    # 参数解析 + dispatch
│   ├── config.js                 # 读写 config.json
│   ├── launcher.js               # 找 claude + spawn
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
│       ├── mask.js               # API key 脱敏
│       ├── expand.js             # ${VAR} 展开
│       └── log.js                # 带色彩的日志
├── test/
│   └── *.test.js                 # node:test
└── schema.json                   # config.json 的 JSON Schema
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

设计取舍：
- **CommonJS 而非 ESM**：CLI 工具 + shebang，CJS 兼容性最好，启动也略快。
- **依赖极少**：`cross-spawn` + `picocolors`（无依赖、几 KB）。CLI 解析手写。
- **零构建步骤**：直接发源码，不引入 TypeScript / 打包器。后续如果代码量上来，再切 TS + `tsup` 出单文件。
- **`engines.node >= 18`**：稳定 LTS，避免老 Node 兼容包袱。

### 7.2 `bin/cce.js`

```js
#!/usr/bin/env node
require('../src/cli').run(process.argv.slice(2));
```

`#!/usr/bin/env node` shebang 让 Unix 直接可执行；Windows 由 npm 自动生成 `.cmd` wrapper。

---

## 8. 安全考虑

### 8.1 API Key 存储

v0.1 的方案与 `~/.claude/settings.json` 一致：**明文 JSON**。这是当前生态的默认现状，先与之对齐。**额外做**：

1. **首次写入 config.json 时设置文件权限**：
   - Unix：`chmod 600`
   - Windows：用 `icacls` 或 `Set-Acl` 限制为当前用户独占（可选，加文档说明，不强制）
2. **所有终端输出（list / show / env）默认脱敏**：`sk-abcd…wxyz` → `sk-abcd…***`
3. **`${VAR}` 占位符**：让用户能把 key 放在系统/shell env 里，config.json 只存引用，安全性更高。
4. **`.gitignore` 模板**：README 强调 config.json **不要提交**。

### 8.2 后续可选增强（v0.2+）

- 集成 OS Keychain（macOS Keychain / Windows Credential Manager / libsecret）。
- 加密配置文件（基于本机密钥派生）。
- 「dry-run」模式：`cce -e deepseek --print-env` 只打印不启动，便于调试。

---

## 9. 错误处理与用户体验

| 场景 | 行为 |
|---|---|
| 找不到 `claude` 二进制 | 红色错误：`claude executable not found. Install: https://...`；附 `CCE_CLAUDE_BIN` 提示 |
| 找不到 config.json | 自动创建空配置 + 友好提示「运行 `cce add` 添加第一个 env」 |
| `-e xxx` 但 env 不存在 | 列出可用 env 名 |
| config.json 损坏（JSON parse 错） | 显示行号 + 备份 `config.json.bak` 提示 |
| `cce` 但 `default` 为空 | 直接以「不注入」模式启动，并加一行黄色提示 `[cce] no env injected` |
| Claude 退出码非 0 | 静默透传退出码，不加任何 cce 自己的输出（不要刷屏） |

启动时**默认打印一行简短前缀**（可用 `CCE_QUIET=1` 关闭）：

```
[cce] env=deepseek  model=deepseek-chat  base_url=https://api.deepseek.com/anthropic
```

---

## 10. 实施路线（Milestone）

### M1 —— MVP（先在本机能用，~半天）
- [x] 设计文档（本文件）
- [ ] 仓库初始化、`package.json`、`bin/cce.js` shebang
- [ ] config.json 读写（含初始化、字段校验）
- [ ] CLI parser（手写）
- [ ] 启动模式：`cce` / `cce -e <name>` / `-a "..."` / `-A "..."`
- [ ] 子命令：`list` / `current` / `use`
- [ ] cross-spawn 集成、stdio 透传、退出码透传
- [ ] 本机 Windows 11 验证（PowerShell + cmd）

### M2 —— 完整管理能力
- [ ] `edit` / `show` / `env`（管理 env 走 `cce edit` 直接改 JSON）
- [ ] `${VAR}` 占位符解析
- [ ] API key 脱敏输出
- [ ] Tab 补全脚本（PowerShell + bash + zsh）
- [ ] 错误信息打磨

### M2.5 —— 交互式管理（v0.2 候选）
- [ ] `cce add`（厂商模板向导：DeepSeek/Kimi/GLM/CCR/Custom）
- [ ] `cce remove <name>`（带确认）
- [ ] `cce import` 从 cc-switch 导入

### M3 —— 发布
- [ ] README（中英双语，含 GIF demo）
- [ ] 单元测试覆盖 config + parser + 脱敏
- [ ] GitHub Actions：lint + test on macOS/Win/Linux × Node 18/20/22
- [ ] `npm publish`
- [ ] GitHub release + Hacker News / V2EX 自荐

### M4 —— 增强（按反馈决定）
- [ ] 项目级 `.cce.json` 覆盖
- [ ] Keychain 集成
- [ ] `cce doctor` 自检（PATH、claude 版本、config 合法性）

---

## 11. 决策记录

经讨论已敲定：

1. ✅ **命令名**：`cce`
2. ✅ **配置位置**：`~/.claude/cce/config.json`（在 `~/.claude/` 下用 `cce/` 子目录，避免与官方文件重名，且便于放补全脚本/备份）
3. ✅ **技术栈**：纯 JS + CommonJS，零构建
4. ✅ **Shell 补全**：v0.1 内置 PowerShell + bash + zsh 补全脚本，自动补全用户已配置的 env 名
5. 🟡 **默认 env 行为**（未明示，沿用推荐方案）：裸 `cce` 时若 `default` 未设置 → 不注入直接启动 claude，打印黄色提示
6. 🟡 **GitHub 仓库名**（未明示）：建议 `claude-code-env`，npm 包同名 `claude-code-env`，bin 为 `cce`

### 11.1 交互式 picker（v0.1 加入）

经讨论敲定：

| 决策 | 选择 | 理由 |
|---|---|---|
| 触发方式 | 新增 `cce pick` 子命令 + 裸 `cce`（无默认时）自动进菜单 | 不破坏现有用 `default` 的人；对没设默认的新用户友好 |
| 实现技术 | 纯 Node `readline` + raw mode，**不引依赖** | 与项目「依赖极少」路线一致；只需要 list-select 一个 UI，不值得引整套 prompt 框架 |
| 交互 | ↑/↓ k/j 移动、Enter 选定、Esc/Ctrl+C/q 取消、数字 1–9 跳转 | 兼顾键盘党和初学者 |
| 选完行为 | 直接 spawn claude，**不修改** `default` 字段 | 职责分离：菜单只管「这次启动」，要改默认有 `cce use` |
| 非 TTY 时 | 报错提示用 `cce -e <name>`，不卡死 | 适配 CI / 管道场景 |
| 单 env 时 | 不弹菜单，直接用并提示 | 1 个选项的菜单是 noise |
| 0 env 时 | 报错引导 `cce add` | 没东西可选 |

实现要点（`src/util/picker.js` + `src/commands/pick.js`）：
- 渲染走 stderr，保留 stdout 干净（便于未来 scripting）。
- raw mode 进入前隐藏光标，退出前必须 cleanup 恢复（含异常路径），否则用户终端会留下光标隐藏状态。
- pick.js 的 `pickFromConfig(cfg)` 同时被 `cce pick` 子命令和 `runLaunch` 的「无默认 fallback」复用，避免重复逻辑。

### 11.2 默认参数 (args) 注入（v0.1 加入）

经多轮讨论敲定：

| 决策 | 选择 | 理由 |
|---|---|---|
| 引入方式 | **不再隐式透传 claude 参数**，所有 claude flag 必须包在 `-a "..."` / `-A "..."` 字符串里 | 旧版 cce 跟 claude 共享 flag 空间，claude 新增 flag 永远可能撞车；改成显式后 cce flag 空间封闭，永远零冲突 |
| flag 命名 | `-a`（merge）/ `-A`（override），对应 config 字段 `args` / `argsOverride` | 「a = args」一眼读懂；大小写对仗是主流 CLI 惯例（curl `-d/-D` 等）；之前考虑过 `-c/-C/-cf/-co` 都太特定，不如 `-a` 通用 |
| 优先级层数 | 全局 `args` → per-env `args` → CLI `-a/-A`，3 层 | 「全局共性 + per-env 差异 + CLI 临时」三段 cover 所有场景 |
| 合并语义 | **纯拼接，cce 不 dedupe**，由 claude 自己 last-wins / 叠加 | cce 没 claude 完整 flag schema，主动 dedupe 容易猜错；纯拼接永远不会出错，代价是命令变长 |
| `argsOverride` per-env 字段 | bool，默认 `false`；为 `true` 时该 env 的 `args` 完全替换全局 | 满足"某些 env 不想要全局 args"的需求；用扁平 bool 而非嵌套 enum，未来要扩 mode 再迁移 |
| `-A` 互斥 | 多次 `-A`、`-a` 与 `-A` 同用 → 报错；`-A` 不带值 = 空 args | "强制覆盖"语义要单一，重复或叠加都是矛盾 |
| 配置字段类型 | 字符串（可 shell-tokenize），不是数组 | 复制粘贴 shell 命令最方便；数组主要价值是支持 dedupe，但我们不 dedupe，所以字符串足够 |
| tokenize 工具 | **自写 ~30 行 tokenizer，零依赖** | 实测 `shell-quote` 把 Windows 路径里的 `\X` 当 POSIX 转义吃掉（`D:\My Code\proj` → `D:My` + `Codeproj`，灾难）；自写规则简单可控：空白分隔、引号成对、**反斜杠永远字面值** |
| 启动可见性 | 在 env 摘要行下打第二行 `[cce] $ claude ...` 完整 spawn 命令 | 用户一眼能 verify cce 到底传了什么给 claude，调试极顺 |
| `cce show` | 输出新增 "Claude args (merged)" 节，标注来源（`from global` / `from env`） | 排错最需要的信息全在一处 |

详见 5.4 节算法 + 4.1 节 CLI 使用。

### 11.3 v0.1 不做 `cce add` / `cce remove`

| 决策 | 选择 | 理由 |
|---|---|---|
| `cce add` | **推迟到 v0.2** | 交互式向导（厂商模板、key 输入、确认覆盖）代码量不小，且第一版用户群（开发者）手写 JSON 完全 OK；先发能用的版本，收反馈再决定向导该长什么样 |
| `cce remove` / `cce rm` | **推迟到 v0.2** | 同上，删 env = 编辑 JSON 删一段，`cce edit` 已经够用 |
| 替代方案 | 统一走 `cce edit` 打开 `$EDITOR`（Windows 默认 notepad） | 一条命令搞定所有增/改/删；schema.json 已经提供编辑器补全/校验；不需要单独学习交互式 prompt 的快捷键 |
| 影响范围 | 删 `src/commands/add.js` + `remove.js` + `util/prompt.js`（仅这两个命令用）；parser / cli / help / completion 全部移除引用 | 砍掉 ~250 行代码 + 一个 readline prompt 依赖路径，bug 面更小 |

### 11.4 删除 `cce env` 子命令（v0.1）

| 决策 | 选择 | 理由 |
|---|---|---|
| `cce env` 是否保留 | **不保留** | 「env」一词在 cce 里已被过度复用（子命令 / `-e` flag / 配置 `envs` / 配置内 `env` 字段四种含义），删掉子命令能减一种歧义 |
| 功能替代 | `cce show <name>` | show 已经展示某 env 的环境变量（脱敏），新版还会一起显示该 env 合并后的 claude args；功能完全覆盖原 `cce env` 的「查看」需求 |
| 损失的能力 | `cce env --raw` 的脚本友好 KEY=VALUE 输出 | 在 v0.1 评估为非核心需求；若有人提出可以加 `cce show --raw` 或 `cce show --format=env` 做回补 |
| 影响范围 | 删 `src/commands/env.js`；parser/cli/help/completion 全部移除引用；设计.md 子命令表删一行 | 砍掉一个文件 + 一处 switch case + 几处补全列表，<50 行 |

### 11.5 补全脚本设计补充

补全要点：第二位 token 跟在 `-e` / `--env` 后时，从 `~/.claude/cce/config.json` 读 `envs` 的 key 列表并补全。

**安装方式**（v0.1）：
- `cce completion powershell` → 输出 PowerShell 补全脚本到 stdout，用户 append 到 `$PROFILE`
- `cce completion bash` → 输出 bash 补全脚本，用户 source 到 `~/.bashrc`
- `cce completion zsh` → 输出 zsh 补全脚本

不自动写入用户 profile（避免突袭），README 给出一行 install 提示。后续 v0.2 可考虑 `cce completion install <shell>` 自动写入。

---

## 12. 附：与其他工具的叠加关系

cce 只是启动器，与生态里的其他工具不互斥，反而能叠加：

- **claude-code-router (CCR)**：把 CCR 配成一个 env（`ANTHROPIC_BASE_URL=http://127.0.0.1:3456`），需要多模型路由时 `cce -e ccr`，不需要时直连其他 provider。
- **本地 proxy**：同理，把自建代理配成一个 env 即可。
- **cc-switch (GUI)**：改 `~/.claude/settings.json` 当全局默认；cce 在子进程级用 `--settings` 临时文件覆盖（见 §13.1），两者可共存。

核心区别仍是：cce 不修改任何全局状态，env 只活在 `claude` 子进程的生命周期里。

---

## 13. v0.2 迭代：settings.json env 合并 + 多语言

### 13.1 settings.json env 合并（解决「反向覆盖」）

**问题**：cce 把 provider env 注入到 `claude` 子进程，但 Claude Code 自己也会读 `~/.claude/settings.json` 的 `env`，且其优先级可能高于进程 env，导致 cce 的注入被反向盖掉、切换失效。

**方案**：cce **绝不改写**真实 `~/.claude/settings.json`。而是读它的 `env`，按模式重组出一份只含 `env` 的对象，写到 `~/.claude/cce/tmp/settings-<pid>-<rand>.json`，再用 `claude --settings <tmpfile>` 启动；claude 退出即删该临时文件。

- `claude --help` 实证：`--settings <file-or-json>` 加载 **additional** settings，处于「命令行参数」优先级，**高于** user `~/.claude/settings.json`（最低层）。所以临时文件的 `env` 会盖过 user 的同名键。
- `--settings` 是**合并叠加**而非整体替换，对每个键以高优先级层为准、低层独有键会合并上来。因此对每个键 `effective[k] = (k in tempEnv) ? tempEnv[k] : userEnv[k]`。
- 「删不掉 user 独有键」的限制，用**写空串屏蔽**绕过（已实测：settings 里空串 env 会被 claude 当作未设置）。

**三种模式**（`tempEnv` = 写进临时文件的 env）：

| 模式 | CLI 值 | `tempEnv` 内容 | 效果 |
|---|---|---|---|
| `override`（默认） | `override` | `entry.env` + 把 user 里 entry 未定义的 `KNOWN_ANTHROPIC_VARS` 设为 `""` | 完全以本 env 为准，残留 anthropic 键被屏蔽；user 的非 anthropic 键保留 |
| `merge-cce` | `cce` | `entry.env` | 与 user 取并集，冲突时本 env 优先 |
| `merge-claude` | `claude` | `entry.env` 去掉 user 已有的键 | 与 user 取并集，冲突时 user 的 settings.json 优先 |

**为什么改成单通道**：`buildChildEnv` 不再把 anthropic 变量注入进程 env，改为只**剥离** `KNOWN_ANTHROPIC_VARS`（防 shell 残留），provider env 全部走临时 settings 文件。原因：进程 env vs settings env 的优先级官方未文档化，而 `--settings` 的优先级是确定的；双通道在 `merge-claude` 模式下还会自相矛盾。单通道 = 单一、可预测的优先级。

**分层 + 优先级**（与 args 同构）：根级 `settingsMode` → per-env `settingsMode` → CLI `-m/--merge-mode`，高者覆盖低者，默认 `override`。

**安全**：临时文件名带 `pid`+随机，并发多窗口互不干扰；`chmod 600`；正常退出 / 报错 / 信号 / `process.on('exit')` 全路径清理；启动时清扫 6h 以上的孤儿文件（崩溃残留）。临时文件含展开后的明文 token，但生命周期极短、不进真实配置，比持久化写 settings.json 安全得多。

> 与 §1.1「不修改 settings.json、零全局副作用」一致：临时文件只活在子进程生命周期里，真实 settings.json 一字不动。

### 13.2 多语言（i18n）

- **检测优先级**：`CCE_LANG` 环境变量 > config `lang` > 系统 locale（`Intl` / `LANG`）> 兜底 `en`。
- **不引入 `--lang` flag**：cce 刻意保持封闭、最小的 flag 空间（§4.1），除通用的 `-h/-v` 外不加「非启动」flag。语言这种「只改 cce 自己输出、不影响启动什么」的设置走主流分工：
  - 本次/会话级覆盖 → `CCE_LANG` 环境变量（locale 的主流做法，对齐 `LANG`/`LC_ALL`）。
  - 持久偏好 → `cce lang` 子命令（对齐 `git config` / `gh config set`）：`cce lang` 看当前来源，`cce lang en|zh-CN` 写 config，`cce lang auto` 清回自动检测。
- **实现**：`src/i18n/{index,en,zh-CN}.js`，零依赖；`t(key, params)` 查当前语言→回退 en→回退 key 名；`{name}` 插值。英文为 source of truth，测试强制两份 catalog 键集合一致。
- **范围**：help（整段双语）、warn / error / picker / 各命令提示。启动摘要行（`env=… model=… settings=…`）是数据，不翻译。
- `lang` 在加载完整 config（及其本地化报错）之前就要确定，故用 `config.peekLang()` 做一次不抛异常的轻量读取。

### 13.3 新增 / 变更字段

```jsonc
{
  "lang": null,                 // "en" | "zh-CN" | null(自动)
  "settingsMode": "override",   // 全局默认：override | merge-cce | merge-claude
  "envs": {
    "deepseek": {
      "settingsMode": "merge-cce",   // per-env 覆盖（可选，省略则继承全局）
      "env": { /* ... */ }
    }
  }
}
```

新增 CLI：`-m/--merge-mode <override|cce|claude>`（启动修饰符）、`cce lang [en|zh-CN|auto]`（子命令）。新增 env 读取点尊重 `CLAUDE_CONFIG_DIR`（与 claude 一致）。

---

## 14. 自我更新（手动 + 启动时自动）

cce 发布在 npm（`@xiaofuzhou/cce`），所谓「更新」本质就是**查 npm 上的最新版 → 触发全局重装**。核心放在 `src/update.js`，命令在 `src/commands/update.js`，启动钩子挂在 `runLaunch` 和 `cce pick`。

### 14.1 设计原则

- **零新依赖**：版本查询用 Node 18+ 自带的全局 `fetch` 打 npm registry 的轻量端点 `…/@xiaofuzhou/cce/latest`；semver 比较自写约 40 行（含 prerelease），不引 `semver` 包，延续 §1 的最小依赖原则。
- **绝不拖慢启动**：启动时的检查只读本地缓存（零延迟）；真正的联网查询在后台进行（fire-and-forget，借 claude 子进程让父进程存活期间完成），结果写入缓存供**下次**启动用。
- **状态与配置分离**：检查缓存写在独立的 `~/.claude/cce/update-check.json`（机器管理），不污染用户手编的 `config.json`。字段：`lastCheckAt` / `latestVersion` / `skippedVersion` / `autoUpdatePending`。
- **包管理器只用 npm**：统一 `npm i -g @xiaofuzhou/cce@latest`，不做 pnpm/yarn/bun 探测（实现简单、可预测）。

### 14.2 三种模式（config `updateMode`，默认 `auto`）

| 模式 | 启动时行为 |
|---|---|
| `auto`（默认） | 缓存里有更新 → 后台 detached `npm i -g`（同一目标版只触发一次，靠 `autoUpdatePending` 去重）；装好后下次启动检测到 `current` 已追平，打一行「已在后台更新到 vX」并清除标记 |
| `prompt` | **仅 TTY** 下弹 `picker`「立即更新 / 跳过此版本」；跳过记 `skippedVersion`，`latest === skipped` 时不再问，出更新版本再问。非 TTY 什么都不做、不打印、不阻塞 |
| `off` | 启动时完全不检查 |

另有 `CCE_NO_UPDATE_CHECK=1` 环境变量做单次关闭出口。

### 14.3 关键取舍

- **为什么 prompt 模式非 TTY 不打印提示**：脚本 / 管道 / CI 里没人看输出，提示纯属噪音；真要自动化更新会显式跑 `cce update`，不该靠启动提示。所以非 TTY 直接静默跳过。
- **节流 3h**：`lastCheckAt` 距今 < 3h 就跳过后台刷新，既不频繁联网也不每次打扰；但**手动 `cce update` 不受节流**，每次实时查 registry。
- **git checkout 守卫**：`isGitCheckout()`（检测包根有 `.git`）为真时，启动钩子与 `cce update` 都拒绝 npm 重装，提示用 `git pull`——避免在源码开发目录里误操作。
- **更新落地的时机**：重装的是全局文件，但当前 cce 进程已把代码读进内存，本次运行不受影响；需**重新运行 cce** 才用上新版本。auto 模式正是利用这点在后台安全重装。

### 14.4 新增字段 / CLI

```jsonc
{ "updateMode": "auto" }   // "auto" | "prompt" | "off"，默认 auto
```

新增子命令 `cce update [--check]`；新增环境变量 `CCE_NO_UPDATE_CHECK`；新增状态文件 `~/.claude/cce/update-check.json`。i18n 新增 `update.*` 键（en/zh 各一套），help / completion 同步。

---

## 15. 模板创建 env（`cce add`）

把 §11.3 推迟的 `cce add` 重新引入，但**只做一件事**：照一份模板，把固定部分填好、提示用户补上几项（通常是 token），生成一套 env 写进 `config.json`。核心在 `src/templates.js`（加载/合并）+ `src/commands/add.js`（编排）+ `src/util/prompt.js`（文本输入）。

### 15.1 关键取舍

| 决策 | 选择 | 理由 |
|---|---|---|
| 命令名 | `cce add`（可带 `[模板] [名称]`） | 用户拍板；语义直白，和 `use`/`edit`/`pick` 等子命令一致 |
| 定位 | **只做模板快速生成**，不做通用增删向导 | 把范围收窄到「新手快速接入 DeepSeek/Kimi/GLM」这个真实痛点；任意增删仍走 `cce edit`，`cce remove` 不做 |
| **不用占位符** | 模板的 `env` 全是填好的固定值；另有 `required` 数组列「待填项」，每项 `name` 即 env 键、用户输入即值，填完直接并入 `env` | 避开与运行时 `${VAR}`（启动时从 shell 解析，见 §13.1）的语义冲突 —— 早期设想的 `{{TOKEN}}` 占位符会和它打架，索性不引入占位符 |
| 待填项字段 | `{ name, description, default? }`；空值有 default 则取 default，无 default 则重问 | `required` 语义＝必填；`default` 让「模型名」这类项能回车接受 |
| 名字校验 | 沿用 schema 的 `^[A-Za-z0-9][A-Za-z0-9._-]*$`（`config.isValidEnvName`） | 与 `envs` 的 `patternProperties` 一致，保证 `cce add` 产出的名字也过 schema |
| 重名处理 | 弹二选一 picker：覆盖现有 / 重命名；重命名后再查重，循环 | 不静默覆盖；非 TTY 冲突直接报错退出 |
| 交互门控 | 选模板 / 填字段 / 二选一都需 TTY（`stdin && stdout` 均为 TTY） | 无 TTY 时给全参数且模板无待填项即可纯非交互创建，否则提示需 TTY，绝不卡死 |

### 15.2 模板来源与解析链

后者按模板名**整条覆盖**前者（不深合并，行为可预期）：

```
内置 src/templates.builtin.json
  └─ ~/.claude/cce/templates.json        （用户文件，可选）
       └─ cce add --templates <path>      （仅本次）
```

- 内置随包发布（`files` 已含 `src/`，无需额外配置）；目前含 DeepSeek、Kimi、GLM。
- `--templates` 给的路径找不到 / JSON 非法 → 报错（`TemplateError`）；用户文件不存在则静默跳过。
- 经多轮收敛，**只保留 `--templates` 这一个外部入口**（放弃了环境变量、config 字段、模板目录等方案），保持最小面。

### 15.3 多语言 description（联动 i18n）

模板的 `description` 与 `required[].description` 都可以是 `{ "en": …, "zh-CN": … }` 这样的按语言对象（也兼容纯字符串）。新增 `i18n.localize(value)`：当前语言 → 回退 `en` → 回退第一个非空值；`null`/空对象/无非空值 → `''`（界面不显示）。生成 env 时，模板的多语言描述用 `localize` **塌缩成当前语言一句**存进该 env 的单字符串 `description`。

### 15.4 新增 / 改动

- 新增 `src/templates.builtin.json`、`src/templates.js`（含纯函数 `buildEnvFromTemplate(tpl, answers)` 便于测试）、`src/commands/add.js`、`src/util/prompt.js`。
- `src/i18n/index.js` 导出 `localize`；`src/config.js` 加 `ENV_NAME_RE` / `isValidEnvName`。
- `parser.js` / `cli.js` 注册 `add`；`help.js`、`completion.js`（补模板名 + `--list`/`--templates`，新增内部 `completion --templates` 发射器）、`en.js`/`zh-CN.js`（新增 `add.*` 键）同步。
- 测试 `test/templates.test.js`：`localize` 回退、模板规范化、`buildEnvFromTemplate`、来源覆盖合并、缺文件 / 坏 JSON 报错、名字校验。

> **后续变更**：§15.2 的「内置随包发布」与 `--templates` 入口已在 v0.6 被远端模板方案取代；
> `cce remove` 已在 v0.5 实现（带二次确认）。当前设计见 §16。

---

## 16. 远端模板 + `cce template`（v0.6）

### 16.1 动机

默认模板若随 npm 包发布，更新就被「冻」在版本里 —— 改个模型名要发版、用户要升级才拿得到。
把默认模板挪到 GitHub 仓库实时获取 + 本地缓存，用户总能拿到最新的，且改模板不必发版。

### 16.2 关键取舍

| 决策 | 选择 | 理由 |
|---|---|---|
| 是否保留随包 bundle | **不保留**（用户拍板） | 跑过 `npm i -g` 说明有网；离线/失败时打印链接让用户手动下，比冻结的 bundle 更可控 |
| 默认源 | jsDelivr 主 + GitHub raw 兜底 | jsDelivr 国内可达；raw 常被墙，仅兜底 |
| 源文件位置 | 仓库根 `templates/builtin.json`（移出 `src/`，不打进包） | 与代码解耦；`files` 只含 `src/`，天然不随包发布 |
| TTL | 24h，按 `cache.json` 的 `fetchedAt` 算 | 不靠文件 mtime（会被备份/同步/拷贝改写，不可靠） |
| 缓存文件 | 内容存 `templates.remote.json`（与远端同构），元数据存 `cache.json` | 同构 → 下载失败可把 URL 内容原样存到该路径，无需 import 命令 |
| 统一缓存 | 删 `update-check.json`，所有机器态走 `cache.json`（`update` / `template` 两段） | 一个缓存文件，旧文件留作孤儿（用户少，影响小） |
| 一次性来源 | `cce add --from <path\|url>`（取代 `--templates`），`^https?://` 判 URL 否则路径 | 一个入口同时支持本地/远程；不写缓存、不改配置 |
| 内网/离线 | `config.template.url`（单镜像，不兜底）+ `config.template.offline`（永不联网、跳过 TTL） | 两条路：有镜像配 url；没有就手放缓存 + offline |

### 16.3 加载链

```
默认层：--from 指定的来源  或  远端/缓存 templates.remote.json
  └─ 叠加 ~/.claude/cce/templates.json（用户文件）
最终为空 → 按上下文报错（offline 无缓存 / fetch 失败 / --from 空）并打印 URL + 应存路径
```

远端层逻辑：`offline` → 只读缓存、不联网、不看 TTL；否则缓存新鲜（`now-fetchedAt<24h`）用缓存，过期/无则拉
（`config.template.url` 设了只用它，否则 jsDelivr→raw）。拉成功写缓存 + 带 `etag` 写 `cache.json`（下次发
`If-None-Match`，304 只刷新 `fetchedAt`）；全失败则回落旧缓存（打 warn）或报错。

### 16.4 子命令 `cce template`（别名 `tpl`）

裸 `cce template` 出状态总览（url / offline / 缓存数 + 年龄，**不联网**）；`ls`/`list` 列模板（取代 `cce add --list`）；
`show <名>` 看单模板 env + 待填项；`refresh` 强制拉（忽略 TTL + offline）；`url [<url>|--none]` 与 `offline [on|off]`
读/写 `config.template`。**补全取模板名（`completion --templates`）走 cache-only（`allowFetch:false`），永不联网、永不报错。**

### 16.5 新增 / 改动

- 新增 `src/cache.js`（统一 `cache.json`）、`src/commands/template.js`；移动 `src/templates.builtin.json` → `templates/builtin.json`。
- 重写 `src/templates.js`：远端拉取 + 缓存 + `--from` + 离线 + 上下文化报错；`loadTemplates` 变为 **async**。
- `src/update.js` 的 `readState`/`writeState` 改为 `cache.js` 的 `readUpdate`/`writeUpdate` 薄封装。
- `src/config.js` + `schema.json` 加 `template { url, offline }`；`src/commands/add.js` 把 `--templates`→`--from`、删 `--list`/`runList`。
- `parser.js`/`cli.js` 注册 `template`/`tpl`（dispatch 改 async）；`completion.js` 四端补 `template` 子命令 + `--from`；`help.js`、i18n（`template.*` 键，删 `add.list*`/`add.noTemplates*`/`add.templatesNeedsPath`）同步。
- 测试：重写 `test/templates.test.js`（离线缓存 + 用户叠加、`--from`、stub fetch 写缓存），新增 `test/cache.test.js`。
