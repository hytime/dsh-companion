---
name: hy-companion-daemon
description: hy-companion 后台守护。当用户需要安装、升级、查看或运行 hy-companion 用户级 daemon 时使用。通过 hyc daemon 管理后台服务。
whenToUse: 用户想安装、升级、查看状态或手动运行 daemon 时
---

# hy-companion-daemon 后台守护

管理用户级 daemon（macOS launchd / Linux systemd --user）。本技能只调用 `hyc daemon` 并解释结果。

## 何时使用

- 用户想安装、升级、查看状态或手动运行 daemon。

## 对应命令

```bash
hyc daemon <子命令> ...
```

常用示例：

```bash
hyc daemon install --start
hyc daemon install --upgrade [--start]
hyc daemon status
hyc daemon run --interval 30s
```

## 参数透传规则

- 按用户意图选择子命令，其余参数按原样透传，不臆造 `--interval` 等值。
- daemon 身份只来自当前 profile JWT；不把密码或凭据放入命令行、plist、systemd unit 或日志。

## 认证失败处理

未登录、Token 过期、网络失败或参数错误时，保留 CLI 的错误边界，并用简短中文说明下一步（例如先运行 `hyc login`）。
