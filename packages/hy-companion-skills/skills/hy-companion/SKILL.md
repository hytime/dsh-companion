---
name: hy-companion
description: AI 旅伴陪伴体验。当用户需要陪伴对话、主动关怀、定时陪伴、旅行路线建议时使用。路由到 hy-companion-chat / -schedule / -personality / -affection / -memory / -route / -daemon / -buddy / -statusline / -uninstall 技能。
whenToUse: 用户需要与 AI 旅伴对话、管理定时陪伴、查看人格或好感度、查询会话记忆、获取路线建议，或安装/卸载 hyc 与 DSH 技能时
---

# hy-companion 旅伴（DSH 入口）

这是 DSH 的 `hy-companion` 兼容入口，负责把用户意图路由到对应的 `hy-companion-*` 技能。优先使用具体的 `hy-companion-*` 技能；只有用户直接触发本入口时才在此路由。

## 路由规则

根据用户输入识别目标命令，并委托给对应技能：

| 用户意图 | 技能 | CLI 映射 |
| --- | --- | --- |
| 陪伴对话、闲聊 | `hy-companion-chat` | `hyc chat --msg "<输入>"` |
| 定时陪伴、提醒 | `hy-companion-schedule` | `hyc schedule ...` |
| 人格查看/修改 | `hy-companion-personality` | `hyc personality ...` |
| 亲密度/情感状态 | `hy-companion-affection` | `hyc affection` |
| 会话记忆 | `hy-companion-memory` | `hyc memory ...` |
| 路线建议 | `hy-companion-route` | `hyc route ...` |
| 后台 daemon | `hy-companion-daemon` | `hyc daemon ...` |
| 旅伴消息/回复 | `hy-companion-buddy` | `hyc buddy ...` |
| 状态栏 | `hy-companion-statusline` | `hyc statusline ...` |
| 卸载 | `hy-companion-uninstall` | `hyc uninstall`（需确认） |

无法识别时，给出上方命令列表和用法，不编造一段线上旅伴回复。

## 对话委托

用户在本入口发起的普通对话，不在这里直接生成线上人格回复，而应委托 `hy-companion-chat`，即执行：

```bash
hyc chat --msg "$ARGUMENTS"
```

回复由当前 profile 的线上人格、对话上下文和 companion 服务产生。本入口只负责转发和解释结果，不代替线上回复。

## CLI 速查

```bash
hyc chat --msg "你好"
hyc chat --msg "你好" --stream
hyc schedule list [--page 1] [--page-size 10]
hyc schedule understand --text "明天早上提醒我散步"
hyc schedule delete --id <id>
hyc schedule enable --id <id>
hyc schedule disable --id <id>
hyc personality get
hyc personality save --tags "温柔,俏皮" --name "小旅伴"
hyc affection
hyc memory list [--page 1] [--page-size 10]
hyc route --from lat,lng --to lat,lng --mode driving

# buddy daemon 与本地提醒
hyc daemon install --start
hyc daemon status
hyc daemon run --interval 30s
hyc buddy status
hyc buddy list [--all] [--page 1] [--page-size 10]
hyc buddy ack --id <id>
hyc buddy reply --id <id> --msg "谢谢你"
hyc buddy clear
hyc buddy clear --unread

# statusline
hyc statusline install --target all
hyc statusline status
hyc statusline render

# 卸载
hyc uninstall
```

首次使用先运行 `hyc login` 登录线上 server 并保存 JWT（注册用 `hyc register`）。daemon 身份只来自当前 profile JWT，不读取或持久化 `HYC_ACCOUNT`。CLI 默认输出 JSON；`chat --stream` 输出 JSON lines。

## 安装与卸载（DSH）

DSH 版技能与 CLI 由仓库脚本安装到 DSH 发现根：

```bash
# 安装（默认同步 daemon；--no-daemon 跳过）
bash build/skill/install-dsh.sh [--no-daemon] [--dsh-home <dir>]

# 卸载（保留 ~/.hy-companion 与系统凭据）
bash build/skill/hy-companion/scripts/uninstall-dsh.sh
```

安装后技能位于 `$DSH_HOME/skills/`（默认 `$HOME/.dsh/skills/`），CLI 入口为 `~/.local/bin/hyc`（符号链接指向 `$DSH_HOME/skills/hy-companion/scripts/hyc`）。详细说明见 `docs/hy-companion-dsh-install.md`。

### 认证边界

CLI 使用线上账号 JWT 标识身份：

```bash
hyc login
hyc register --nickname "小旅伴"
hyc logout
```

`hyc login` / `hyc register` 交互式登录或注册并保存当前 profile 的 JWT，`hyc logout` 清除 JWT。注册昵称仅用于展示，不参与账号身份。daemon 使用当前 profile JWT 调用线上 server API，JWT 按 API profile 隔离保存到系统 Keychain / Linux Secret Service，与本地投影数据相互独立。不要把密码放入命令行、服务定义或日志。

### 分页

`schedule list`、`memory list`、`buddy list` 三个列表命令支持统一分页参数：`--page`（默认 1）、`--page-size`（默认 10，范围 1–100）。缺省等价于 `--page 1 --page-size 10`，返回最新 10 条；不存在的页返回空 `items` 但保留 `total` 与 `total_pages`。输出为完整分页 `data` 对象。

### 卸载

`hyc uninstall` 委托执行卸载脚本。卸载范围：用户级 daemon、statusline 集成、CLI 入口（`~/.local/bin/hyc`）与 DSH 技能目录 `$DSH_HOME/skills/hy-companion*`。保留 `~/.hy-companion` 数据目录与系统凭据，不删除账号密码。重复执行幂等；重装只需重新运行 `bash build/skill/install-dsh.sh`，之后在已登录状态下按需执行 `hyc daemon install --upgrade --start` 同步服务。

## 参考文档

按需读取本技能目录下的相对资源：

- `reference/companion-persona.md`：人设与对话风格
- `reference/proactive-schedule.md`：主动陪伴和定时事件
- `reference/memory-rules.md`：会话记忆
- `reference/safety.md`：安全边界
