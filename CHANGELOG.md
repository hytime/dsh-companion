# Changelog

## [0.1.13] - 2026-08-19

### Added / 新增

- 新增主 Agent 状态回复气泡，覆盖思考、执行工具、等待审批、回复中、成功、失败和取消等状态。 / Added main Agent status reply bubbles for thinking, tool execution, approval waiting, replying, success, failure, and cancellation states.
- 新增状态文案生成与固定兜底文案，支持将状态、情绪和错误信息同步到 Client。 / Added narrated status messages and fixed fallback messages, with status, emotion, and error details synchronized to the Client.
- 新增 Agent 选择跟随机制，切换会话后鲸鱼娘展示对应 Agent 的状态。 / Added Agent selection tracking so the companion displays the selected Agent's status when switching sessions.
- 新增动态右键聊天菜单，按当前旅伴名称显示“和{旅伴名称}聊聊”。 / Added a dynamic context-menu chat entry that displays “Chat with {companion name}”.

### Changed / 变更

- 将状态机、事件桥接、叙述器、Remote、SSE 和 Client 气泡职责拆分到独立模块。 / Split the state machine, event bridge, narrator, Remote, SSE, and Client bubble responsibilities into dedicated modules.
- 统一状态、情绪和鲸鱼帧映射，由共享契约集中维护。 / Centralized status, emotion, and whale-frame mappings in shared contracts.
- 状态消息与真实回复统一使用回复气泡展示，真实回复优先于状态消息。 / Unified status messages and real replies in reply bubbles, with real replies taking priority over status messages.
- 移除状态窗口展示，保留右键菜单作为进入对话的入口。 / Removed the status window and kept the context menu as the entry point for starting a conversation.
- 调整组件、Hook、Client Slot 和公共工具的目录边界，保持组件与可复用逻辑分离。 / Reorganized component, Hook, Client Slot, and shared utility boundaries to separate UI components from reusable logic.

### Fixed / 修复

- 修复叙述状态通过 Remote 传递时 `statusMessage`、`emotion` 和 `lastError` 丢失的问题。 / Fixed `statusMessage`, `emotion`, and `lastError` being dropped when narrated status updates were passed through the Remote.
- 修复状态快照可能被外部引用修改的问题，Remote 返回独立的可序列化快照。 / Fixed mutable status snapshots by returning independent serializable snapshots from the Remote.
- 修复切换 Agent 后旧 Agent 事件继续更新当前鲸鱼娘状态的问题。 / Fixed events from a previously selected Agent continuing to update the current companion state after switching Agents.
- 修复 Agent 状态事件处理中的 waterfall 传递，确保后续监听器仍能收到事件。 / Fixed waterfall propagation in Agent status event handling so subsequent listeners continue to receive events.

[0.1.13]: https://github.com/hytime/dsh-companion/releases/tag/v0.1.13
