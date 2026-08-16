---
name: hy-companion-statusline
description: hy-companion 状态栏。当用户需要安装、查看或渲染 hy-companion statusline 集成时使用。通过 hyc statusline 管理本地状态栏脚本。
whenToUse: 用户想安装 statusline 集成、查看状态，或手动渲染摘要时
---

# hy-companion-statusline 状态栏

管理本地 statusline 集成。本技能只调用 `hyc statusline` 并解释结果。

## 何时使用

- 用户想安装 statusline 集成、查看状态，或手动渲染摘要。

## 对应命令

```bash
hyc statusline <子命令> ...
```

常用示例：

```bash
hyc statusline install --target all
hyc statusline status
hyc statusline render
```

## 参数透传规则

- 按用户意图选择子命令，其余参数按原样透传。
- statusline 只展示本地快照摘要；不在 statusline 内 ack、回复、联网或调用 AI。

## 认证失败处理

未登录、Token 过期、网络失败或参数错误时，保留 CLI 的错误边界，并用简短中文说明下一步（例如先运行 `hyc login`）。
