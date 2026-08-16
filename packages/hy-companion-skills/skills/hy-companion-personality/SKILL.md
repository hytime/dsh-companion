---
name: hy-companion-personality
description: hy-companion 人格配置。当用户需要查看或修改 AI 旅伴的人设标签、昵称等人格设置时使用。通过 hyc personality 读写线上人格。
whenToUse: 用户想查看当前旅伴人格（标签、昵称），或想保存新的旅伴人格/昵称时
---

# hy-companion-personality 人格配置

查看或修改当前 profile 的线上旅伴人格。本技能只调用 `hyc personality` 并解释结果。

## 何时使用

- 用户想查看当前旅伴人格（标签、昵称）。
- 用户想保存新的旅伴人格或昵称。

## 对应命令

```bash
hyc personality <子命令> ...
```

常用示例：

```bash
hyc personality get
hyc personality save --tags "温柔,俏皮" --name "小旅伴"
```

## 参数透传规则

- 按用户意图选择 `get` 或 `save`，其余参数按原样透传。
- 不臆造 `--tags`、`--name` 内容；用户未给时不补充默认值。
- 输出为 JSON，直接呈现线上人格设置。

## 认证失败处理

未登录、Token 过期、网络失败或参数错误时，保留 CLI 的错误边界，并用简短中文说明下一步（例如先运行 `hyc login`）。
