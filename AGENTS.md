# AGENTS.md —— 项目记忆与 AI 工作流约定

本文件供 AI 助手与开发者快速了解本仓库的关键信息与协作约定。详细流程见 [README.md](./README.md)。

## 项目概览

本仓库 `dsh-companion` 是「hy-companion 陪伴系统」的独立发布仓库，把 3 个可发布单元放在一个 pnpm workspace 里统一构建、验证与发布：

| 包 | 说明 |
| --- | --- |
| `@hytime/dsh-companion` | 前端插件（dual-face Cordis 插件，鲸鱼悬浮窗，展示 Skill/CLI 状态） |
| `@hytime/hy-companion-skills` | DSH 技能包（11 个技能，安装到 `$DSH_HOME/skills`） |
| `@hytime/hyc` + `hyc-darwin-arm64` | CLI 入口 + 平台二进制包（当前仅 darwin-arm64） |

依赖链：前端插件 ← DSH 技能 ← hyc CLI。前端插件只接收可序列化的 Skill/CLI 状态，不直接访问 DSH Host/Client Service、credentials 或 live runtime 对象。

## 目录结构

```text
dsh-companion/
├── package.json              # workspace 根，仅 devDependencies 与根级测试
├── pnpm-workspace.yaml       # packages/*
├── scripts/                  # rename / sync-skills / build-binaries / copy-* / watch
├── test/                     # 根级测试（rename / build-binaries）
└── packages/
    ├── dsh-companion/        # 前端插件（lib/ 产物 + cordis.patch.yml + public/ 鲸鱼帧）
    ├── hy-companion-skills/  # DSH 技能包
    ├── hyc/                  # CLI 入口（bin/hyc.mjs）
    └── hyc-darwin-arm64/     # hyc 平台二进制包
```

## 关键约定（红线）

1. **禁用 `link:` 目录安装**：DSH profile 里禁止用目录链接安装插件，统一走「build → pack → 装 tarball → 重启 DSH」循环。原因：双实例（两个 React / Cordis）、构建时 `rm -rf lib` 冲突、绝对路径不可复现。
2. **安装顺序不可颠倒**：先装 hyc CLI → 再装 DSH 技能 → 最后装前端插件，任一前置缺失先补齐，不得跳步。插件加载时会自动检查并安装缺失前置（hyc CLI / 技能），可作兜底；仍建议按序手动安装，尽早暴露依赖问题。
3. **scope 已定型 `@hytime`**：包名统一为 `@hytime/*`；仅当需要整体更换 scope 时才运行 `node scripts/rename-package.mjs <新scope>` 全局替换。
4. **4 个子包均可直接发布**：均已声明 `publishConfig.access: public` 与 `license: MIT`；发布前需补 `repository` / `author`，并确认鲸鱼帧资源版权。
5. **二进制构建依赖外部仓库**：`sync-skills.mjs` 与 `build-binaries.mjs` 需要 `TRAVEL_NOTE_GO` 指向 `travel-note-go` 仓库，默认 `/Volumes/hydisk/vsProject/travel-note-go`。
6. **git worktree 管理**：功能开发使用隔离 worktree（`.worktrees/<分支名>`）；同时存在的 worktree 最多 4 个；工作完成合并回主线后必须删除对应 worktree。

## 环境注意事项

- npm / pnpm 账号 `hytime` 已登录 npmjs.org 与私有 registry（`172.20.1.43:13100`，token 位于 `~/.npmrc`）。
- 已知问题：`~/.npm` 缓存目录含 root 所有文件，npm / pnpm 会报 EPERM。修复命令：`sudo chown -R 501:20 ~/.npm`；临时绕过可用 `--cache /tmp/<dir>`。
- Node.js >= 20，pnpm >= 9（声明 `pnpm@9.15.0`）。
- 插件需在装有 DSH 服务（宿主注入 `window.__DSH_BOOT__`）的环境下运行。

## AI 工作流约定（superpowers）

任何 AI 助手在本仓库工作时遵循以下规则：

- **动手前先查技能**：任何响应或操作（包括澄清问题、探索代码库）之前，先判断是否有适用技能；哪怕只有 1% 的可能，也必须调用该技能。调用后发现不适用可以不用。
- **流程技能优先**：「构建 X」→ 先 brainstorming，再用实现技能；「修复 bug」→ 先 systematic-debugging，再用领域技能。
- **红线**：不得以「这很简单」「先看看再说」「先收集信息」「我记得这个技能」等理由跳过技能检查。
- **中文场景路由**：中文代码审查 → chinese-code-review；Gitee/Coding/极狐 GitLab → chinese-git-workflow；中文文档/README → chinese-documentation；中文 commit message → chinese-commit-conventions。
- **优先级**：用户指令 > 技能 > 默认行为；仅当人类明确要求跳过时，才可跳过技能工作流或指令。

## 命令速查

```bash
pnpm install                                    # 安装全部 workspace 依赖
pnpm -r run typecheck                           # 类型检查（仅插件包有此 script）
pnpm -r run test                                # 包级测试（插件 98 + 技能 3 + CLI 1）
pnpm exec vitest run --config vitest.packages.config.ts   # 根级 + 技能 + CLI 测试
pnpm -r run build                               # 构建（插件产物）
pnpm -r run pack                                # 打包全部可发布包
node scripts/rename-package.mjs <新scope>      # 换 scope 时全局替换 @hytime→@<新scope>
TRAVEL_NOTE_GO=<路径> node scripts/sync-skills.mjs       # 从 travel-note-go 同步技能
TRAVEL_NOTE_GO=<路径> node scripts/build-binaries.mjs    # 交叉编译 hyc 二进制
```

## 详细文档

- 安装 / 发布 / 开发全流程：[README.md](./README.md)
