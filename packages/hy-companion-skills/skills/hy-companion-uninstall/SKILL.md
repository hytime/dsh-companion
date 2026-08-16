---
name: hy-companion-uninstall
description: hy-companion 卸载。当用户想卸载 hy-companion skill、CLI 入口、daemon 与 statusline 集成时使用。破坏性操作，执行前必须明确确认。
whenToUse: 用户明确要求卸载 hy-companion、移除 CLI/daemon/statusline 集成，或删除本技能时
---

# hy-companion-uninstall 卸载

卸载 hy-companion 的用户级 daemon、statusline 集成、CLI 入口（`~/.local/bin/hyc`）与 DSH 技能目录。本技能只调用 `hyc uninstall` 并解释结果。

## 何时使用

- 用户明确要求卸载 hy-companion、移除 CLI/daemon/statusline 集成，或删除本技能。

## 对应命令

```bash
hyc uninstall
```

DSH 版卸载脚本（等价的幂等脚本，不依赖登录态）：

```bash
bash build/skill/hy-companion/scripts/uninstall-dsh.sh
```

## 执行前确认（必须）

卸载属于破坏性操作。执行前必须向用户明确确认，例如复述以下影响范围并取得明确同意后再运行：

- 删除用户级 daemon（launchd / systemd --user）与 statusline 集成；
- 删除 CLI 入口 `~/.local/bin/hyc`；
- 删除 DSH 技能目录 `$DSH_HOME/skills/hy-companion` 与 `hy-companion-*`。

保留 `~/.hy-companion` 数据目录与系统凭据（Keychain / Secret Service），不删除账号密码。用户未明确同意前不要执行。

## 参数透传规则

- 用户确认后按原样执行 `hyc uninstall`，不附加额外参数。
- 重复执行幂等：目标已删除时仍返回成功。

## 认证失败处理

卸载不依赖登录态，但如 CLI 报错（权限、文件占用等），保留 CLI 的错误边界，并用简短中文说明下一步。
