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

cce add            # 弹出模板菜单，选择对应的配置（以 DeepSeek 为例）：
                   #   › deepseek  DeepSeek（兼容 Claude 接口）
                   #     kimi      月之暗面 Kimi K2.5
                   #     glm5.2    智谱 GLM-5.2
                   #     mimo      小米 MiMo 按量付费 API
                   #     mimo-tp   小米 MiMo Token Plan 订阅套餐
                   # 然后粘贴你的 API Key（platform.deepseek.com 获取），其余全部预置
cce                # 启动 Claude Code，已经跑在 DeepSeek 上
```

模板里接口地址、模型映射等都已配好，你只需要填 API Key。也可以直接 `cce add deepseek` 跳过菜单；模板从 GitHub 实时获取并本地缓存，可用 `cce template` 管理。

不想用模板？`cce edit` 直接编辑配置文件（`~/.claude/cce/config.json`）：

```jsonc
{
  "version": 1,
  "default": "deepseek",
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

> `args` 里是传给 `claude` 的默认参数，常用的是 `--permission-mode bypassPermissions`（跳过权限确认）。配在顶层＝对所有 env 生效；配在某个 env 里＝只对它生效。启动时还能用 `cce -e deepseek -a "..."` 临时追加。

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

| 命令 | 作用 |
|---|---|
| `cce` | 用默认配置启动 claude |
| `cce -e <name>` | 用指定配置启动 |
| `cce pick` | 弹出菜单选完即启动 |
| `cce add` / `cce remove` | 从模板创建 / 删除配置 |
| `cce list` / `cce use <name>` | 查看配置 / 设默认 |
| `cce -a "--permission-mode bypassPermissions"` | 临时追加 claude 参数 |
| `cce update` | 升级 cce 到 npm 最新版 |

> ⚠ 传给 claude 的参数必须包在 `-a "..."`（追加）或 `-A "..."`（整组覆盖）里，cce 不会转交它不认识的参数。

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
