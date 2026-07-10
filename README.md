# cce — Claude Code 多服务商启动器

<div align="center">

**简体中文** | [English](./README.en.md)

</div>

[![npm version](https://img.shields.io/npm/v/@xiaofuzhou/cce.svg)](https://www.npmjs.com/package/@xiaofuzhou/cce)
[![license](https://img.shields.io/npm/l/@xiaofuzhou/cce.svg)](LICENSE)
[![node](https://img.shields.io/node/v/@xiaofuzhou/cce.svg)](https://nodejs.org)

**一行命令，让 [Claude Code](https://docs.claude.com/en/docs/claude-code) 跑在任意第三方模型上** —— DeepSeek、Kimi、智谱 GLM、Anthropic 官方或自建代理。

cce 把服务商配置（接口地址、API Key、模型）存成带名字的启动配置，启动时只注入到**新拉起的 `claude` 子进程**里 —— 不碰任何全局文件，所以多个终端窗口可以**同时**用不同服务商。

```bash
cce                # 使用默认配置启动 Claude Code
cce -e deepseek    # 这个窗口用 DeepSeek 启动
cce -e kimi        # 另一个窗口同时用 Kimi，互不影响
cce pick           # 或者弹出菜单选一个
```

---

## 30 秒接入第三方 API

```bash
npm install -g @xiaofuzhou/cce   # 要求 Node ≥ 18，claude 在 PATH 中

cce add            # 第一步：选择服务商
                   #     claude   Claude 官方（走本地代理）
                   #     deepseek DeepSeek
                   #   › glm      智谱 GLM
                   #     kimi     Kimi
                   #     mimo     小米 MiMo
                   # 第二步：按模板继续填写（以 GLM 为例）
                   #   粘贴 API Key
                   #   选择模型：GLM-5.2 / GLM-5.1
                   # 最后确认建议的 env 名（如 glm-5.2），并选择是否设为默认
cce                # 用默认 env 启动 Claude Code
```

每个服务商只占一个模板入口；选中后，模板会按需继续询问模型（Kimi / GLM）、套餐（MiMo 按量付费 / Token Plan）、本地代理端口（Claude 官方）和 API Key。接口地址、模型映射等会自动生成，env 名也会根据选择给出建议。也可以用 `cce add deepseek` 跳过服务商菜单；模板从 GitHub 获取并缓存在本地，可用 `cce template` 管理。

不想用模板？`cce edit` 直接编辑配置文件（`~/.claude/cce/config.json`）：

```jsonc
{
  "version": 1,
  "default": "deepseek",
  // 所有 env 共享的环境变量基底
  "env": {
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  },
  // 想每次都跳过 Claude Code 的权限确认？加上这行（全局生效，所有 env 都带）：
  "args": "--permission-mode bypassPermissions",
  "envs": {
    "deepseek": {
      // 也可以只给某个 env 单独加 args（覆盖/追加全局，见下方说明）
      "env": {
        "ANTHROPIC_BASE_URL":   "https://api.deepseek.com/anthropic",
        "ANTHROPIC_AUTH_TOKEN": "sk-xxxxxxxxxxxx",
        "ANTHROPIC_MODEL":      "deepseek-v4-pro"
      }
    }
  }
}
```

### 共享 env 与默认参数

根级 `env` 是所有配置共享的环境变量基底。具体 env 中的同名键会覆盖它；如果某个 env 不需要其中一项，把该键设为 `""` 或 `null` 即可只在该 env 中移除。根级和具体 env 最终合并后，仍然只对本次启动的 `claude` 子进程生效。

`args` 保存传给 `claude` 的默认参数：放在根级对所有 env 生效，放在具体 env 中则只对它生效。启动时可以继续追加参数，也可以丢弃这些默认值只使用本次参数，具体写法见下方的 `cce` 启动选项。

---

## 与 cc-switch 的区别

一句话：[cc-switch](https://github.com/farion1231/cc-switch) 靠**改写全局配置**（`~/.claude/settings.json`）来切换，全局只有一份；cce 在**每次启动的子进程**里注入环境变量，全局配置一字不动。

| | **cce** | cc-switch |
|---|---|---|
| 形态 | 命令行，`npm i -g` 安装 | 图形界面应用 |
| 切换方式 | 启动时注入子进程环境变量 | 改写 `~/.claude/settings.json` |
| 多窗口同时用不同服务商 | ✅ 每个进程独立 | ❌ 全局共享一份 |
| 改动全局配置 | 从不 | 每次切换都改 |
| 可脚本化 / 进 CI | ✅ | ❌ |

两者不冲突，可以共存：cc-switch 管全局默认，cce 按窗口临时覆盖。用 [claude-code-router](https://github.com/musistudio/claude-code-router) 的话，把它配成 cce 的一套 env（`ANTHROPIC_BASE_URL=http://127.0.0.1:3456`）即可按需走路由。

---

## 常用命令

### `cce`：启动 Claude Code

```text
cce [启动选项] [-- Claude 参数...]
```

裸写 `cce` 会使用默认 env 启动 Claude Code；没有默认 env 时，会在交互式终端中弹出选择菜单。

| 启动选项 | 作用 |
|---|---|
| `-e, --env <name>` | 使用指定 env，而不是默认 env |
| `-o, --only` | 丢弃配置中的默认 `args`，只使用本次命令给出的参数 |
| `-c, --continue` | 继续最近一次对话 |
| `-r, --resume [id]` | 恢复对话；可指定会话 ID，也可省略 ID 让 Claude 交互选择 |
| `-n, --name <name>` | 给本次会话设置显示名称 |
| `-m, --merge-mode <mode>` | 临时指定 env 合并模式：`override`、`cce` 或 `claude` |
| `-- <Claude 参数...>` | 把 `--` 后面的参数原样传给 Claude，并追加在配置默认参数之后 |

例如：

```bash
cce -e kimi -c                              # 用 kimi env 继续最近一次对话
cce -e kimi -- --permission-mode default    # 在配置默认参数之后追加 Claude 参数
cce -e kimi -o -- --resume XYZ              # 丢弃配置默认参数，只恢复指定会话
```

`-c`、`-r`、`-n` 可以与 `-o`、`--` 组合使用；`--` 之前只放 cce 自己的启动选项，其他 Claude 参数统一放在 `--` 后面。

### 管理命令

| 命令 | 作用 |
|---|---|
| `cce pick` | 弹出菜单选择 env，选完即启动 |
| `cce add` / `cce remove` | 从模板创建 / 删除 env |
| `cce list` / `cce show <name>` | 列出 env / 查看某个 env 的最终配置 |
| `cce use <name>` / `cce current` | 设置 / 查看默认 env |
| `cce edit` | 直接编辑配置文件 |
| `cce template` | 查看、刷新或配置模板源 |
| `cce update` | 升级 cce 到 npm 最新版 |

其他能力：默认参数管理（全局或按 env）、与 `~/.claude/settings.json` 的三种合并模式（cce 从不改写该文件）、中英双语界面、四种 shell 的 Tab 补全（连 env 名都能补全）、启动时后台自动更新。详见文档：

- **[使用指南](docs/usage.md)** —— 完整配置 schema、合并语义与排错
- **[设计文档](docs/DESIGN.md)** —— 架构与决策记录

---

## 链接

- **npm**：https://www.npmjs.com/package/@xiaofuzhou/cce
- **GitHub**：https://github.com/zhouxiaofu/claude-code-env
- **Issues**：https://github.com/zhouxiaofu/claude-code-env/issues

## 许可证

[MIT](LICENSE)
