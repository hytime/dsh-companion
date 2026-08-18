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

## DSH Companion 源码边界

双端入口遵循 TypeScript/package 构建规则：

```text
packages/dsh-companion/src/
├── host/
│   ├── index.ts                    # Host DSH 插件入口
│   ├── runtime.ts                  # Host 生命周期装配
│   ├── remote/
│   │   ├── service.ts              # Typert Remote API
│   │   ├── handlers.ts             # RPC handler 适配
│   │   └── credentials.ts          # PTY 登录/注册
│   ├── status/
│   │   ├── state-machine.ts        # 状态转换
│   │   ├── narrator.ts              # LLM 状态文案
│   │   ├── fallback-text.ts         # 固定兜底文案
│   │   └── event-bridge.ts          # Cordis 事件桥接
│   ├── transport/
│   │   ├── sse-publisher.ts        # SSE 广播
│   │   └── routes.ts               # HTTP/SSE/asset 路由
│   ├── schedules/timer.ts          # buddy/reply 周期任务
│   └── prerequisites/self-heal.ts  # 前置依赖自愈
├── client/
│   ├── index.tsx                   # Client DSH 插件入口
│   ├── runtime.tsx                 # Client 生命周期装配
│   ├── slots/
│   │   ├── overlay.tsx             # shell.overlay
│   │   └── settings-section.tsx    # settings.section
│   └── stream/
│       ├── event-stream.ts         # EventSource/fallback
│       ├── buddy-gate.ts           # 断线 buddy 通道守卫
│       └── status-parser.ts        # status 载荷解析
├── contracts/                      # 可序列化共享契约；状态映射唯一来源
├── hooks/                          # 可复用 React hooks，不放 widget JSX
├── utils/                          # 无副作用公共工具（含 widget-position）
└── components/                     # React 展示组件
```

边界规则：

- `host/index.ts` 和 `client/index.tsx` 只导出插件元数据并调用 runtime 装配函数，不实现 Remote、SSE、状态或 UI 业务。
- `host/runtime.ts` 和 `client/runtime.tsx` 只负责生命周期与依赖装配；`plugin.ts`/`plugin.tsx` 仅保留兼容 re-export，不作为业务入口。
- Remote、状态机、事件桥接、SSE、HTTP 路由、定时器、slot、React 组件和公共工具分别保持单一职责，不跨目录持有其他领域的隐式状态。
- `contracts/companion-status.ts` 统一维护 `SkillStatus`、`CompanionEmotion`、状态 fallback、emotion/frame 映射和 frame 列表；禁止在 Host、Client 或组件中复制映射表。
- 单个业务实现文件原则上不超过 250 行；超过后必须继续按职责拆分。只有纯类型声明、静态配置和测试夹具可以在有明确理由时超过，并在 `docs/DEVELOPMENT.md` 说明。
- Client 只接收可序列化状态和 Remote 结果，不直接访问 Host Service、credentials、Session 或 live runtime 对象。
- 分阶段功能开发必须先完成阶段一的结构整理和文档更新；阶段一通过代码 review 后必须合并提交，再按 tarball 流程安装到 DSH profile，完成非 symlink、版本、GUI 和 bundle 检查并重启验证，全部通过后才允许开始阶段二。


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

## DSH 插件更新与验收流程

插件更新必须使用「构建 → 打包 tarball → `dsh` 删除旧包 → `dsh` 安装 tarball → 重启 → 验证」流程，禁止使用 `link:` 目录安装。

当前环境没有独立 `dsh` 可执行文件时，从 `/Volumes/hydisk/deepseek-harness` 使用 `pnpm dsh`，它就是 DSH CLI 入口：

```bash
# 1. 删除 profile 中的旧插件
cd /Volumes/hydisk/deepseek-harness
pnpm dsh plugin --profile web remove @hytime/dsh-companion

# 2. 在当前代码 worktree 构建并打包
cd <dsh-companion-worktree>/packages/dsh-companion
pnpm run build
rm -rf /tmp/dsh-companion-packs
mkdir -p /tmp/dsh-companion-packs
pnpm pack --pack-destination /tmp/dsh-companion-packs

# 3. 用 dsh 安装 tarball
cd /Volumes/hydisk/deepseek-harness
pnpm dsh plugin --profile web add \
  /tmp/dsh-companion-packs/hytime-dsh-companion-<version>.tgz

# 4. 停止已有 dsh web 后，用同一命令重启
pnpm run dsh web
```

验收至少确认：

```bash
# profile 依赖必须指向 tarball，不能是 link 目录
cat "$HOME/.dsh/profiles/web/package.json"
test ! -L "$HOME/.dsh/profiles/web/node_modules/@hytime/dsh-companion"
node -p "require('$HOME/.dsh/profiles/web/node_modules/@hytime/dsh-companion/package.json').version"

# GUI 入口和插件 bundle 可访问
curl -fsS http://127.0.0.1:3080/
curl -fsS http://127.0.0.1:3080/plugins/@hytime/dsh-companion/client.js
```

页面登录/注册必须通过 DSH 的 `subprocess.spawnTerminal` PTY 执行 `hyc login/register`。不要恢复在 RPC socket/pipe 输入上调用 macOS `script` 的实现，否则会出现 `tcgetattr/ioctl: Operation not supported on socket`。

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

- 用户使用说明：[README.md](./README.md)；开发 / 验证 / 发布全流程：[docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)
