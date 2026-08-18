# 主 Agent 状态回复气泡实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 `subagent-driven-development`（推荐）或 `executing-plans` 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 先将 DSH Companion 的 Host/Client 入口、Remote、SSE、slot、状态契约和悬浮窗辅助逻辑按单一职责拆分并更新边界文档，再在稳定结构上实现主 Agent 状态回复气泡。

**架构：** 阶段一只做结构整理，不改变运行时行为：Host 使用 `host/index.ts` 作为构建入口，Client 使用 `client/index.tsx` 作为构建入口；Remote、SSE、事件流、slot、拖动和气泡逻辑分别放入独立模块。阶段二使用独立的状态契约、公共工具、Host 状态机、LLM narrator、事件桥接和 Client 状态气泡 hook；两个 index 文件只负责插件装配。

**技术栈：** TypeScript、Cordis、DSH Typert Remote、DSH `ctx.llm.stream`、React hooks、SSE、Vitest、tsdown。

---

## 执行顺序和边界

1. **阶段一：结构整理。** 只移动/拆分现有逻辑、更新构建入口、补结构测试和边界文档；不新增 `statusMessage`、不新增 Host 状态事件、不改变气泡展示。
2. **阶段一硬性门禁。** 阶段一必须完成代码 review、合并提交、tarball 安装、profile 非 symlink 检查、DSH 重启和 GUI/bundle 验证；任一项未通过，都不得开始阶段二。
3. **阶段二：状态气泡。** 只有阶段一硬性门禁全部通过后，才在已合并并验证的结构上新增主 Agent 状态和回复气泡功能。
4. **所有共享状态规则只维护一份。** 状态类型、情绪类型、状态 fallback emotion、emotion 到图片帧、帧列表和合法值都放到 `contracts/companion-status.ts`；Host、Client、React 组件不得复制数组、`switch` 或映射表。
5. **所有复用逻辑独立为公共工具。** JSON 归一化、主 Agent 判断、工具摘要、状态合并、气泡来源选择和位置计算使用无副作用函数；生命周期相关逻辑使用独立 hook/controller，不使用隐式全局状态。
6. **单一职责限制。** `host/index.ts`、`client/index.tsx`、`host/runtime.ts`、`client/runtime.tsx`、`plugin.ts` 兼容入口和 `whale-floating-widget.tsx` 不实现跨领域业务；每个文件只能负责其文件名对应的模块。
7. **文件大小验收。** 单个业务实现文件原则上不超过 250 行；超过 250 行必须继续按职责拆分。只有纯类型声明、静态配置和测试夹具可以在有明确理由时超过该限制，并在开发文档中说明。
---

## 文件边界

### 阶段一创建

- `packages/dsh-companion/src/host/index.ts`：Host DSH 插件构建入口，只导出 `name`、`inject`、`apply`。
- `packages/dsh-companion/src/host/runtime.ts`：Host 生命周期装配，只连接各独立模块，不定义 Remote、路由、定时器或状态规则。
- `packages/dsh-companion/src/host/remote/service.ts`：`CompanionRemote` 类和 @Remote 方法声明，只负责远程 API 面。
- `packages/dsh-companion/src/host/remote/handlers.ts`：配置、认证和 schedule RPC handler 适配。
- `packages/dsh-companion/src/host/remote/credentials.ts`：PTY credential runner 和 login/register 命令适配。
- `packages/dsh-companion/src/host/transport/sse-publisher.ts`：SSE client 集合、广播和 heartbeat。
- `packages/dsh-companion/src/host/transport/routes.ts`：ping、asset、events HTTP 路由注册。
- `packages/dsh-companion/src/host/schedules/timer.ts`：buddy/reply 周期任务及配置间隔重建。
- `packages/dsh-companion/src/host/prerequisites/self-heal.ts`：前置依赖自愈入口和结果日志。
- `packages/dsh-companion/src/client/index.tsx`：Client DSH 插件构建入口，只导出 `name`、`inject`、`apply`。
- `packages/dsh-companion/src/client/index.test.tsx`：Client index 装配和两个 slot 注册测试。
- `packages/dsh-companion/src/client/runtime.tsx`：Client Remote mount、timer 和模块装配。
- `packages/dsh-companion/src/client/slots/overlay.tsx`：`shell.overlay` 注册和鲸鱼 widget 装配。
- `packages/dsh-companion/src/client/slots/settings-section.tsx`：`settings.section` 注册和 SettingsCard 装配。
- `packages/dsh-companion/src/client/stream/buddy-gate.ts`：断线 fallback buddy 通道守卫。
- `packages/dsh-companion/src/client/stream/buddy-gate.test.ts`：buddy 守卫行为测试。
- `packages/dsh-companion/src/client/stream/event-stream.test.ts`：SSE open/error、fallback 去重和卸载清理测试。
- `packages/dsh-companion/src/utils/widget-position.ts`：位置、贴边和 localStorage 纯函数；不访问 React 或 Remote。
- `packages/dsh-companion/src/utils/widget-position.test.ts`：视口边界、非法存储和贴边纯函数测试。
- `packages/dsh-companion/src/hooks/use-widget-drag.ts`：`useWidgetDrag` pointer hook，负责 listener 生命周期、拖动阈值、保存位置和卸载清理。
- `packages/dsh-companion/src/hooks/use-widget-drag.test.ts`：拖动、点击区分和卸载清理测试。
- `packages/dsh-companion/src/hooks/use-reply-bubbles.ts`：buddy/reply 去重、互斥和自动消失 hook；阶段二扩展为状态文案/真实回复优先级。
- `packages/dsh-companion/src/hooks/use-reply-bubbles.test.ts`：气泡 hook 测试。
- `packages/dsh-companion/src/hooks/use-typewriter.ts`：通用打字机 hook。
- `packages/dsh-companion/src/components/affection-meter.tsx`：好感度 meter 展示组件。
- `packages/dsh-companion/src/components/settings-card.tsx`：设置页 React 组件。
- `packages/dsh-companion/src/components/settings-card.test.tsx`：设置页可见行为测试。

### 阶段一修改

- `packages/dsh-companion/src/host/plugin.ts`：改为兼容 re-export，不再承载 Host 业务实现。
- `packages/dsh-companion/src/host/plugin.test.ts`：迁移为 index/runtime/remote 行为测试。
- `packages/dsh-companion/src/client/plugin.tsx`：改为兼容 re-export，不再承载 Client 业务实现。
- `packages/dsh-companion/src/components/whale-floating-widget.tsx`：只保留 props、hook 调用和 JSX 组合。
- `packages/dsh-companion/src/components/whale-floating-widget.test.tsx`：保留行为测试，纯位置/拖动测试迁移到对应工具测试。
- `packages/dsh-companion/tsdown.config.ts`：构建入口改为 Host `lib/types/host/index.js`、Client `lib/types/client/index.js`。
- `docs/DEVELOPMENT.md`：更新目录结构、双端 index 入口、模块职责和开发验证边界。
- `AGENTS.md`：更新仓库记忆中的 Host/Client 分层、公共状态契约、入口和 tarball 验收规则。
- `docs/superpowers/specs/2026-08-17-main-agent-status-bubble-design.md`：补充结构边界和阶段执行顺序，移除“当前暂不执行”旧状态。

### 阶段二创建

- `packages/dsh-companion/src/contracts/companion-status.ts`：状态/情绪唯一契约、合法值、fallback emotion、emotion 到 frame 映射和 frame 列表。
- `packages/dsh-companion/src/contracts/companion-status.test.ts`：公共状态契约测试。
- `packages/dsh-companion/src/utils/status-utils.ts`：状态归一化、主 Agent 判断、工具摘要和状态合并公共工具。
- `packages/dsh-companion/src/utils/status-utils.test.ts`：公共工具测试。
- `packages/dsh-companion/src/host/status/state-machine.ts`：主 Agent phase、传输状态映射、固定兜底、generation 和授权恢复。
- `packages/dsh-companion/src/host/status/state-machine.test.ts`：状态机测试。
- `packages/dsh-companion/src/host/status/narrator.ts`：LLM narrator、严格 JSON 解析、超时和兜底。
- `packages/dsh-companion/src/host/status/narrator.test.ts`：narrator 测试。
- `packages/dsh-companion/src/host/status/fallback-text.ts`：状态 phase 到固定中文文案和 fallback emotion 的纯映射。
- `packages/dsh-companion/src/host/status/event-bridge.ts`：四类 Cordis 事件监听、主 Agent 过滤和状态机连接。
- `packages/dsh-companion/src/host/status/event-bridge.test.ts`：事件桥接测试。
- `packages/dsh-companion/src/components/frame.ts`：公共 emotion/frame 契约到组件资源 URL 的适配。
- `packages/dsh-companion/src/client/stream/status-parser.ts`：status SSE 载荷解析。
- `packages/dsh-companion/src/client/stream/status-parser.test.ts`：SSE 解析测试。
- `packages/dsh-companion/src/hooks/use-reply-bubbles.ts`：状态说明/真实回复优先级、去重、关闭和超时 hook。
- `packages/dsh-companion/src/hooks/use-reply-bubbles.test.ts`：气泡 hook 测试。

### 阶段二修改

- `packages/dsh-companion/src/contracts/skill-contract.ts`：状态/情绪类型和归一化函数改为从 `companion-status.ts` re-export。
- `packages/dsh-companion/src/components/expression-map.ts`：删除本地映射，调用公共状态契约；只保留 URL 组装。
- `packages/dsh-companion/src/components/expression-map.test.ts`：验证公共映射消费。
- `packages/dsh-companion/src/state/skill-status-source.ts`：调用公共归一化工具并保留订阅 adapter 职责。
- `packages/dsh-companion/src/state/skill-status-source.test.ts`：补充 `statusMessage` 和 emotion fallback 测试。
- `packages/dsh-companion/src/host/status-inference.ts`：复用公共工具，保留 hyc 专用推断并增加主 Agent 工具结果推断。
- `packages/dsh-companion/src/host/status-inference.test.ts`：补充主 Agent 工具生命周期测试。
- `packages/dsh-companion/src/host/runtime.ts`：装配 narrator、状态机、事件桥接和新增 status SSE 字段。
- `packages/dsh-companion/src/host/plugin.test.ts`：补充 Host status SSE 集成测试。
- `packages/dsh-companion/src/client/companion-types.ts`：status 载荷增加可选 `statusMessage`、`emotion`。
- `packages/dsh-companion/src/client/stream/event-stream.ts`：接入 status parser 并向 overlay 传递状态。
- `packages/dsh-companion/src/client/slots/overlay.tsx`：传递状态文案和 emotion 到 widget。
- `packages/dsh-companion/src/components/whale-floating-widget.tsx`：接入 status bubble hook，保留好感度和交互。
- `packages/dsh-companion/src/components/whale-floating-widget.test.tsx`：补充状态气泡和真实回复优先测试。
- `packages/dsh-companion/src/components/whale-status-popover.tsx`：移除视觉状态标题、StateDot 和错误状态面板，保留好感度、称呼和聊天入口。
- `packages/dsh-companion/src/components/whale-status-popover.test.tsx`：验证状态面板移除后其余功能不回归。
- `packages/dsh-companion/src/styles/companion.module.css`：删除状态面板不再使用的 CSS。

---

## 阶段一：结构整理

### 任务 1：拆分 Host 并建立 Host index 入口

- [ ] **步骤 1：先锁定结构不变测试**

为 Host index、Remote 和 SSE publisher 添加测试。测试要求：现有 `CompanionRemote` RPC 方法仍可调用；SSE status/buddy/reply 广播内容不变；asset 路由继续注册全部既有帧；`createCredentialPtyRunner` 行为不变。

- [ ] **步骤 2：确认当前基线**

运行：

```bash
pnpm --filter @hytime/dsh-companion exec vitest run src/host/plugin.test.ts
pnpm --filter @hytime/dsh-companion typecheck
```

预期：现有测试通过，作为结构迁移前基线。

- [ ] **步骤 3：迁移 Host 文件职责**

将现有 `host/plugin.ts` 按职责拆分：

```ts
// host/index.ts：只有插件入口
export const name = 'dsh-companion'
export const inject = ['subprocess']
export async function apply(ctx: PluginCtx) {
  return applyHostRuntime(ctx)
}

// host/plugin.ts：兼容旧内部 import
export { name, inject, apply } from './index'
```

`remote/service.ts` 只保留 Remote 类，`remote/handlers.ts` 只保留 RPC handler，`remote/credentials.ts` 只保留 RPC/PTY credential 适配；`transport/sse-publisher.ts` 只保留 SSE；`transport/routes.ts` 只保留 HTTP 路由；`runtime.ts` 只做装配。所有模块通过参数传递依赖，不从其他模块读取隐式全局变量。

- [ ] **步骤 4：更新 Host 构建入口**

将 `tsdown.config.ts` Host entry 改为：

```ts
{ entry: { index: 'lib/types/host/index.js' }, outDir: 'lib', format: ['esm'], platform: 'node' }
```

保留输出文件 `lib/index.js`，只改变其源码入口路径。

- [ ] **步骤 5：运行 Host 结构回归**

运行：

```bash
pnpm --filter @hytime/dsh-companion exec vitest run src/host/index.test.ts src/host/plugin.test.ts
pnpm --filter @hytime/dsh-companion typecheck
pnpm --filter @hytime/dsh-companion build
```

预期：测试、类型检查和构建通过，旧 Host RPC/PTY/SSE 行为不变。

- [ ] **步骤 6：提交 Host 结构整理**

```bash
git add packages/dsh-companion/src/host packages/dsh-companion/tsdown.config.ts
git commit -m "refactor: split host modules and entry"
```

### 任务 2：拆分 Client、建立 Client index 入口和公共位置模块

- [x] **步骤 1：先锁定现有 Client 行为测试**

运行：

```bash
pnpm --filter @hytime/dsh-companion exec vitest run src/components/whale-floating-widget.test.tsx src/components/whale-status-popover.test.tsx
```

预期：现有拖动、位置恢复、buddy toast、latest reply、设置 slot 相关测试通过。

- [ ] **步骤 2：迁移 Client 入口和 slot 职责**

按以下边界拆分：

```tsx
// client/index.tsx：只有插件入口
export const name = 'dsh-companion'
export const inject = ['remote']
export async function apply(ctx: PluginCtx) {
  return applyClientRuntime(ctx)
}
```

`runtime.tsx` 只装配 Remote mount、timer、slots 和 stream；不得创建 EventSource、读取 buddy/reply、注册 window/document listener 或直接渲染 WhaleFloatingWidget。`slots/overlay.tsx` 只注册 `shell.overlay`、渲染边界和 `/hy-companion-chat` 注入；`slots/settings-section.tsx` 只注册 `settings.section`；`stream/event-stream.ts` 以 `useCompanionEventStream` 管理 EventSource、断线 fallback 轮询、状态/buddy/reply 解析和清理。`client/plugin.tsx` 改为兼容 re-export。

`components/widget/position.ts` 只保留无副作用位置/贴边/存储函数；`components/widget/drag.ts` 只提供 `useWidgetDrag`，集中处理 pointermove/pointerup listener 的注册和卸载、4px 拖动阈值、位置保存、贴边和 click/drag 区分。`WhaleFloatingWidget` 不得直接访问 Remote、EventSource、localStorage、window pointer listener 或在组件中重复维护这些逻辑；只组合 hook 返回值和 JSX。

- [x] **步骤 3：抽出位置/拖动逻辑并先写边界测试**

`utils/widget-position.ts` 的 `initialPosition`、`savePosition`、`nearestEdge`、`peekPosition` 必须保持纯函数/可控存储访问；`hooks/use-widget-drag.ts` 的 `useWidgetDrag` 负责 pointer capture、window listeners、localStorage 保存和 click/drag 区分。纯函数测试覆盖视口边界、非法存储和四个贴边方向；hook 测试覆盖拖动阈值、点击不移动、卸载清理。

- [x] **步骤 4：更新 Client 构建入口**

将 `tsdown.config.ts` Client entry 改为：

```ts
{ entry: { client: 'lib/types/client/index.js' }, outDir: 'lib', format: ['cjs'], platform: 'browser' }
```

保留输出文件 `lib/client.js` 及其 `window.__ModuleLoader__.load` 包装。

- [x] **步骤 5：瘦身并验证 Client 组件**

`whale-floating-widget.tsx` 只保留 props、hook 调用、frame 解析和 JSX；现有 buddy/reply/affection/drag 行为保持不变。

运行：

```bash
pnpm --filter @hytime/dsh-companion exec vitest run src/client/index.test.tsx src/utils/widget-position.test.ts src/hooks/use-widget-drag.test.ts src/hooks/use-reply-bubbles.test.ts src/components/whale-floating-widget.test.tsx src/components/whale-status-popover.test.tsx
pnpm --filter @hytime/dsh-companion typecheck
pnpm --filter @hytime/dsh-companion build
```

- [ ] **步骤 6：提交 Client 结构整理**

```bash
git add packages/dsh-companion/src/client packages/dsh-companion/src/components/widget/position.ts packages/dsh-companion/src/components/widget/position.test.ts packages/dsh-companion/src/components/widget/drag.ts packages/dsh-companion/src/components/widget/drag.test.ts packages/dsh-companion/src/components/whale-floating-widget.tsx packages/dsh-companion/src/components/whale-floating-widget.test.tsx packages/dsh-companion/tsdown.config.ts
git commit -m "refactor: split client modules and entry"
```

### 任务 3：同步更新开发文档、边界文档并完成阶段一审核门

本任务不是实现后的补充工作。`docs/DEVELOPMENT.md`、`AGENTS.md` 和状态设计规格必须在阶段一结构拆分完成后立即同步更新；没有这三个文档的变更，阶段一不得标记完成，也不得开始阶段二。
- [ ] **步骤 1：更新 `docs/DEVELOPMENT.md`**

更新目录结构为：

```text
packages/dsh-companion/src/
├── host/
│   ├── index.ts                    # Host DSH entry
│   ├── runtime.ts                  # Host assembly/lifecycle
│   ├── remote/
│   │   ├── service.ts              # Typert Remote/RPC surface
│   │   ├── handlers.ts             # RPC handlers
│   │   └── credentials.ts          # PTY credentials
│   ├── status/
│   │   ├── state-machine.ts        # status transitions
│   │   ├── narrator.ts             # status narration
│   │   └── event-bridge.ts         # Cordis events
│   ├── transport/
│   │   ├── sse-publisher.ts        # SSE transport
│   │   └── routes.ts               # HTTP/SSE/asset routes
│   ├── schedules/timer.ts          # periodic tasks
│   └── prerequisites/self-heal.ts  # dependency repair
├── client/
│   ├── index.tsx                   # Client DSH entry
│   ├── runtime.tsx                 # Client assembly
│   ├── slots/
│   │   ├── overlay.tsx             # shell.overlay
│   │   └── settings-section.tsx    # settings.section
│   └── stream/
│       ├── event-stream.ts         # SSE/fallback polling
│       └── status-parser.ts        # status payload parser
├── contracts/                      # serializable shared contracts
├── hooks/                          # reusable React hooks only
├── utils/                          # pure reusable utilities
└── components/                     # React presentation components only
```

同时补充规则：Host/Client index 是双端入口；Remote、SSE、slot、React view、纯工具不得跨职责；状态映射只允许在 `contracts/companion-status.ts`；客户端只能接收可序列化字段；单个业务实现文件原则上不超过 250 行。

- [ ] **步骤 2：更新 `AGENTS.md`**

把上述目录边界、入口路径、`plugin.ts` 仅作兼容 re-export、构建入口和 tarball 安装验收写入项目记忆；明确禁止在 `host/index.ts`、`client/index.tsx` 或大组件中新增跨层业务。

- [ ] **步骤 3：更新状态气泡设计文档边界**

在 `docs/superpowers/specs/2026-08-17-main-agent-status-bubble-design.md` 增加“结构边界”章节：状态契约归 `contracts/companion-status.ts`；Host 状态逻辑归 `host/status/state-machine.ts`、`host/status/event-bridge.ts`、`host/status/narrator.ts` 和 `host/status/fallback-text.ts`；Client 状态展示归 `client/stream/status-parser.ts`、`components/widget/reply-bubbles.ts` 和 `components/widget/frame.ts`；双端入口为 `host/index.ts` 和 `client/index.tsx`。将执行状态改为“结构整理计划待审核，结构验收后执行气泡阶段”。

- [ ] **步骤 4：执行阶段一质量门禁**

运行：

```bash
pnpm typecheck
pnpm test
pnpm --filter @hytime/dsh-companion build
```

并检查：

```bash
test -f packages/dsh-companion/lib/index.js
test -f packages/dsh-companion/lib/client.js
grep -R "EMOTION_TO_FRAME\|FRAME_NAMES" packages/dsh-companion/src/host packages/dsh-companion/src/client packages/dsh-companion/src/components/whale-floating-widget.tsx
find packages/dsh-companion/src -type f \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.test.ts' ! -name '*.test.tsx' -print0 | xargs -0 wc -l | awk 'NF == 2 && $1 > 250 { print; failed = 1 } END { exit failed }'
```

预期：全量通过；映射不出现在 Host/Client/plugin/widget 实现文件中；两个 bundle 入口存在；除纯类型/静态配置外没有业务文件超过 250 行。

- [ ] **步骤 5：阶段一代码审核**

审核范围只包含结构整理和文档变更：确认 `host/index.ts`/`client/index.tsx` 是唯一构建入口，`plugin.ts`/`plugin.tsx` 仅兼容 re-export；确认 Remote、SSE、路由、定时器、slot、位置和拖动没有跨职责实现；确认每个业务文件不超过 250 行。运行：

```bash
git diff --check
git status --short
git diff main...HEAD --stat
```

审核不通过时必须留在阶段一修复，不能开始状态气泡开发。

- [ ] **步骤 6：合并阶段一提交**

阶段一 review 通过后，在主工作树执行：

```bash
git merge --no-ff feat/main-agent-status-bubble -m "refactor: establish single-responsibility plugin structure"
git status --short --branch
```

预期：merge 成功、主工作树干净；阶段二必须基于这个已合并提交创建新的实现分支或继续已合并主线，不能基于未合并 worktree 开始。

- [ ] **步骤 7：按 tarball 流程安装并检查阶段一产物**

从已合并的主工作树构建并打包：

```bash
cd /Volumes/hydisk/vsProject/dsh-companion/packages/dsh-companion
pnpm run build
rm -rf /tmp/dsh-companion-phase1-packs
mkdir -p /tmp/dsh-companion-phase1-packs
pnpm pack --pack-destination /tmp/dsh-companion-phase1-packs
VERSION=$(node -p "require('./package.json').version")
cd /Volumes/hydisk/deepseek-harness
pnpm dsh plugin --profile web remove @hytime/dsh-companion
pnpm dsh plugin --profile web add "/tmp/dsh-companion-phase1-packs/hytime-dsh-companion-${VERSION}.tgz"
```

禁止使用 `link:`；必须先 remove 旧插件，再安装阶段一 tarball。

- [ ] **步骤 8：重启 DSH 并记录安装验收证据**

停止已有 DSH web 后运行：

```bash
cd /Volumes/hydisk/deepseek-harness
pnpm run dsh web
```

确认：

```bash
test ! -L "$HOME/.dsh/profiles/web/node_modules/@hytime/dsh-companion"
node -p "require('$HOME/.dsh/profiles/web/node_modules/@hytime/dsh-companion/package.json').version"
curl -fsS http://127.0.0.1:3080/
curl -fsS http://127.0.0.1:3080/plugins/@hytime/dsh-companion/client.js
```

预期：安装目录不是 symlink、profile 版本与阶段一 tarball 一致、GUI 和 Client bundle 均返回 HTTP 200。只有代码审核、merge、安装、重启和以上检查全部通过，才允许开始阶段二任务 4。
---

## 阶段二：主 Agent 状态回复气泡

### 任务 4：建立唯一状态契约和共享映射

- [ ] **步骤 1：编写失败测试**

```ts
expect(statusFallbackEmotion('thinking')).toBe('thinking')
expect(statusFallbackEmotion('replying')).toBe('talking')
expect(EMOTION_TO_FRAME.thinking).toBe('smile')
expect(EMOTION_TO_FRAME.talking).toBe('laugh')
expect(FRAME_NAMES).toEqual(['idle', 'happy', 'smile', 'laugh', 'shy', 'surprised'])
expect(normalizeCompanionEmotion('unknown')).toBe('idle')
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
pnpm --filter @hytime/dsh-companion exec vitest run src/contracts/companion-status.test.ts
```

预期：FAIL，因为公共状态契约尚未创建。

- [ ] **步骤 3：实现 `companion-status.ts` 并保持兼容 re-export**

集中导出 `SkillStatus`、`CompanionEmotion`、`SKILL_STATUSES`、`COMPANION_EMOTIONS`、`FRAME_NAMES`、`EMOTION_TO_FRAME`、`STATUS_FALLBACK_EMOTION`、`normalizeSkillStatus`、`normalizeCompanionEmotion`、`statusFallbackEmotion` 和 `isCompanionEmotion`。`skill-contract.ts` 只 re-export，不保留第二份定义；`expression-map.ts` 只负责 frame URL。

- [ ] **步骤 4：运行契约测试和 typecheck**

```bash
pnpm --filter @hytime/dsh-companion exec vitest run src/contracts/companion-status.test.ts src/contracts/skill-contract.test.ts src/components/expression-map.test.ts
pnpm --filter @hytime/dsh-companion typecheck
```

- [ ] **步骤 5：提交公共状态契约**

```bash
git add packages/dsh-companion/src/contracts/companion-status.ts packages/dsh-companion/src/contracts/companion-status.test.ts packages/dsh-companion/src/contracts/skill-contract.ts packages/dsh-companion/src/components/expression-map.ts packages/dsh-companion/src/components/expression-map.test.ts
git commit -m "refactor: centralize companion status mappings"
```

### 任务 5：抽出状态工具和状态机

- [ ] **步骤 1：先写工具和状态机失败测试**

覆盖：`isMainAgent` 忽略带 `parentSession` 的 Agent；`normalizeStatusUpdate` 保留合法 `statusMessage`、过滤非字符串；工具摘要限制长度并过滤 password/token/secret；相同 phase 不重复 narrator；approval 恢复前一 phase；旧 generation 不发布。

- [ ] **步骤 2：实现公共工具**

创建 `utils/status-utils.ts`：

```ts
export function normalizeStatusUpdate(raw: unknown): StatusUpdate
export function isMainAgent(agent: unknown): boolean
export function summarizeToolContext(name: string, args: unknown): string
export function mergeStatusUpdate(base: StatusUpdate, patch: Partial<StatusUpdate>): StatusUpdate
```

所有函数只做结构化读取、敏感字段过滤和长度限制，不访问 Cordis、文件系统或 React。

- [ ] **步骤 3：实现 Host 状态机**

创建 `host/status/state-machine.ts`，定义内部 phase：`thinking`、`executing`、`approval`、`replying`、`success`、`error`、`cancelled`。传输层仍映射到现有 `SkillStatus`；approval 不新增传输枚举。状态机维护 generation 和 AbortController，phase 变化立即发布 fallback，最新 narrator 结果必须匹配 generation 才能发布。

- [ ] **步骤 4：运行测试和 typecheck**

```bash
pnpm --filter @hytime/dsh-companion exec vitest run src/utils/status-utils.test.ts src/host/status/state-machine.test.ts src/state/skill-status-source.test.ts
pnpm --filter @hytime/dsh-companion typecheck
```

- [ ] **步骤 5：提交工具和状态机**

```bash
git add packages/dsh-companion/src/utils packages/dsh-companion/src/host/status/state-machine.ts packages/dsh-companion/src/host/status/state-machine.test.ts packages/dsh-companion/src/state/skill-status-source.ts packages/dsh-companion/src/state/skill-status-source.test.ts
git commit -m "feat: add reusable main agent status state"
```

### 任务 6：实现 narrator 和 Host 事件桥接

- [ ] **步骤 1：先写 narrator/事件失败测试**

```ts
expect(parseNarration('{"message":"我在检查这一步。","emotion":"thinking"}'))
  .toEqual({ message: '我在检查这一步。', emotion: 'thinking' })
expect(parseNarration('{"message":"x","emotion":"invalid"}').emotion).toBe('thinking')
expect(parseNarration('not-json').message).not.toBe('')
```

事件测试要求：主 Agent 的 `tools/execute` 进入 executing；子 Agent 完全忽略；`tools/execute` listener 调用 `next()`；`approval/request` 在 `finally` 恢复状态；工具结果成功/失败/取消按优先级映射。

- [ ] **步骤 2：实现 `host/status/narrator.ts`**

使用 `ctx.llm.stream` 独立调用：provider/model 来自主 Agent options；只传一条 `createUserMessage`；不传 `tools`、会话历史或 sessionId；`maxTokens` 为 80；有限超时并支持 AbortController。只收集 `text-delta`，严格解析 `{ message, emotion }`，非法 JSON、空文本、异常、超时或缺少模型路由回退固定文案。

- [ ] **步骤 3：实现 `host/status/event-bridge.ts`**

监听：

- `agent/status`：主 Agent running → thinking，idle → success。
- `tools/execute`：主 Agent → executing，观察者始终 `return next()`。
- `tools/result`：成功 → replying，错误 → error，aborted → cancelled。
- `approval/request`：先发布 approval 文案，再 `try/ finally` 调用并恢复原 phase。

所有事件先调用 `isMainAgent`，子 Agent 和后台 Agent 不改变状态机。

- [ ] **步骤 4：运行 Host 测试和 typecheck**

```bash
pnpm --filter @hytime/dsh-companion exec vitest run src/host/status/narrator.test.ts src/host/status/event-bridge.test.ts src/host/status/state-machine.test.ts
pnpm --filter @hytime/dsh-companion typecheck
```

- [ ] **步骤 5：提交 narrator 和事件桥接**

```bash
git add packages/dsh-companion/src/host/status/narrator.ts packages/dsh-companion/src/host/status/narrator.test.ts packages/dsh-companion/src/host/status/event-bridge.ts packages/dsh-companion/src/host/status/event-bridge.test.ts
git commit -m "feat: publish main agent status narration"
```

### 任务 7：接入 status SSE 和 Client 回复气泡

- [ ] **步骤 1：先写 SSE/气泡失败测试**

```tsx
expect(parseStatusEvent('{"status":"thinking","statusMessage":"正在检查","emotion":"happy"}'))
  .toEqual({ status: 'thinking', statusMessage: '正在检查', emotion: 'happy' })
expect(selectReplySource({ statusMessage: '状态说明', latestReply: undefined })).toBe('status')
expect(selectReplySource({ statusMessage: '状态说明', latestReply: '真实回复' })).toBe('reply')
```

组件测试还必须验证：状态文案进入现有回复气泡；真实回复覆盖状态文案；同一状态文案不重启打字机；合法 emotion 驱动对应图片；popover 不显示状态标题/StateDot/错误，但好感度和聊天入口保留。

- [ ] **步骤 2：实现 Client parser 和气泡 hook**

`client/stream/status-parser.ts` 调用公共 `normalizeStatusUpdate`，畸形帧返回 null；`components/widget/reply-bubbles.ts` 管理状态文案、真实回复、去重、优先级、自动消失和关闭，不管理 buddy toast、拖动或位置。

- [ ] **步骤 3：连接 Host/Client 字段**

Host runtime 将 machine publish 的 `statusMessage`/`emotion` 放入 status SSE；Client event-stream 调用 parser；overlay 将 `statusMessage` 和 emotion 传给 widget；`CompanionRemoteFace.status()` 镜像同步可选字段。

- [ ] **步骤 4：删除视觉状态面板**

Popover 删除 `StateDot`、状态标题、状态文字和错误区块；保留称呼、好感度、关闭和聊天入口。`WhaleFloatingWidget` 的 aria-label 保留可访问状态文本，但不再渲染重复状态面板。

- [ ] **步骤 5：运行 Client 测试和 typecheck**

```bash
pnpm --filter @hytime/dsh-companion exec vitest run src/client/stream/status-parser.test.ts src/components/widget/reply-bubbles.test.ts src/components/whale-floating-widget.test.tsx src/components/whale-status-popover.test.tsx
pnpm --filter @hytime/dsh-companion typecheck
```

- [ ] **步骤 6：提交 Client 气泡实现**

```bash
git add packages/dsh-companion/src/client packages/dsh-companion/src/components packages/dsh-companion/src/contracts packages/dsh-companion/src/state packages/dsh-companion/src/styles/companion.module.css
git commit -m "feat: show main agent status in reply bubble"
```

### 任务 8：全量验证、打包和 DSH GUI 验收

- [ ] **步骤 1：运行质量门禁**

```bash
pnpm typecheck
pnpm test
pnpm --filter @hytime/dsh-companion build
```

预期：全量测试、typecheck 和 build 通过；状态/情绪/frame 映射在公共契约中只有一份。

- [ ] **步骤 2：抽查双端构建产物**

```bash
test -f packages/dsh-companion/lib/index.js
test -f packages/dsh-companion/lib/client.js
tar -czf /tmp/dsh-companion-check.tgz -C packages/dsh-companion lib cordis.patch.yml
```

确认 Host bundle 不进入 Client，Client bundle 不引用 Node Host runtime、credentials 或 live Agent 对象。

- [ ] **步骤 3：按 tarball 流程更新 DSH profile**

```bash
cd /Volumes/hydisk/deepseek-harness
pnpm dsh plugin --profile web remove @hytime/dsh-companion
cd /Volumes/hydisk/vsProject/dsh-companion/.worktrees/main-agent-status-bubble/packages/dsh-companion
rm -rf /tmp/dsh-companion-packs
mkdir -p /tmp/dsh-companion-packs
pnpm pack --pack-destination /tmp/dsh-companion-packs
cd /Volumes/hydisk/deepseek-harness
pnpm dsh plugin --profile web add /tmp/dsh-companion-packs/hytime-dsh-companion-0.1.12.tgz
```

禁止使用 `link:`。

- [ ] **步骤 4：重启和验证 DSH web**

重启 `pnpm run dsh web` 后运行：

```bash
node -p "require('$HOME/.dsh/profiles/web/node_modules/@hytime/dsh-companion/package.json').version"
test ! -L "$HOME/.dsh/profiles/web/node_modules/@hytime/dsh-companion"
curl -fsS http://127.0.0.1:3080/
curl -fsS http://127.0.0.1:3080/plugins/@hytime/dsh-companion/client.js
```

预期版本为 `0.1.12`，安装目录不是 symlink，GUI 和 Client bundle 返回 HTTP 200。

- [ ] **步骤 5：执行最终人工验收**

确认主 Agent 思考、执行、授权、回答、完成、失败和取消的气泡顺序正确；同一 phase 不重复请求；旧 generation 不覆盖新状态；子 Agent/后台任务不影响鲸鱼；AI 不可用时固定文案仍出现；真实聊天回复优先；状态面板移除后好感度和聊天入口仍工作。

---

## 计划自检

- 阶段一完全先于阶段二，阶段一只做结构和文档，不改变气泡行为。
- Host/Client 均有 `index` 构建入口；旧 `plugin` 文件只做兼容 re-export。
- Remote、SSE、事件流、slot、React view、位置、拖动、气泡和纯工具均有独立职责文件。
- 状态类型、情绪类型、状态 fallback、情绪到图片帧和合法值只有 `contracts/companion-status.ts` 一份来源。
- `docs/DEVELOPMENT.md`、`AGENTS.md` 和状态设计规格均包含同一份目录/边界规则。
- 没有新增 `SkillStatus` 或 `CompanionEmotion` 枚举值；approval 只存在 Host 内部。
- `tools/execute` 和 `approval/request` 观察者均调用 `next()`，不会吞掉下游行为。
- 失败、超时、非法 JSON、非法 emotion 和旧 generation 都有明确测试路径。
