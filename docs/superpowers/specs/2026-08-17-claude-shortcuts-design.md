# Claude CLI 风格任务交互快捷键插件设计

## 状态

已完成头脑风暴并获得用户确认。本文档描述独立 DSH 客户端插件的设计，不包含实现代码。

## 目标

为 DSH Web GUI 的任务问答和授权/审批交互提供接近 Claude CLI 的键盘操作：

- 任务问答使用 ↑/↓ 选择、Enter 确认、Esc 中断当前任务；
- 授权/审批使用 ↑/↓ 选择、Enter 确认、Esc 中断当前任务；
- 不启动 Claude CLI，也不执行 Claude CLI；
- 不改变普通聊天输入框已有的快捷键行为。

## 背景与约束

DSH 已有以下能力：

- 普通聊天 InputBar 已处理 Enter、上下键菜单导航和 Esc 分层行为；
- command popup 已支持 Enter、↑/↓ 和 Esc；
- ui-user-questions 已提供任务问答 carrier、答案协议和按钮式问答卡片，但没有将上下键作为选项导航，也没有将 Esc 接到任务中断；
- ui-conversation 已提供审批 carrier、审批答案协议和会话级 conversation.cancel()；
- conversation.composer 是 selector-routed chain。它选择完整的 takeover 组件，不提供包裹既有组件的 middleware 或键盘事件注入接口。

因此插件采用完整 takeover，不修改 ui-user-questions 或 ui-conversation 核心源码。插件会维护问答/审批卡片的渲染副本，但复用既有 carrier、答案协议、会话取消接口和 slot 机制。

## 插件架构

目标包名：@hytime/dsh-client-ui-claude-shortcuts。

插件只提供 client/browser half：

- 通过 conversation.composer 注册 takeover entry；
- 注入 slots、sessions 和 locale；
- 依赖 ui-conversation 和 ui-user-questions 的公开客户端契约；
- 通过当前 session scope 的 conversation.cancel() 中断任务；
- 不新增 Host RPC、CLI 执行器、持久化字段或服务端状态。

entry 使用高于内置问答和审批的优先级。selector 只匹配 pending interaction：优先选择 question，其次选择 approval，普通聊天返回 null 并继续使用原 InputBar。

键盘监听绑定在 takeover 卡片自身，不注册全局 document 监听。插件卸载时由 Cordis effect 清理 slot 和 locale 注册。

## 键盘行为

### 任务问答

组件维护当前问题索引、当前高亮项和每题 draft。

- 单选题：↑/↓ 在选项、自定义输入行和操作行之间移动；Enter 选择当前项。非最后一题自动进入下一题，最后一题提交完整答案。
- 多选题：↑/↓ 移动高亮；Enter 切换当前选项；高亮下一题/提交操作后，Enter 推进或提交。
- 自定义输入：Enter 确认并推进/提交；Shift+Enter 保留换行；输入框获得焦点时上下键保留原生光标行为。
- plan review：按同一套单选导航处理批准/拒绝选项。
- 任务问答中的 Esc 调用当前 session 的 conversation.cancel()，直接中断任务，进入 cancelling 状态并禁用重复动作。
- 现有可见的“取消问答”按钮保留原有 pending.cancel() 语义；它与 Esc 的任务级中断是两个明确入口。

### 授权/审批

授权卡片包含“拒绝”和“允许一次”两个操作。

- 默认高亮“允许一次”；
- ↑/↓ 在两个操作之间移动；
- Enter 执行当前高亮操作；
- Esc 调用当前 session 的 conversation.cancel()，直接中断任务，不回传 rejected；
- “拒绝”只在高亮后按 Enter，或点击对应按钮时回传 rejected；
- 回答发送中禁用重复确认。

### 通用键盘保护

- IME composition 中忽略 Enter，避免中文输入法候选确认误提交；
- 忽略重复 Enter，避免按住按键重复提交；
- 已结束或已卸载的 interaction 忽略过期键盘动作；
- 普通聊天、slash menu、其他 overlay 不被该插件处理。

## 数据流与生命周期

1. 插件加载并注册 locale 与 composer takeover。
2. composer selector 从 pending interactions 中选择 question 或 approval。
3. entry 按 session id 注入 cancelTask()，其实现通过 session scope 调用 conversation.cancel()。
4. 组件挂载时将焦点放到默认高亮操作；状态变化只更新本地 reducer/store。
5. Enter 的答案动作调用既有 question/approval carrier 的 response API。
6. Esc 的取消动作调用 session cancel API；成功后等待持久化会话事件驱动 takeover 卸载，不伪造会话结果。
7. 取消或回答失败时保留卡片和当前 draft，展示错误并允许重试。

## 错误处理

| 场景 | 行为 |
| --- | --- |
| 答案 receipt 被拒绝 | 保留 draft，显示错误，允许重试 |
| session cancel 失败 | 退出 cancelling，显示错误，允许再次按 Esc |
| interaction 已过期 | 忽略动作，不创建新状态 |
| 插件卸载 | 清理 slot、locale 和组件生命周期资源 |
| 依赖插件缺失 | 插件保持未激活，DSH 原有问答/审批 UI 继续工作 |

## 测试

### 单元测试

- question reducer：单选、多选、自定义输入、多题推进、plan review；
- approval reducer：默认允许、上下键切换、Enter 允许/拒绝、Esc 触发 cancel；
- IME、重复 Enter、处理中禁用和过期 interaction。

### 组件测试

- 默认焦点和 roving focus；
- question 的上下键、Enter、Esc；
- approval 的上下键、Enter、Esc；
- Shift+Enter 换行；
- 回答失败和取消失败后的恢复。

### 集成与 E2E

- slot 优先级生效，question 优先于 approval；
- 普通 composer 继续使用原实现；
- 初始任务问答按键确认、自动推进和任务级 Esc 中断；
- 授权 Enter 允许/拒绝，Esc 中断任务且不发送 rejected；
- 插件卸载后无残留键盘监听和 slot 注册。

## 范围外

- 启动或调用 Claude CLI；
- 在终端中实现 PTY 或原始键盘协议；
- 修改普通聊天 InputBar 的快捷键；
- 新增 Ctrl+C、历史搜索、撤销重做等未确认的 Claude CLI 快捷键；
- 修改 DSH 核心 ui-user-questions、ui-conversation 源码；
- 新增 Host API、配置项或持久化数据。
