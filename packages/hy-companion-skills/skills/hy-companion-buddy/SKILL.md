---
name: hy-companion-buddy
description: hy-companion 旅伴消息。当用户需要查看、确认或回复旅伴推送的提醒与消息时使用。通过 hyc buddy 管理线上提醒与回复。
whenToUse: 用户想查看未读提醒、确认提醒已读，或回复旅伴推送的消息时
---

# hy-companion-buddy 旅伴消息

查看、确认和回复线上旅伴推送的提醒与消息。本技能只调用 `hyc buddy` 并解释结果。

## 何时使用

- 用户想查看未读提醒、确认提醒已读，或回复旅伴推送的消息。

## 对应命令

```bash
hyc buddy <子命令> ...
```

常用示例：

```bash
hyc buddy status
hyc buddy list [--all] [--page 1] [--page-size 10]
hyc buddy ack --id <id>
hyc buddy reply --id <id> --msg "谢谢你"
hyc buddy clear [--unread]
```

## 参数透传规则

- 按用户意图选择子命令，其余参数按原样透传，不臆造 `--id`、`--msg` 等值。
- 列表分页使用 `--page` 与 `--page-size`，缺省等价于 `--page 1 --page-size 10`；`--all` 仅为兼容参数，不影响分页。
- 回复消息会进入线上对话记录；未提供消息内容时先向用户确认，不发送空消息。

## 认证失败处理

未登录、Token 过期、网络失败或参数错误时，保留 CLI 的错误边界，并用简短中文说明下一步（例如先运行 `hyc login`）。
