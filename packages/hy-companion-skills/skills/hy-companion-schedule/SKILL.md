---
name: hy-companion-schedule
description: hy-companion 定时陪伴。当用户需要创建、查看、暂停、恢复或删除定时陪伴事件时使用。通过 hyc schedule 管理线上定时事件。
whenToUse: 用户想创建定时陪伴/提醒（如"明天早上提醒我散步"），或查看、暂停、恢复、删除已创建的定时事件时
---

# hy-companion-schedule 定时陪伴

管理线上定时陪伴事件（schedule）。本技能只调用 `hyc schedule` 并解释结果，不自行规划时间逻辑。

## 何时使用

- 用户想创建定时陪伴/提醒（如"明天早上提醒我散步"）。
- 用户想查看、暂停、恢复或删除已创建的定时事件。

## 对应命令

```bash
hyc schedule <子命令> ...
```

常用示例：

```bash
hyc schedule list [--page 1] [--page-size 10]
hyc schedule understand --text "明天早上提醒我散步"
hyc schedule delete --id <id>
hyc schedule enable --id <id>
hyc schedule disable --id <id>
```

## 参数透传规则

- 按用户意图选择子命令，其余参数按原样透传给 `hyc schedule ...`，不臆造 `--id`、`--text` 等值。
- 列表分页使用 `--page` 与 `--page-size`，缺省等价于 `--page 1 --page-size 10`。
- 输出为 JSON，直接呈现 CLI 返回的事件与分页信息。

## 认证失败处理

未登录、Token 过期、网络失败或参数错误时，保留 CLI 的错误边界，并用简短中文说明下一步（例如先运行 `hyc login`）。
