---
name: hy-companion-memory
description: hy-companion 会话记忆。当用户想查看旅伴记住的内容、搜索记忆或管理会话记忆时使用。通过 hyc memory 读写线上记忆。
whenToUse: 用户想查看旅伴记住的偏好、事实或历史，或想搜索、清理、管理会话记忆时
---

# hy-companion-memory 会话记忆

查看或管理线上会话记忆。本技能只调用 `hyc memory` 并解释结果。

## 何时使用

- 用户想查看旅伴记住的偏好、事实或历史。
- 用户想搜索、清理或管理会话记忆。

## 对应命令

```bash
hyc memory <子命令> ...
```

常用示例：

```bash
hyc memory list [--page 1] [--page-size 10]
```

## 参数透传规则

- 按用户意图选择子命令，其余参数按原样透传，不臆造关键词或过滤条件。
- 列表分页使用 `--page` 与 `--page-size`，缺省等价于 `--page 1 --page-size 10`。
- 输出为 JSON，直接呈现记忆条目与分页信息。

## 认证失败处理

未登录、Token 过期、网络失败或参数错误时，保留 CLI 的错误边界，并用简短中文说明下一步（例如先运行 `hyc login`）。
