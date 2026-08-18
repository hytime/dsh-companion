# 主 Agent 状态回复气泡设计

## 目标

在 dsh-companion 鲸鱼悬浮窗中显示当前主 Agent 的对话工作状态：思考、执行、等待授权和回答。状态说明以旅伴自己的回复气泡显示，使用当前系统 AI 后台生成一句简短话语，并同步生成现有 `CompanionEmotion` 枚举值驱动人物帧。

本设计不新增人物图片、不新增 `SkillStatus` 枚举，不让子 Agent 或后台任务覆盖当前主对话状态。

## 结构边界

本功能必须建立在先完成的双端结构整理之上。结构整理阶段不改变现有状态和气泡行为，先将复杂入口拆分，再进入状态气泡实现阶段。阶段一必须完成代码审核、合并提交、tarball 安装、profile 非 symlink 检查、DSH 重启以及 GUI/Client bundle HTTP 验证；任何一项失败，都不能开始阶段二。

```text
packages/dsh-companion/src/
├── host/
│   ├── index.ts                    # Host DSH 插件入口
│   ├── runtime.ts                  # 生命周期和模块装配
│   ├── remote/                     # Remote API、RPC handler、PTY credentials
│   ├── status/                     # 状态机、narrator、fallback、事件桥接
│   ├── transport/                  # SSE publisher 和 HTTP/asset routes
│   ├── schedules/timer.ts          # buddy/reply 周期任务
│   └── prerequisites/self-heal.ts  # 前置依赖自愈
├── client/
│   ├── index.tsx                   # Client DSH 插件入口
│   ├── runtime.tsx                 # 生命周期和模块装配
│   ├── slots/                      # overlay/settings slots
│   └── stream/                     # EventSource 和 status parser
├── contracts/                      # 可序列化共享契约和唯一状态映射
├── hooks/                          # 可复用 React hooks（拖动、气泡、打字机）
├── utils/                          # 无副作用公共工具（含 widget-position）
└── components/                     # 所有 React 展示组件（鲸鱼、popover、气泡、好感度、logo）
```

边界规则：

- `host/index.ts` 和 `client/index.tsx` 只导出插件元数据并调用 runtime 装配函数。
- `host/runtime.ts` 和 `client/runtime.tsx` 只负责生命周期与依赖装配。
- Remote、状态机、事件桥接、SSE、路由、定时器、slot、React 组件和公共工具分别保持单一职责。
- `contracts/companion-status.ts` 是 `SkillStatus`、`CompanionEmotion`、状态 fallback、emotion/frame 映射和 frame 列表的唯一来源。
- `plugin.ts` 和 `plugin.tsx` 仅保留兼容 re-export，不作为业务入口。
- 单个业务实现文件原则上不超过 250 行；超过后必须继续拆分。纯类型声明、静态配置和测试夹具可在有明确理由时例外。
- Client 只接收可序列化状态和 Remote 结果，不直接访问 Host Service、credentials、Session 或 live runtime 对象。

### Client 结构整理补充

在进入状态回复气泡阶段前，Client 先完成通用逻辑拆分：

- `client/runtime.tsx` 只负责 Remote mount、子 Fiber 生命周期和 slot 装配，不持有 EventSource、轮询、拖动或组件状态。
- `client/stream/event-stream.ts` 封装 SSE、断线兜底轮询、事件解析和清理；通过 hook 返回可序列化 `state`、buddy 和 latest reply。
- `client/slots/overlay.tsx` 只负责 `shell.overlay` occupant、渲染错误边界和回复命令注入；`settings-section.tsx` 只负责设置页注册。
- `hooks/use-widget-drag.ts`、`hooks/use-reply-bubbles.ts` 和 `hooks/use-typewriter.ts` 只提供可复用 React hooks，不包含 widget JSX；`client/stream/event-stream.ts` 虽以 hook 形式消费流，但职责仍限定在 SSE/Remote 数据流。
- `utils/widget-position.ts` 只提供位置/贴边/存储纯函数；`components/affection-meter.tsx` 和 `message-bubble.tsx` 只负责展示组件。
- `WhaleFloatingWidget` 只组合 hooks、frame、气泡、好感度和 popover JSX，不直接创建 EventSource、访问 Remote 或持有全局 listener。

抽取后的模块必须保持现有 buddy/reply/affection/drag/settings 行为；每个纯函数和 hook 都要有边界测试，组件测试只验证用户可见行为。

## 现有状态和人物映射

传输层继续使用现有 `SkillStatus`：

- `idle`
- `connecting`
- `thinking`
- `replying`
- `success`
- `error`
- `cancelled`

人物图片继续由既有 `resolveWhaleFrame(status, emotion)` 决定：

| `CompanionEmotion` | 图片帧 |
| --- | --- |
| `idle` | `idle.png` |
| `thinking` | `smile.png` |
| `talking` | `laugh.png` |
| `happy` | `happy.png` |
| `shy` | `shy.png` |
| `surprised` | `surprised.png` |

AI 不能返回新状态或新表情值。非法 `emotion` 通过 `normalizeCompanionEmotion` 归一化，并回退到现有 `statusFallbackEmotion(status)`。

## 状态语义映射

用户语义不新增为传输枚举，而是由事件选择现有 `SkillStatus`，再由 AI 文案说明具体语义：

| 用户看到的语义 | 现有状态 | 触发边界 | 默认表情 |
| --- | --- | --- | --- |
| 正在思考 | `thinking` | 主 Agent 开始模型处理，尚未进入工具执行 | `thinking` |
| 正在执行 | `connecting` 或当前已有执行状态 | 主 Agent 进入 `tools/execute` | `statusFallbackEmotion(status)` |
| 等待授权 | 保持当前 `thinking`/`connecting` | `approval/request` 挂起期间 | `statusFallbackEmotion(status)` |
| 正在回答 | `replying` | 工具结果返回后，主 Agent 整理并输出回答 | `talking` |
| 已完成 | `success` | 主 Agent 回到 idle 并成功结束 | `happy` |
| 失败 | `error` | 工具或模型失败 | `surprised` |
| 已取消 | `cancelled` | 主 Agent 或工具被取消 | `idle` |

等待授权的区别通过 `statusMessage` 表达，不能创建 `awaiting-authorization` 新枚举，避免破坏图片映射和现有 Client 合约。

## Host 数据流

### 主 Agent 识别

Host 只接受当前主 Agent 的事件。主 Agent 以没有 `session.header.parentSession` 的 Agent 为边界；子 Agent、workflow worker 和其他后台 Agent 的事件不改变 companion 状态。

### 事件监听

- `agent/status`：识别主 Agent 开始运行和回到 idle。
- `tools/execute`：识别主 Agent 开始执行工具，沿用现有 waterfall 纪律，观察者必须调用 `next()`。
- `tools/result`：识别工具完成、失败或取消。
- `approval/request`：识别授权等待；这是 waterfall，监听器先发布等待状态，再调用 `next()`，决策完成后恢复原执行状态。

Host 保持当前状态快照，并只在用户语义类别发生变化时启动一次状态文案生成。相同类别持续期间不重复请求 AI。

### SSE 载荷

现有 `status` SSE 数据扩展为可选字段：

```ts
interface StatusUpdate {
  status: SkillStatus
  lastError?: string
  statusMessage?: string
  emotion?: CompanionEmotion
}
```

`status` 是现有枚举，`statusMessage` 和 `emotion` 是状态说明的附加字段，不改变既有状态推断和 fallback 行为。

## AI 状态文案

### 请求路由

每次状态类别切换后，使用当前主 Agent 的 `options.provider` 和 `options.model` 调用当前系统 AI。请求是独立后台调用：

- 不追加到用户会话日志。
- 不提供工具，避免状态文案触发工具递归。
- 使用短输出限制和有限超时。
- Prompt 携带状态语义、当前工具名或授权原因（可用时）以及中文输出要求。

期望输出为严格 JSON：

```json
{
  "message": "我正在检查这一步，马上继续。",
  "emotion": "thinking"
}
```

Host 解析并校验 `message` 和 `emotion`。输出为空、JSON 非法、emotion 非法、模型失败或超时，都使用状态对应的固定兜底文案，不阻断主 Agent。

### 并发和过期结果

每次状态类别变化递增 generation 序号。AI 请求完成时只有序号仍为最新才发布结果；旧请求结果静默丢弃，避免“思考”文案晚于“回答”文案覆盖气泡。

## Client 展示

- 移除 `WhaleStatusPopover` 的状态面板和点击展开状态窗口。
- `statusMessage` 进入现有 `replyToast`，显示为旅伴自己的话语，沿用旅伴名称、打字机效果和自动消失行为。
- `emotion` 同时传入 `WhaleFloatingWidget`，由既有 `resolveWhaleFrame` 映射图片。
- 真实聊天回复仍可通过现有 `latestReply` 事件进入回复气泡；真实回复优先于状态说明。
- `whale_affection` 只显示好感度数值和进度，不承载状态面板。
- buddy 提醒 toast、拖拽、贴边和设置页行为保持独立。
- 状态说明失败时仍显示固定兜底文案，不显示空气泡。

## 测试

### Host

- 只处理主 Agent，忽略带 `parentSession` 的子 Agent。
- `tools/execute`、`tools/result`、`approval/request` 的状态优先级和恢复顺序。
- 相同状态类别不重复生成文案。
- AI JSON 解析、非法 emotion、空 message、超时和异常均回退固定文案。
- 旧 generation 结果不能覆盖新状态。
- SSE status 载荷包含现有 status 和可选 message/emotion。

### Client

- status SSE 的 `statusMessage` 进入回复气泡。
- status SSE 的合法 emotion 驱动正确图片帧。
- 非法或缺失 emotion 走现有 fallback 映射。
- 状态面板不再渲染，`whale_affection` 保留好感度显示。
- 真实 buddy toast 和聊天回复仍独立工作。

## 验收标准

1. 主 Agent 进入思考、执行、等待授权、回答时，回复气泡显示对应的 AI 文案。
2. 每次状态类别变化最多生成一次 AI 文案，状态持续期间不重复调用。
3. `emotion` 始终属于现有 `CompanionEmotion` 枚举，并显示对应人物图片。
4. 子 Agent 和后台任务不会覆盖主 Agent 的人物状态或回复气泡。
5. AI 服务不可用时状态仍显示固定兜底文案，主 Agent 不受影响。
6. 独立状态面板被移除，现有好感度和提醒/聊天气泡行为不回归。
7. 相关测试、全量 typecheck、全量测试和构建通过。

**执行状态：** 规格已确认。当前先执行双端结构整理、单一职责拆分和开发/边界文档同步；阶段一必须通过代码审核、合并提交、tarball 安装、profile/非 symlink 检查、DSH 重启和 GUI/bundle 验证，之后才允许执行主 Agent 状态回复气泡阶段。
