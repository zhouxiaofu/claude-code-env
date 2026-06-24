# 模板 v2 —— 表单式可参数化模板（设计文档）

> 状态：**设计中**（feat/template-v2 分支）
> 目标：让一份模板能表达「同一服务商下的多种套餐 / 端点 / 模型版本」等正交选择，而不必为每种组合复制一份模板。

---

## 1. 背景与动机

### 1.1 现状

当前模板（见 `templates/builtin.json`）的结构是：

```jsonc
"deepseek": {
  "description": { ... },
  "docs": "...",
  "env": { "ANTHROPIC_BASE_URL": "...", "ANTHROPIC_MODEL": "...", ... },
  "required": [ { "name": "ANTHROPIC_AUTH_TOKEN", "description": { ... } } ]
}
```

- `env`：固定写入子进程的环境变量。
- `required`：需要用户填的项，填完直接覆盖进 `env`（见 `buildEnvFromTemplate`）。

这套结构「一个模板 = 一份固定 env + 几个待填项」，只能表达**单一配置**。

### 1.2 问题

同一个服务商常有**多个正交的选择维度**，它们只改 `env` 里的少数几个键：

- **小米 MiMo**：套餐有「按量付费（`sk-` Key、`api.xiaomimimo.com`）」和「Token Plan 订阅（`tp-` Key、`token-plan-cn.xiaomimimo.com`）」——只差 `ANTHROPIC_BASE_URL` 和 Key 的格式提示。
- 同时还有**不同模型版本**（如 `mimo-v2.5-pro[1m]` / `mimo-v2.5-pro`）——只差 `*_MODEL` 几个键。
- **Kimi**：将来要同时支持 k2.6 / k2.7——只差 `ANTHROPIC_MODEL`。

用现有结构，`套餐 × 模型` 的每种组合都要单独写一份模板（`mimo` / `mimo-tp` 已经是这样复制出来的），N 个维度就是笛卡尔积级别的重复。

### 1.3 目标

- 一份模板能声明若干**选择维度**和**输入项**，并且维度之间正交、可任意嵌套。
- 选择与最终 `env` 解耦：`env` 用 `${var}` 占位，由用户的选择/输入填充。
- 交互式（菜单 + 输入）与非交互式（`--set`）都能用。
- **代码侧只支持 v2 结构**：旧的 `required` / `buildEnvFromTemplate` 引擎直接替换掉，不做双引擎、不在代码里保留向后兼容。已发布的老客户端通过「带版本号的源 URL 各取各的文件」隔离（见 §9），不靠代码兼容。

---

## 2. 核心思想

**一份模板就是一张「带条件分支的表单」。** 表单字段把用户的选择/输入收集进一个**变量命名空间** `vars`，最后用 `vars` **渲染** 顶层 `env`（值里写 `${var}` 占位）。

整条链路只有一种机制：**字段 → 变量 → 渲染**。没有第二套并行机制（选项上不再挂 `env`/`vars` 片段，要设值一律用叶子字段）。

```
用户的选择/输入  ──收集──▶  vars 命名空间  ──插值──▶  渲染后的 env
   (inputs)                  {k: v, ...}            {ENV_KEY: 值}
```

---

## 3. 数据结构（唯一的递归文法）

```
Template = {
  description : Localized,           // 选择菜单里的标题/说明
  docs?       : string,              // 官方文档链接
  name?       : string,              // env 默认名表达式（见 §7），如 "kimi-${plan}${ model ? '-'+model : '' }"
  env         : { ENV_KEY: ValueWithInterpolation, ... },   // 渲染目标，值可含 ${var}
  inputs?     : [ Input ]            // 有序；表单字段树
}

Input =
  | { type: "env",    name, value?, description?, default? }    // 叶子：默认提问 → env[name]=输入；给了 value 则不提问 → env[name]=value（value 可含 ${var}）
  | { type: "var",    name, description?, default? }            // 叶子：提问 → vars[name] = 输入
  | { type: "const",  vars?: {…}, env?: {…} }                   // 叶子：不提问，固定值
  | { type: "select", name?, description?, options: [Option] } // 分支：单选

Option = {
  name   : string,                   // 稳定 id（非交互 --set 用）
  label  : Localized,                // 菜单里显示
  inputs : [ Input ]                 // ★ 递归点：选中此项后继续收集这些字段
}
```

要点：

1. **设值只靠叶子**（`env` / `var` / `const`）。`select` 只负责「分叉」，不直接设值。
2. **`select` 的 option 下面就是 `inputs`**——这是递归点。option 是「带标签的子树」，里面可以放 `const` 落值、放 `env` 追加提问或写死键、甚至再放一个 `select` 继续分叉，**深度不限**。
3. `type` 缺省为 `env`。`env` 不带 `value` 时提问用户（等价于旧的 `required` 项）；带 `value` 时不提问、直接把 `value` 写进 `env[name]`（像 `const`，且 `value` 可含 `${var}`）。这样分支里既能「让用户填 Key」也能「写死 BASE_URL」，都用同一个 `env` 字段。
4. 顶层 `env` 是输出的「形状」，用 `${var}` 留洞；洞由叶子字段填。共享的键（如四个 `*_MODEL`）只写一次，避免每个选项重复。分支专属、只在选中时才出现的键，则用分支内的 `env`(+`value`) 或 `const.env` 追加。

---

## 4. 示例

### 4.1 mimo：套餐 × 模型（两个正交 select）

```jsonc
"mimo": {
  "description": { "zh-CN": "小米 MiMo（兼容 Claude 接口）" },
  "docs": "https://mimo.mi.com/docs/zh-CN/tokenplan/integration/claudecode",
  "env": {
    "ANTHROPIC_BASE_URL": "${baseUrl}",
    "ANTHROPIC_MODEL": "${model}",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "${model}",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "${model}",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "${modelFast}"
  },
  "inputs": [
    { "type": "select", "name": "plan", "description": { "zh-CN": "套餐" },
      "options": [
        { "name": "payg", "label": { "zh-CN": "按量付费（sk-…）" },
          "inputs": [
            { "type": "const", "vars": { "baseUrl": "https://api.xiaomimimo.com/anthropic" } },
            { "type": "env", "name": "ANTHROPIC_AUTH_TOKEN", "description": { "zh-CN": "Key（sk-xxxxx）" } }
          ] },
        { "name": "tp", "label": { "zh-CN": "Token Plan 订阅（tp-…）" },
          "inputs": [
            { "type": "const", "vars": { "baseUrl": "https://token-plan-cn.xiaomimimo.com/anthropic" } },
            { "type": "env", "name": "ANTHROPIC_AUTH_TOKEN", "description": { "zh-CN": "Key（tp-xxxxx）" } }
          ] }
      ] },
    { "type": "select", "name": "model", "description": { "zh-CN": "模型" },
      "options": [
        { "name": "pro-1m", "label": { "zh-CN": "v2.5 Pro (1M)" },
          "inputs": [ { "type": "const", "vars": { "model": "mimo-v2.5-pro[1m]", "modelFast": "mimo-v2.5-pro[1m]" } } ] },
        { "name": "pro", "label": { "zh-CN": "v2.5 Pro" },
          "inputs": [ { "type": "const", "vars": { "model": "mimo-v2.5-pro", "modelFast": "mimo-v2.5-pro" } } ] }
      ] }
  ]
}
```

用户依次选「套餐」「模型」，Key 的提示跟着套餐走。一份模板表达 2×N 种组合，零重复。

### 4.2 任意深度嵌套（套餐 → 区域 → ……）

```jsonc
{ "type": "select", "name": "plan", "options": [
  { "name": "tp", "label": { "zh-CN": "Token Plan" }, "inputs": [
    { "type": "select", "name": "region", "options": [
      { "name": "cn", "label": { "zh-CN": "国内" }, "inputs": [
        { "type": "const", "vars": { "baseUrl": "https://token-plan-cn.xiaomimimo.com/anthropic" } },
        { "type": "env", "name": "ANTHROPIC_AUTH_TOKEN", "description": { "zh-CN": "Key（tp-xxxxx）" } }
      ] }
    ] }
  ] }
] }
```

### 4.3 简单服务商（无需 inputs 表单，仍用直接进 env 的叶子）

```jsonc
"deepseek": {
  "description": { "zh-CN": "DeepSeek（兼容 Claude 接口）" },
  "docs": "...",
  "env": { "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic", "ANTHROPIC_MODEL": "deepseek-v4-pro", ... },
  "inputs": [
    { "type": "env", "name": "ANTHROPIC_AUTH_TOKEN", "description": { "zh-CN": "API Key" } }
  ]
}
```

> 单输入、无分叉时，`inputs` 退化为一个 `env` 叶子，与旧的 `required` 写法等价。

---

## 5. 渲染语义

### 5.1 收集 → 插值（两阶段）

1. **收集**：深度优先遍历 `inputs`，维护 `vars = {}` 与 `env = { ...template.env }`（未插值的副本）。
   - `const` → 合并其 `vars` / `env`；
   - `var` → 提问用户，写入 `vars[name]`；
   - `env` → 带 `value` 则不提问、`env[name] = value`（像 `const`，`value` 可含 `${var}`）；不带 `value` 则提问、`env[name] = 输入`；
   - `select` → 让用户选一个 option，记录 `vars[select.name] = option.name`，然后**递归进 `option.inputs`**。
2. **插值**：收集全部结束后，把 `env` 里所有 `${x}` 用 `vars[x]` 替换。

**先收集后插值** 是关键——这样选择的先后顺序不影响结果，多个 select 维度天然正交。

### 5.2 边界规则

- `${x}` 未定义（收集完仍无 `vars.x`）→ `cce add` 报清晰错误（模板作者 bug），并指出缺哪个变量。
- `$$` 转义为字面 `$`（`env` 值里极少出现 `${`，但保留逃逸口）。
- **插值只作用于模板作者写的值**——顶层 `env`、`const` 的 `vars`/`env`、`env` 叶子的 `value`。
- **用户输入的值**（`env`/`var` 叶子提问得到的）按**字面**处理，不再二次插值（避免把用户输入当模板执行）。
- `select` 的 `name` 可选；省略时该选项不写 `vars`（纯分叉），但仍建议给 option 一个 `name` 以支持非交互。

---

## 6. 命令行交互

### 6.1 交互式

`cce add mimo` → 进入表单：逐个 `select` 弹方向键菜单、逐个 `env`/`var` 提示输入 → 命名 env → 保存。

### 6.2 非交互式（`--set`）

每个 `select` 的 option 有稳定 `name`，每个 `env`/`var` 有 `name`，因此可全程预填：

```bash
cce add mimo --set plan=tp --set model=pro-1m --set ANTHROPIC_AUTH_TOKEN=tp-xxxxx
```

- `--set <select.name>=<option.name>` 选定分支；
- `--set <env/var name>=<value>` 填值；
- 无 TTY 且某必需字段未通过 `--set` 提供 → 报错，列出缺失项及（对 select）可选值。

### 6.3 展示

`cce template show mimo` 以**树状**展示 inputs：select 列出各 option，option 下缩进显示其子字段，方便用户在跑之前看清有哪些维度可选。

---

## 7. env 命名

### 7.1 问题

旧逻辑用模板名作为新建 env 的默认名（`cce add kimi` → `kimi`）。v2 里一个模板能选出多种配置（kimi 选 k2.6 / k2.7），都叫 `kimi` 必然撞名。而且 select 的**深度可变**——订阅分支不选模型、付费分支才选——名字的段数也跟着变。

### 7.2 方案：`name` 表达式

顶层新增可选字段 `name`：一个**字符串模板**，`${ }` 里写一小段表达式，`${}` 外是字面量。**不强制连接符**，分隔由作者写在表达式里，按需出现。

```jsonc
"name": "kimi-${plan}${ model ? '-' + model : '' }"
```

- 付费 + k2.6 → `kimi-api-k2.6`
- 订阅（没有 model select，`model` 未定义）→ `kimi-sub`（不会多出尾部横线）

### 7.3 表达式文法（小而固定）

| 能力 | 写法 |
|---|---|
| 取变量 | `model`（未定义 = 空串，条件里为假） |
| 字符串字面量 | `'-'`、`'api'` |
| 拼接 | `+` |
| 三元 | `cond ? a : b` |
| 条件 | `model`（非空即真）、`plan == 'api'`、`plan != 'sub'`、`!model` |
| 分组 | `( )` |

- **输出是字符串**；`== != !` 只用于三元的条件位。
- 变量取自渲染命名空间 `vars`（select 选中项记为 `vars[select.name] = option.name`，加上 `const`/`var` 设的值）。所以 `${plan}`/`${model}` 就是该 select 选中 option 的 id；想要不同的名字片段，用 `const` 设个变量再引用即可（**不需要在 option 上单设命名字段**）。

### 7.4 ⚠️ 安全：必须沙箱求值，禁止 eval

模板是**远程拉取的不可信内容**，`name` 表达式**必须用手写的沙箱求值器**（固定文法的 tokenizer + 递归下降求值，约 90 行纯 JS、零依赖），**严禁 `eval` / `new Function`**——否则即远程代码执行漏洞。求值器只能访问 `vars`（全字符串）、无任何全局/函数调用、限制输入长度与递归深度。加载模板时预解析所有 `name` 表达式，解析失败则容错（退回默认名）。

> 可行性已用 ~90 行 PoC 验证：`kimi-${plan}${ model ? '-' + model : '' }` 在 `{plan:api,model:k2.6}` / `{plan:sub}` 下分别得到 `kimi-api-k2.6` / `kimi-sub`，等值映射 `${ plan == 'api' ? 'pay' : 'sub' }` 等也正确。

### 7.5 优先级与兜底

```
显式名 (cce add kimi 我的名字)  >  name 表达式渲染  >  模板名
```

- 只有 **select** 影响名字；自由输入（`env`/`var`）不进名字。
- 渲染结果按 env 名规则 `^[A-Za-z0-9][A-Za-z0-9._-]*$` 校验/清洗（非法字符 → `-`，去首尾分隔符）；为空或表达式非法 → 退回模板名。**名字保持 ASCII**（中文等只放 `label` 显示，不进 env 名）。
- 撞名仍走现有 `resolveEnvName`（覆盖 / 改名），`name` 只负责给一个好的默认值。

---

## 8. 与现有模板共存

**代码不做双引擎**：本分支直接把模板引擎换成 v2，删掉旧的 `required` 处理。新旧隔离只靠一层——

- **按文件版本隔离**（见 §9）：带版本号的源 URL 让不同 cce 各取各的模板文件。已发布的老客户端（URL 无版本）继续拉旧的、冻结的 `builtin.json`；装了本功能的新客户端拉 `builtin.v2.json`。两边互不影响，代码里无需识别旧格式。
- 现有 5 个模板**全部改写成 v2 形式**并放进 `builtin.v2.json`；其中 `mimo` + `mimo-tp` 合并为一个带 `plan` select 的 `mimo`（见 §10 附录的完整数据）。

---

## 9. 模板源 URL 与版本变量

### 9.1 动机

模板格式会随版本演进（v1 的 `required` → v2 的 `inputs` → …）。**一个 cce 二进制只认它支持的那个模板版本**，绝不能下载到更新格式、解析失败。做法：把「当前 cce 支持的模板版本」作为变量嵌进源 URL，由 cce 在拉取前替换。不同版本的 cce 因此拉取不同文件。

### 9.2 官方变量（白名单）

URL 支持通用的 `${var}` 占位，但**只允许官方变量表里的变量**。表是可扩展的——以后要加新变量只往 `URL_VARS` 里加一个键；目前只有一个：

| 变量 | 含义 | 取值示例 |
|---|---|---|
| `${version}` | 当前 cce 支持的模板 schema 版本（整数） | `2` |

- 实现：`URL_VARS = { version: String(TEMPLATE_SCHEMA_VERSION) }`，`substituteUrlVars(url)` **复用模板表达式引擎** `expr.render(url, URL_VARS, { strict: true })`——`${version}` 当标识符解析成表里的值，未知 `${foo}` 在 strict 下抛错。
- `TEMPLATE_SCHEMA_VERSION = 2`（实现已落地）。URL 里出现白名单之外的 `${foo}` → 非法（`cce template url` 设置时即报错拒绝）。

### 9.3 默认源 URL（改为带版本）

```
https://cdn.jsdelivr.net/gh/zhouxiaofu/claude-code-env@main/templates/builtin.v${version}.json
https://raw.githubusercontent.com/zhouxiaofu/claude-code-env/main/templates/builtin.v${version}.json
```

- 仓库改为按版本分文件托管：`templates/builtin.v1.json`、`builtin.v2.json`、……
- 旧的、无版本的 `templates/builtin.json` **保留并冻结**，给本功能上线前的老客户端（它们的 URL 还是无版本的）继续用。
- 以后升级模板格式 = 新增一个 `builtin.v{N}.json` + 把 `TEMPLATE_SCHEMA_VERSION` 置为 `N`，URL 不用动。

### 9.4 用户自定义镜像 URL

`cce template url <url>` 设置的镜像 URL 同样支持 `${version}`（且只许用白名单变量）：

```bash
cce template url https://mirror.intra/cce/builtin.v${version}.json
```

- URL 不含 `${version}` 也合法，按字面使用——现有镜像无需改动。
- 含白名单外变量 → 设置时报错。

### 9.5 替换与缓存时机

- 在**拉取前**把 URL 里的 `${version}` 替换成 `TEMPLATE_SCHEMA_VERSION`。
- 缓存与 ETag/If-None-Match 以**替换后的实际 URL** 为键。
- `cce template`（状态）展示**替换后的实际 URL**，避免用户看到占位符困惑。

### 9.6 缓存有效期与超时（已落地）

- **TTL = 3 小时**（`TTL_MS = 3 * 60 * 60 * 1000`）：缓存文件在 3 小时内直接用，不联网。
- **超时 = 5 秒**（`FETCH_TIMEOUT_MS = 5000`）。过期后联网拉取：
  - 5 秒内拿到 → 原子替换本地缓存（写 `.tmp` 再 rename），本次即用最新模板。
  - 超过 5 秒（或失败）→ 放弃本次拉取，**降级使用现有缓存文件**。
- **首次无缓存**时没有可降级的旧文件，只能等这一次拉取的结果。
- 注：不做「超时后台继续拉取」——命令行进程无可靠的后台语义，5 秒对正常网络足够。

---

## 10. 落地开发

> 本节是给实现者的可执行规格。**代码侧只支持 v2**，直接替换旧的 `required` / `buildEnvFromTemplate`。

### 10.1 现有代码地形（落地前先读）

| 文件 | 现状关键点 |
|---|---|
| `src/templates.js` | `normalizeTemplate(name, raw, source)`（现把 `required` 归一化）、`buildEnvFromTemplate(tpl, answers)`、`loadTemplates`、`isUrl`、`REMOTE_SOURCES`、`fetchRemote`、`ensureRemoteCache`。**改这里**：归一化 `inputs` 树、删 `buildEnvFromTemplate`。 |
| `src/commands/add.js` | `parseArgs(args)`（`--from` + 两个位置参数）、交互填 `required`、`resolveEnvName`。**改这里**：递归收集 + `--set` + 用 `name` 生成默认名。 |
| `src/commands/template.js` | `showTemplate`（列 env + required）、`listTemplates`。**改这里**：`show` 改树状展示。 |
| `src/util/picker.js` | `pick({ title, items:[{value,label,hint}], initialValue })` → 选中 `value` 或 `null`（取消）。select 菜单复用它。 |
| `src/util/prompt.js` | `question(query)` → 字符串或 `null`（Ctrl-C）；`confirm(query, default)`。env/var 输入复用。 |
| `src/config.js` | `isValidEnvName(name)`、`ENV_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/`。env 名清洗复用。 |
| `src/i18n/{zh-CN,en}.js` | `t(key, params)`、`localize(localizedObj)`。新文案加这里。 |

### 10.2 改动文件清单

- **新增** `src/util/expr.js`：安全表达式求值器 + `render()`（§10.5）。
- **改** `src/templates.js`：`normalizeTemplate` 递归归一化 `inputs`；删 `buildEnvFromTemplate`；导出渲染所需纯函数。
- **改** `src/commands/add.js`：`parseArgs` 加 `--set`；递归收集 `collectInputs`；`finalizeEnv`；默认名生成；`resolveEnvName` 接受新默认名。
- **改** `src/commands/template.js`：`showTemplate` 树状展示。
- **改** `src/commands/completion.js`：`cce add` 之后没有固定子命令，但 `--set` 可补全提示（可选）。
- **改** `src/i18n/zh-CN.js` / `en.js`：新文案（§10.11）。
- **改/换** `templates/builtin.json` → 内容改写为 v2；上线时另存为 `builtin.v2.json`（§10.12 附完整数据）。
- **新增** 单测：`expr.js`（重点）、归一化、渲染、默认名清洗。

### 10.3 归一化后的数据模型

```
Template = {
  name, description|null, docs|null,
  nameExpr: string|null,                 // 来自 raw.name
  env: { ENV_KEY: rawString },           // 值可含 ${...}
  inputs: [ Input ],
  source
}
Input =
  | { type:'env',    name, value?:string, description|null, default?:string }
  | { type:'var',    name, description|null, default?:string }
  | { type:'const',  vars:{k:string}, env:{ENV_KEY:string} }
  | { type:'select', name|null, description|null, options:[Option] }
Option = { name, label, inputs:[Input] }
```

### 10.4 `normalizeTemplate` 解析规则（容错，不抛）

- `raw` 非对象 → 返回 `null`（丢弃该模板）。
- `description = raw.description ?? null`；`docs = string?raw.docs:null`；`nameExpr = string?raw.name:null`。
- `env`：取对象里**值为字符串**的键（丢非字符串值，沿用现有写法）。
- `inputs = normalizeInputs(raw.inputs)`（缺省 `[]`）。
- `normalizeInput(node)`（返回归一化节点或 `null` 丢弃）：
  - 非对象 → `null`。`type` 缺省为 `'env'`。
  - `env`：`name` 必须非空字符串否则丢；`value`/`default` 取字符串（可选）；`description ?? null`。
  - `var`：同上但无 `value`。
  - `const`：`vars` / `env` 各取「值为字符串」的键，缺省 `{}`。
  - `select`：`options` 必须非空数组否则丢；`name` 取字符串或 `null`；逐个 `normalizeOption`，全丢则该 select 丢。
  - `option`：`name` 必须非空字符串否则丢；`label = raw.label ?? null`；`inputs = normalizeInputs(...)`。
- `normalizeInputs(arr)`：非数组 → `[]`；逐个归一化，丢弃 `null`。

### 10.5 表达式求值器 `src/util/expr.js`（已验证可跑）

文法：`ident | 'str' | + | ?: | == != ! | ( )`，输出字符串。**禁止 `eval`/`Function`**；只读 `vars` 自有属性（防原型污染）；限制源长度。`render()` 扫描 `${...}`（跳过字符串内的 `}`），`$$` 转义为 `$`。env 值用 `strict:true`（未定义变量抛错），`name` 用 `strict:false`（未定义 → 空串）。

```js
'use strict';

const MAX_EXPR_LEN = 512;

function tokenize(src) {
  const toks = []; let i = 0;
  const isIdStart = (c) => /[A-Za-z_]/.test(c);
  const isId = (c) => /[A-Za-z0-9_]/.test(c);
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
    if (c === "'") {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== "'") { s += src[j]; j++; }
      if (j >= src.length) throw new Error('unterminated string');
      toks.push({ t: 'str', v: s }); i = j + 1; continue;
    }
    if (isIdStart(c)) {
      let j = i, s = '';
      while (j < src.length && isId(src[j])) { s += src[j]; j++; }
      toks.push({ t: 'id', v: s }); i = j; continue;
    }
    if (c === '=' && src[i + 1] === '=') { toks.push({ t: 'op', v: '==' }); i += 2; continue; }
    if (c === '!' && src[i + 1] === '=') { toks.push({ t: 'op', v: '!=' }); i += 2; continue; }
    if ('+?:!()'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    throw new Error('unexpected char: ' + c);
  }
  toks.push({ t: 'eof' });
  return toks;
}

// vars 必须只读自有属性：用 Object.hasOwn 防 __proto__/constructor 注入。
function evalExpr(src, vars, { strict = false } = {}) {
  if (typeof src !== 'string' || src.length > MAX_EXPR_LEN) throw new Error('bad expr');
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const expect = (v) => { const t = next(); if (t.v !== v) throw new Error('expected ' + v); };
  const truthy = (x) => (typeof x === 'boolean' ? x : typeof x === 'string' && x.length > 0);
  const toStr = (x) => (typeof x === 'boolean' ? (x ? 'true' : '') : x == null ? '' : String(x));

  function ternary() {
    const cond = equality();
    if (peek().v === '?') { next(); const a = ternary(); expect(':'); const b = ternary(); return truthy(cond) ? a : b; }
    return cond;
  }
  function equality() {
    let l = add();
    while (peek().v === '==' || peek().v === '!=') { const op = next().v; const r = add(); const eq = toStr(l) === toStr(r); l = op === '==' ? eq : !eq; }
    return l;
  }
  function add() { let l = unary(); while (peek().v === '+') { next(); l = toStr(l) + toStr(unary()); } return l; }
  function unary() { if (peek().v === '!') { next(); return !truthy(unary()); } return primary(); }
  function primary() {
    const t = peek();
    if (t.v === '(') { next(); const e = ternary(); expect(')'); return e; }
    if (t.t === 'str') { next(); return t.v; }
    if (t.t === 'id') {
      next();
      if (Object.prototype.hasOwnProperty.call(vars, t.v)) return String(vars[t.v]);
      if (strict) throw new Error('undefined variable: ' + t.v);
      return '';
    }
    throw new Error('unexpected token');
  }

  const r = ternary();
  if (peek().t !== 'eof') throw new Error('trailing tokens');
  return toStr(r);
}

// 渲染模板串：字面量 + ${expr}；$$ → $。
function render(tpl, vars, opts) {
  let out = '', i = 0;
  while (i < tpl.length) {
    if (tpl[i] === '$' && tpl[i + 1] === '$') { out += '$'; i += 2; continue; }
    if (tpl[i] === '$' && tpl[i + 1] === '{') {
      let j = i + 2, inStr = false;
      for (; j < tpl.length; j++) { const ch = tpl[j]; if (inStr) { if (ch === "'") inStr = false; } else if (ch === "'") inStr = true; else if (ch === '}') break; }
      if (j >= tpl.length) throw new Error('unterminated ${');
      out += evalExpr(tpl.slice(i + 2, j), vars, opts);
      i = j + 1; continue;
    }
    out += tpl[i]; i++;
  }
  return out;
}

module.exports = { evalExpr, render };
```

> 已验证：`render("kimi-${plan}${ model ? '-' + model : '' }", {plan:'api',model:'k2.6'})` → `kimi-api-k2.6`；`{plan:'sub'}` → `kimi-sub`；`render("${ plan == 'api' ? 'pay' : 'sub' }", {plan:'api'})` → `pay`。

### 10.6 收集 → 渲染算法

收集在 `add.js`（要交互），渲染用 §10.5 的纯函数。状态：

```
ctx = {
  interactive: bool,
  answers: Map<string,string>,   // 来自 --set
  vars: {},                      // 命名空间（select 选择 + const/var）
  envT: {...template.env},       // 待插值 env（作者值）
  envLit: {},                    // 字面 env（用户输入，不插值）
}
```

`collectInputs(inputs, ctx)`（深度优先；取消抛 `CancelError`，非交互缺字段抛 `TemplateError`）：

- `const` → `Object.assign(ctx.vars, node.vars)`；`Object.assign(ctx.envT, node.env)`。
- `var` → `ctx.vars[node.name] = getInput(node, ctx)`。
- `env` → 有 `value`：`ctx.envT[node.name] = node.value`；无 `value`：`ctx.envLit[node.name] = getInput(node, ctx)`。
- `select` → `opt = choose(node, ctx)`；若 `node.name` 则 `ctx.vars[node.name] = opt.name`；`collectInputs(opt.inputs, ctx)`。

`getInput(node, ctx)`：
1. `answers.has(node.name)` → 返回其值；
2. 否则非交互 → 抛 `TemplateError(add.missingField, {name})`；
3. 否则 `prompt.question`（拼 description + `[default]`），空输入取 `default`（无 default 则重问），`null` → `CancelError`。

`choose(select, ctx)`：
1. `select.options.length === 1` → 直接返回该 option（不弹菜单）；
2. `select.name && answers.has(select.name)` → 按 `option.name` 找；找不到 → 抛 `TemplateError(add.invalidOption, {name, valid})`；
3. 非交互且无预设 → 抛 `TemplateError(add.missingSelect, {name, valid})`；
4. 交互 → `pick({ title: localize(select.description), items: options.map(o=>({value:o.name,label:localize(o.label),hint:''})) })`；`null` → `CancelError`。

`finalizeEnv(ctx)`（全部收集完后）：
```
const out = {};
for (const k of Object.keys(ctx.envT)) out[k] = render(ctx.envT[k], ctx.vars, { strict: true });
Object.assign(out, ctx.envLit);   // 用户字面值最终覆盖同名键
return out;
```
`render` strict 抛错（未定义变量）→ 包成 `TemplateError(add.unresolvedVar,{var})`。

### 10.7 `cce add` 流程

`parseArgs(args)` 产出 `{ from, sets: Map, templateName, envName }`：
- `--from <v>` / `--from=<v>`（沿用现有）。
- `--set k=v` / `--set=k=v`（可重复）→ `sets.set(k, v)`；缺 `=` 报 `add.badSet`。
- 其余两个位置参数 = `templateName`、`envName`（不变）。

`run`：
1. 加载模板、定位模板（位置参数或 `pick` 菜单），同现有。
2. `ctx = { interactive, answers: sets, vars:{}, envT:{...tpl.env}, envLit:{} }`；`collectInputs(tpl.inputs, ctx)`。
3. `env = finalizeEnv(ctx)`。
4. 默认名 `def = suggestName(tpl, ctx.vars)`（§10.8）。
5. `name = resolveEnvName(tpl, opts.envName ?? def, cfg)`（显式名优先；交互下 `def` 作为提示默认值）。
6. 写 `cfg.envs[name] = { description: localize(tpl.description), env }`；保存；`add.created` + `add.docsHint`。
7. 取消 → 130；`TemplateError` → 打印 + 1。

### 10.8 默认 env 名生成 + 清洗

```
suggestName(tpl, vars):
  if !tpl.nameExpr: return tpl.name
  try: raw = render(tpl.nameExpr, vars, { strict:false })
  catch: return tpl.name
  s = sanitizeEnvName(raw)
  return s || tpl.name

sanitizeEnvName(s):
  s = s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '')
  return ENV_NAME_RE.test(s) ? s : ''   // 首字符须字母数字
```
名字保持 ASCII；撞名仍由 `resolveEnvName` 处理（覆盖/改名）。

### 10.9 `cce template show` 树状展示

`showTemplate` 改为：标题 + 描述 + docs + **env 模板**（原样打印含 `${}` 的值）+ **inputs 树**：
- `env`/`var`：`• NAME` + 描述（var 标注「变量」）。
- `const`：`• 固定: k=v …`（可略）。
- `select`：`◆ <描述>` 下缩进列 `- <label> (name)`，option 的子 inputs 再缩进递归。
末尾 `用 cce add <name> 从它创建一个 env`。

### 10.10 源 URL 版本变量（见 §9，可与结构分两步落地）

- 加常量 `TEMPLATE_SCHEMA_VERSION`（本次为 `2`）。
- `REMOTE_SOURCES` 改成含 `builtin.v${version}.json`；拉取前 `substituteUrlVars(url)` 把 `${version}` 替换为该常量；白名单外变量在 `cce template url` 设置时报错。
- 缓存/ETag 以替换后 URL 为键；`cce template` 状态显示替换后 URL。
- 仓库托管 `templates/builtin.v2.json`；保留冻结的 `builtin.json` 给老客户端。
> 注：结构引擎（10.1–10.9）可先落地，URL 版本化属独立小步，按需拆 PR。

### 10.11 i18n 新增键（zh-CN / en，文案最终由实现者定）

- `add.badSet`：`--set` 需 `key=value`。
- `add.missingField`：非交互缺字段 `{name}`。
- `add.missingSelect`：非交互缺选择 `{name}`，可选值 `{valid}`。
- `add.invalidOption`：`{name}` 无此选项 `{value}`，可选 `{valid}`。
- `add.unresolvedVar`：模板 env 引用了未定义变量 `{var}`。
- `add.fieldRequired`（已存在，复用）。
- `template.showInputs` / `template.showSelect` / `template.showField` 等树状展示标签。
- 复用：`add.created`、`add.docsHint`、`add.templateNotFound`、`add.setDefaultPrompt`、`cli.cancelled` 等。

### 10.12 附录：`builtin.v2.json`（现有 5 模板的 v2 版）

```jsonc
{
  "deepseek": {
    "description": { "en": "DeepSeek (Claude-compatible API)", "zh-CN": "DeepSeek（兼容 Claude 接口）" },
    "docs": "https://api-docs.deepseek.com/zh-cn/quick_start/agent_integrations/claude_code",
    "env": {
      "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
      "ANTHROPIC_MODEL": "deepseek-v4-pro",
      "ANTHROPIC_DEFAULT_OPUS_MODEL": "deepseek-v4-pro",
      "ANTHROPIC_DEFAULT_SONNET_MODEL": "deepseek-v4-pro",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL": "deepseek-v4-flash",
      "CLAUDE_CODE_SUBAGENT_MODEL": "deepseek-v4-flash",
      "CLAUDE_CODE_EFFORT_LEVEL": "max"
    },
    "inputs": [
      { "type": "env", "name": "ANTHROPIC_AUTH_TOKEN",
        "description": { "en": "Your DeepSeek API Key (platform.deepseek.com)", "zh-CN": "你的 DeepSeek API Key（platform.deepseek.com 获取）" } }
    ]
  },
  "kimi": {
    "description": { "en": "Moonshot Kimi K2.5 (Claude-compatible API)", "zh-CN": "月之暗面 Kimi K2.5（兼容 Claude 接口）" },
    "docs": "https://platform.kimi.com/docs/guide/agent-support#%E9%85%8D%E7%BD%AE%E7%8E%AF%E5%A2%83%E5%8F%98%E9%87%8F",
    "env": {
      "ANTHROPIC_BASE_URL": "https://api.moonshot.cn/anthropic",
      "ANTHROPIC_MODEL": "kimi-k2.5",
      "ANTHROPIC_DEFAULT_OPUS_MODEL": "kimi-k2.5",
      "ANTHROPIC_DEFAULT_SONNET_MODEL": "kimi-k2.5",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL": "kimi-k2.5",
      "CLAUDE_CODE_SUBAGENT_MODEL": "kimi-k2.5",
      "ENABLE_TOOL_SEARCH": "false"
    },
    "inputs": [
      { "type": "env", "name": "ANTHROPIC_AUTH_TOKEN",
        "description": { "en": "Your Moonshot API Key (platform.moonshot.cn)", "zh-CN": "你的 Moonshot API Key（platform.moonshot.cn 获取）" } }
    ]
  },
  "mimo": {
    "description": { "en": "Xiaomi MiMo (Claude-compatible API)", "zh-CN": "小米 MiMo（兼容 Claude 接口）" },
    "docs": "https://mimo.mi.com/docs/zh-CN/tokenplan/integration/claudecode",
    "name": "mimo-${plan}",
    "env": {
      "ANTHROPIC_BASE_URL": "${baseUrl}",
      "ANTHROPIC_MODEL": "mimo-v2.5-pro[1m]",
      "ANTHROPIC_DEFAULT_SONNET_MODEL": "mimo-v2.5-pro[1m]",
      "ANTHROPIC_DEFAULT_OPUS_MODEL": "mimo-v2.5-pro[1m]",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL": "mimo-v2.5-pro[1m]"
    },
    "inputs": [
      { "type": "select", "name": "plan", "description": { "en": "Plan", "zh-CN": "套餐" },
        "options": [
          { "name": "payg", "label": { "en": "Pay-as-you-go (sk-…)", "zh-CN": "按量付费（sk-…）" },
            "inputs": [
              { "type": "const", "vars": { "baseUrl": "https://api.xiaomimimo.com/anthropic" } },
              { "type": "env", "name": "ANTHROPIC_AUTH_TOKEN",
                "description": { "en": "Your MiMo API Key (sk-xxxxx)", "zh-CN": "你的小米 MiMo API Key（sk-xxxxx）" } }
            ] },
          { "name": "tp", "label": { "en": "Token Plan subscription (tp-…)", "zh-CN": "Token Plan 订阅（tp-…）" },
            "inputs": [
              { "type": "const", "vars": { "baseUrl": "https://token-plan-cn.xiaomimimo.com/anthropic" } },
              { "type": "env", "name": "ANTHROPIC_AUTH_TOKEN",
                "description": { "en": "Your MiMo Token Plan API Key (tp-xxxxx)", "zh-CN": "你的小米 MiMo Token Plan API Key（tp-xxxxx）" } }
            ] }
        ] }
    ]
  },
  "glm5.2": {
    "description": { "en": "Zhipu GLM-5.2 (Claude-compatible API)", "zh-CN": "智谱 GLM-5.2（兼容 Claude 接口）" },
    "docs": "https://docs.bigmodel.cn/cn/coding-plan/tool/claude",
    "env": {
      "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic",
      "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-5.2[1m]",
      "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-5.2[1m]",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-4.5-air",
      "API_TIMEOUT_MS": "3000000",
      "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
      "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "1000000"
    },
    "inputs": [
      { "type": "env", "name": "ANTHROPIC_AUTH_TOKEN",
        "description": { "en": "Your Zhipu API Key (bigmodel.cn)", "zh-CN": "你的智谱 API Key（bigmodel.cn 获取）" } }
    ]
  }
}
```

> `mimo` 合并了原 `mimo` + `mimo-tp`：选 payg → env 名 `mimo-payg`、`sk-` 提示、按量付费 BASE_URL；选 tp → `mimo-tp`、`tp-` 提示、订阅 BASE_URL。模型版本如需可选，再加一个 `model` select 并把 `${model}` 写进 `env` 的四个 `*_MODEL` 键、`name` 改 `mimo-${plan}-${model}`。

### 10.13 测试清单

- **expr.js 单测**（重点）：`kimi-${plan}${ model ? '-'+model : '' }` 各分支；`==`/`!=`/`!`/括号；`$$` 转义；未定义变量在 `strict:true` 抛错、`strict:false` 得空串；`__proto__`/`constructor` 作变量名只得空串（防原型污染）；超长源拒绝；未闭合字符串/`${` 抛错。
- **归一化容错**：缺 `name` 的 env 叶子被丢；空 `options` 的 select 被丢；坏节点不拖垮整模板。
- **渲染**：env strict 未定义变量 → `TemplateError`；多个 select 顺序无关（先收集后插值）。
- **add 交互**：mimo 选 payg/tp → BASE_URL/Key 提示/默认名正确；深层嵌套 select。
- **add 非交互**：`cce add mimo --set plan=tp --set ANTHROPIC_AUTH_TOKEN=tp-x` 成功；缺字段/坏选项报错并列可选值。
- **默认名**：清洗非法字符；表达式异常退回模板名；撞名走 `resolveEnvName`。
- **回归**：`deepseek`/`glm5.2` 这类单输入模板与旧体验一致；`cce template show` 树状正确；`--from ./templates/builtin.json` 本地可测。
