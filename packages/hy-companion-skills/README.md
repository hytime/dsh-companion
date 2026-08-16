# hy-companion-skills

hy-companion DSH 技能包，包含 11 个 DSH 技能（`hy-companion`、`hy-companion-chat`、`hy-companion-schedule`、`hy-companion-personality`、`hy-companion-affection`、`hy-companion-memory`、`hy-companion-route`、`hy-companion-daemon`、`hy-companion-buddy`、`hy-companion-statusline`、`hy-companion-uninstall`）。技能源由 [`scripts/sync-skills.mjs`](../../scripts/sync-skills.mjs) 从 `travel-note-go/build/skill/dsh/hy-companion` 同步而来，安装到 `$DSH_HOME/skills`（默认 `~/.dsh/skills`）。

## 用途

把 DSH 技能安装到 DSH 的 skills 目录，供 DSH 会话加载 hy-companion 陪伴技能。

## 安装命令

```bash
hy-companion-install [--dsh-home <dir>] [--force] [--help]
```

- 缺省安装到 `$DSH_HOME/skills`（`$DSH_HOME` 未设置时为 `~/.dsh/skills`）。
- `--dsh-home <dir>`：覆盖 DSH home 目录。
- `--help`：打印用法后退出。

## `--force` 语义

默认幂等：目标目录中已存在的同名技能会被跳过。`--force` 会**先删除**目标同名技能再重新复制，因此会移除旧安装中技能目录里残留的内容（包括旧架构下由该技能携带的 `hyc` 二进制）——新架构下 `hyc` 由独立的 CLI 包提供，本技能包不再内嵌该二进制，使用 `--force` 前请确认 CLI 已单独安装。
