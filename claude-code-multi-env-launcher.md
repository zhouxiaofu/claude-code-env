# Claude Code 多环境启动器（Windows 11）

> 在 Windows 11 上为不同窗口/会话独立注入不同的 Claude Code 环境变量，实现「一个窗口跑 DeepSeek、另一个跑 Kimi、再一个走 CCR」的并行开发体验。

---

## 1. 背景与目标

### 1.1 痛点

- 同时在多个项目里用 Claude Code，希望不同窗口走不同模型 API（DeepSeek / Kimi / GLM / 官方 / 自建 CCR）。
- 不希望切换时影响其他正在运行的窗口。
- 不希望污染系统级环境变量。

### 1.2 现有 GitHub 工具的局限

| 工具 | 切换粒度 | 能否「不同窗口不同模型」 |
|---|---|---|
| **cc-switch** (GUI) | 全局 `settings.json` | ❌ 切一次影响所有新窗口 |
| **claude-code-router (CCR)** | 全局代理 | ❌ 重启 router 才能切 |
| **cce / cc-switch CLI** | 全局配置文件 | ❌ |

> 截至 2026 年，cc-switch 已有 issue #1754 提出「per-window 独立配置」需求，但尚未实现。

### 1.3 推荐方案

自己写 **PowerShell Profile 函数**，每个函数只修改**当前 shell session** 的 env，零依赖、原生支持每窗口独立。

---

## 2. 快速开始（PowerShell Profile 函数）

### 2.1 创建/编辑 Profile

```powershell
# 查看 profile 路径
$PROFILE

# 如果不存在则创建
if (-not (Test-Path $PROFILE)) {
    New-Item -Path $PROFILE -ItemType File -Force
}

# 用记事本打开编辑
notepad $PROFILE
```

> 💡 推荐使用 PowerShell 7+（`pwsh`），其 `$PROFILE` 路径为：
> `C:\Users\<你>\Documents\PowerShell\Microsoft.PowerShell_profile.ps1`

### 2.2 贴入以下内容

```powershell
# ============ Claude Code 多环境启动器 ============

function cce-deepseek {
    $env:ANTHROPIC_BASE_URL          = "https://api.deepseek.com/anthropic"
    $env:ANTHROPIC_AUTH_TOKEN        = "sk-你的deepseek-key"
    $env:ANTHROPIC_MODEL             = "deepseek-chat"
    $env:ANTHROPIC_SMALL_FAST_MODEL  = "deepseek-chat"
    Write-Host "[Claude Code] -> DeepSeek" -ForegroundColor Cyan
    claude @args
}

function cce-kimi {
    $env:ANTHROPIC_BASE_URL    = "https://api.moonshot.cn/anthropic"
    $env:ANTHROPIC_AUTH_TOKEN  = "sk-你的kimi-key"
    $env:ANTHROPIC_MODEL       = "kimi-k2-0905-preview"
    Write-Host "[Claude Code] -> Kimi" -ForegroundColor Yellow
    claude @args
}

function cce-glm {
    $env:ANTHROPIC_BASE_URL    = "https://open.bigmodel.cn/api/anthropic"
    $env:ANTHROPIC_AUTH_TOKEN  = "你的glm-key"
    $env:ANTHROPIC_MODEL       = "glm-4.6"
    Write-Host "[Claude Code] -> GLM" -ForegroundColor Green
    claude @args
}

function cce-ccr {
    # 走你已经配好的 claude-code-router（默认本地端口 3456）
    $env:ANTHROPIC_BASE_URL    = "http://127.0.0.1:3456"
    $env:ANTHROPIC_AUTH_TOKEN  = "any"
    Write-Host "[Claude Code] -> CCR" -ForegroundColor Magenta
    claude @args
}

function cce-proxy {
    # 走你自己的本地代理 (~/.claude/proxy.js)
    $env:ANTHROPIC_BASE_URL    = "http://127.0.0.1:8080"
    $env:ANTHROPIC_AUTH_TOKEN  = "sk-你的真实-key"
    Write-Host "[Claude Code] -> Local Proxy" -ForegroundColor Blue
    claude @args
}

function cce-official {
    # 用 ~/.claude 的官方配置，清掉所有覆盖
    Remove-Item Env:ANTHROPIC_BASE_URL          -ErrorAction SilentlyContinue
    Remove-Item Env:ANTHROPIC_AUTH_TOKEN        -ErrorAction SilentlyContinue
    Remove-Item Env:ANTHROPIC_MODEL             -ErrorAction SilentlyContinue
    Remove-Item Env:ANTHROPIC_SMALL_FAST_MODEL  -ErrorAction SilentlyContinue
    Write-Host "[Claude Code] -> Official" -ForegroundColor White
    claude @args
}

# 查看当前窗口 Claude 相关 env
function cce-env {
    Get-ChildItem Env: | Where-Object Name -Match '^ANTHROPIC_|^CLAUDE_' | Format-Table -AutoSize
}
```

### 2.3 重载 Profile

```powershell
. $PROFILE
```

### 2.4 使用

```powershell
# 窗口 A
cd D:\code\MagNetOS
cce-deepseek

# 窗口 B（新开标签页）
cd D:\code\flutter-pwa
cce-kimi

# 窗口 C
cce-ccr

# 查看当前窗口走的什么
cce-env
```

✅ 三个窗口的 env 完全独立，互不影响。
✅ 退出 `claude` 后 env 仍在当前 shell（继续用），但**绝不污染**其他窗口或系统。

---

## 3. 进阶方案：JSON 集中管理

模型多了不想写一堆函数，可改为「单一入口 + 配置文件」。

### 3.1 配置文件 `~/.claude/providers.json`

```json
{
  "deepseek": {
    "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "sk-xxx",
    "ANTHROPIC_MODEL": "deepseek-chat",
    "ANTHROPIC_SMALL_FAST_MODEL": "deepseek-chat"
  },
  "kimi": {
    "ANTHROPIC_BASE_URL": "https://api.moonshot.cn/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "sk-xxx",
    "ANTHROPIC_MODEL": "kimi-k2-0905-preview"
  },
  "glm": {
    "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "xxx",
    "ANTHROPIC_MODEL": "glm-4.6"
  },
  "ccr": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:3456",
    "ANTHROPIC_AUTH_TOKEN": "any"
  }
}
```

### 3.2 Profile 函数

```powershell
function cce {
    param(
        [Parameter(Mandatory, Position=0)]
        [string]$Provider
    )

    $cfgPath = "$HOME\.claude\providers.json"
    if (-not (Test-Path $cfgPath)) {
        Write-Error "未找到配置文件: $cfgPath"
        return
    }

    $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
    if (-not $cfg.$Provider) {
        $available = ($cfg.PSObject.Properties.Name) -join ", "
        Write-Error "未知 provider: $Provider`n可用: $available"
        return
    }

    # 先清空旧的覆盖，避免残留
    @('ANTHROPIC_BASE_URL','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_MODEL','ANTHROPIC_SMALL_FAST_MODEL') |
        ForEach-Object { Remove-Item "Env:$_" -ErrorAction SilentlyContinue }

    # 注入新 env
    $cfg.$Provider.PSObject.Properties | ForEach-Object {
        Set-Item -Path "Env:$($_.Name)" -Value $_.Value
    }

    Write-Host "[Claude Code] -> $Provider" -ForegroundColor Cyan
    claude @args[1..($args.Length)]
}

# Tab 补全：cce <Tab> 自动列出可用 provider
Register-ArgumentCompleter -CommandName cce -ParameterName Provider -ScriptBlock {
    param($cmd, $param, $word)
    $cfg = Get-Content "$HOME\.claude\providers.json" -Raw | ConvertFrom-Json
    $cfg.PSObject.Properties.Name | Where-Object { $_ -like "$word*" }
}
```

### 3.3 用法

```powershell
cce deepseek
cce kimi
cce ccr

# 支持 Tab 补全
cce <Tab>
```

---

## 4. 锦上添花：Windows Terminal 一键开特定环境

在 Windows Terminal `settings.json` 的 `profiles.list` 里追加：

```json
{
    "name": "Claude · DeepSeek",
    "commandline": "pwsh.exe -NoExit -Command \". $PROFILE; cce-deepseek\"",
    "startingDirectory": "D:\\code\\MagNetOS",
    "icon": "🤖",
    "tabTitle": "CC-DeepSeek"
},
{
    "name": "Claude · Kimi",
    "commandline": "pwsh.exe -NoExit -Command \". $PROFILE; cce-kimi\"",
    "startingDirectory": "D:\\code\\flutter-pwa",
    "icon": "🌙",
    "tabTitle": "CC-Kimi"
},
{
    "name": "Claude · CCR",
    "commandline": "pwsh.exe -NoExit -Command \". $PROFILE; cce-ccr\"",
    "icon": "🔀",
    "tabTitle": "CC-CCR"
}
```

之后在 Windows Terminal 下拉新建标签页时，直接选「Claude · DeepSeek」即可。

---

## 5. WSL / Bash 版本（可选）

如果你也想在 WSL（Ubuntu）下使用，在 `~/.bashrc` 或 `~/.zshrc` 追加：

```bash
# ============ Claude Code 多环境启动器 ============

cce-deepseek() {
    export ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic"
    export ANTHROPIC_AUTH_TOKEN="sk-你的deepseek-key"
    export ANTHROPIC_MODEL="deepseek-chat"
    export ANTHROPIC_SMALL_FAST_MODEL="deepseek-chat"
    echo -e "\033[36m[Claude Code] -> DeepSeek\033[0m"
    claude "$@"
}

cce-kimi() {
    export ANTHROPIC_BASE_URL="https://api.moonshot.cn/anthropic"
    export ANTHROPIC_AUTH_TOKEN="sk-你的kimi-key"
    export ANTHROPIC_MODEL="kimi-k2-0905-preview"
    echo -e "\033[33m[Claude Code] -> Kimi\033[0m"
    claude "$@"
}

cce-ccr() {
    export ANTHROPIC_BASE_URL="http://127.0.0.1:3456"
    export ANTHROPIC_AUTH_TOKEN="any"
    echo -e "\033[35m[Claude Code] -> CCR\033[0m"
    claude "$@"
}

cce-official() {
    unset ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_MODEL ANTHROPIC_SMALL_FAST_MODEL
    echo -e "\033[37m[Claude Code] -> Official\033[0m"
    claude "$@"
}

cce-env() {
    env | grep -E '^(ANTHROPIC_|CLAUDE_)' | sort
}
```

重载：

```bash
source ~/.bashrc   # 或 source ~/.zshrc
```

> ⚠️ WSL 中如果需要走 Windows 宿主的代理（如本地 CCR），用 `ip route | grep default | awk '{print $3}'` 获取宿主 IP，替换 `127.0.0.1`。

---

## 6. 安全建议

### 6.1 API Key 不要直接写在 Profile 里

把 Key 存到独立文件，profile 加载时读取：

```powershell
# ~/.claude/.secrets.ps1 （加入 .gitignore）
$global:DEEPSEEK_KEY = "sk-xxx"
$global:KIMI_KEY     = "sk-xxx"
$global:GLM_KEY      = "xxx"
```

```powershell
# $PROFILE 顶部
if (Test-Path "$HOME\.claude\.secrets.ps1") {
    . "$HOME\.claude\.secrets.ps1"
}

function cce-deepseek {
    $env:ANTHROPIC_BASE_URL   = "https://api.deepseek.com/anthropic"
    $env:ANTHROPIC_AUTH_TOKEN = $DEEPSEEK_KEY
    $env:ANTHROPIC_MODEL      = "deepseek-chat"
    claude @args
}
```

### 6.2 文件权限

```powershell
# 限制 secrets 文件只有当前用户能读
$acl = Get-Acl "$HOME\.claude\.secrets.ps1"
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    "$env:USERNAME","FullControl","Allow")
$acl.AddAccessRule($rule)
Set-Acl "$HOME\.claude\.secrets.ps1" $acl
```

---

## 7. 排错速查

| 现象 | 检查项 |
|---|---|
| `claude: command not found` | 确认 Claude Code 已装、`PATH` 包含其安装目录（Native Installer 默认是 `%USERPROFILE%\.local\bin`） |
| 切换后还是走老模型 | 当前 shell 里 `cce-env` 看一眼 env，必要时手动 `Remove-Item Env:ANTHROPIC_BASE_URL` |
| `401 Unauthorized` | `ANTHROPIC_AUTH_TOKEN` 没填或填错；DeepSeek 用 `ANTHROPIC_AUTH_TOKEN`，不是 `ANTHROPIC_API_KEY` |
| CCR 路由不生效 | 确认 CCR 在 3456 端口运行（`netstat -ano | findstr 3456`），且 `ANTHROPIC_BASE_URL` 指向 `http://127.0.0.1:3456` |
| Profile 改了没生效 | 重新执行 `. $PROFILE`，或关闭重开窗口 |
| 报 `reasoning_content missing` | DeepSeek-V4 与部分中转的已知兼容问题，临时换 `deepseek-chat`（非 reasoner）规避 |

---

## 8. 与其他工具的关系

```
┌─────────────────────────────────────────────────┐
│  本方案 (PowerShell Profile)                     │
│  ✅ 每窗口独立 env，零依赖                        │
│  ❌ 不提供 GUI                                   │
└─────────────────────────────────────────────────┘
                  │
                  ├──── 可叠加 ────►  claude-code-router (CCR)
                  │                    用 cce-ccr 走本地路由
                  │
                  └──── 可叠加 ────►  ~/.claude/proxy.js
                                       用 cce-proxy 走 user_id 清洗代理

┌─────────────────────────────────────────────────┐
│  cc-switch (GUI)                                 │
│  ✅ 图形化、内置多家预设                          │
│  ❌ 全局生效，不适合多窗口并行                    │
│  建议：作为「全局默认」备用，与本方案不冲突        │
└─────────────────────────────────────────────────┘
```

---

## 9. 参考链接

- Claude Code 环境变量文档：https://docs.claude.com/en/docs/claude-code/settings#environment-variables
- cc-switch（GUI 全局切换）：https://github.com/farion1231/cc-switch
- claude-code-router（CCR 多模型路由）：https://github.com/musistudio/claude-code-router
- 相关 issue（cc-switch per-window 需求）：https://github.com/farion1231/cc-switch/issues/1754

---

**最后更新**：2026-05-23
