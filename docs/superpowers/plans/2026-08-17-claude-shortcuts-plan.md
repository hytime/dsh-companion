# Claude CLI 风格任务交互快捷键插件实现计划

> 面向 AI 代理的工作者：必需子技能：使用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框跟踪进度。

目标：在 DSH Web 中新增独立客户端插件，为任务问答和授权/审批提供 ↑/↓、Enter、Esc 键盘操作，不启动 Claude CLI，也不修改 DSH 核心问答包。

架构：在 DSH checkout 的 packages/client 下创建 @deepseek-ai/dsh-client-ui-claude-shortcuts。插件以高优先级注册 conversation.composer takeover，匹配 question 和 approval pending interaction，并在组件内部维护键盘状态。Esc 通过当前 session scope 的 conversation.cancel() 中断任务；Enter 通过既有 carrier response API 回答。

技术栈：TypeScript、React、Cordis、dsh-client-ui-slots、dsh-client-ui-conversation、dsh-client-ui-user-questions、Vitest、Testing Library、Playwright。

---

## 文件结构

实现仓库为 /Volumes/hydisk/deepseek-harness。当前仓库只保存本计划文档。

创建：

- packages/client/ui-claude-shortcuts/package.json：client 包 manifest、导出、DSH client 依赖和构建脚本。
- packages/client/ui-claude-shortcuts/tsdown.config.ts：复用现有 client bundle 的入口配置。
- packages/client/ui-claude-shortcuts/tsconfig.json：client TypeScript 配置和 project references。
- packages/client/ui-claude-shortcuts/src/index.ts：公开入口，仅导出 client half 的类型/入口。
- packages/client/ui-claude-shortcuts/src/invariant.ts：包级 invariant 入口。
- packages/client/ui-claude-shortcuts/src/client/index.ts：Cordis client apply、locale 注册和 composer takeover 注册。
- packages/client/ui-claude-shortcuts/src/client/contract.ts：matched interaction、注入 cancelTask 和组件 props 类型。
- packages/client/ui-claude-shortcuts/src/client/selectors.ts：纯 question/approval selector。
- packages/client/ui-claude-shortcuts/src/client/keyboard/types.ts：焦点项、键盘命令和 reducer 状态类型。
- packages/client/ui-claude-shortcuts/src/client/keyboard/navigation.ts：上下键移动、Enter 激活和 Esc 命令解析。
- packages/client/ui-claude-shortcuts/src/client/components/ClaudeComposer.tsx：按 matched.kind 分派问答或审批 takeover。
- packages/client/ui-claude-shortcuts/src/client/components/QuestionFlow.tsx：普通问答、多题、多选、自定义输入和取消按钮。
- packages/client/ui-claude-shortcuts/src/client/components/PlanReviewFlow.tsx：plan-review 的批准/拒绝选择面板。
- packages/client/ui-claude-shortcuts/src/client/components/ApprovalFlow.tsx：授权/审批的拒绝、允许一次和键盘确认面板。
- packages/client/ui-claude-shortcuts/src/client/components/ClaudeShortcuts.module.css：问答和审批卡片样式，保持既有可滚动内容区和可见操作区。
- packages/client/ui-claude-shortcuts/src/client/locales.ts：中英文文案和 LocaleNamespaceMap 增强。
- packages/client/ui-claude-shortcuts/tests/browser-plugin.client.spec.ts：apply、slot priority、selector、session 注入和卸载测试。
- packages/client/ui-claude-shortcuts/tests/navigation.client.spec.ts：键盘 reducer 单元测试。
- packages/client/ui-claude-shortcuts/tests/question-flow.client.spec.tsx：问答组件键盘与答案协议测试。
- packages/client/ui-claude-shortcuts/tests/approval-flow.client.spec.tsx：审批组件键盘与答案协议测试。
- apps/web/tests/claude-shortcuts.e2e.ts：Web 端到端键盘行为测试。

修改：

- packages/bundle/web-app/package.json：加入新 client 包 workspace dependency。
- packages/bundle/web-app/cordis.patch.yml：在 ui-user-questions 之后加入稳定 id 的快捷键插件条目。
- apps/web/tests/question-composer.e2e.ts：把至少一个问答确认动作改为键盘路径，保留既有 round-trip 断言。
- apps/web/tests/approval-composer.e2e.ts：把允许一次动作改为 Enter 路径，并覆盖 Esc 任务中断。
- pnpm-lock.yaml：由 pnpm install 更新 workspace importer 和包快照。

## 任务 1：创建 client 包骨架并接入 Web bundle

文件：

- 创建：packages/client/ui-claude-shortcuts/package.json
- 创建：packages/client/ui-claude-shortcuts/tsdown.config.ts
- 创建：packages/client/ui-claude-shortcuts/tsconfig.json
- 创建：packages/client/ui-claude-shortcuts/src/index.ts
- 创建：packages/client/ui-claude-shortcuts/src/invariant.ts
- 创建：packages/client/ui-claude-shortcuts/src/client/index.ts
- 修改：packages/bundle/web-app/package.json
- 修改：packages/bundle/web-app/cordis.patch.yml
- 修改：pnpm-lock.yaml

- [ ] 步骤 1：复制一个现有 client UI 包的 manifest 结构，建立新包的导出和依赖。

  package.json 必须声明：

      name: @deepseek-ai/dsh-client-ui-claude-shortcuts
      main: lib/index.js
      types: lib/types/index.d.ts
      exports: ., ./client, ./invariant, ./src/*, ./package.json
      dsh.client.platform: web
      dsh.client.inject: @deepseek-ai/dsh-client-locale、@deepseek-ai/dsh-client-runtime、@deepseek-ai/dsh-client-ui-conversation、@deepseek-ai/dsh-client-ui-user-questions、@deepseek-ai/dsh-client-ui-primitives、@deepseek-ai/dsh-client-ui-slots
      scripts.bundle: tsdown
      scripts.watch: tsdown --watch

  依赖使用 workspace:^，React、Cordis、runtime、locale、primitives、slots 和 conversation 契约按现有 client 包的 dependencies/peerDependencies 分层。

- [ ] 步骤 2：创建 TypeScript project configuration 和最小入口，使包能被 bundler 解析。

  tsconfig.json 继承 ../../../tsconfig.base.client.json，rootDir 为 src、outDir 为 lib/types，并为 api/remotes、vendor/cordis、locale、runtime、ui-conversation、ui-primitives、ui-slots 添加 project references。src/client/index.ts 先导出 apply 和 inject；src/index.ts 只导出 client 入口的公共类型，不导出测试 fixture 或内部组件。

- [ ] 步骤 3：把包加入 Web bundle。

  在 packages/bundle/web-app/package.json 的 dependencies 中加入新 workspace 包；在 cordis.patch.yml 的 ui-user-questions 条目之后加入：

      - id: ui-claude-shortcuts
        name: '@deepseek-ai/dsh-client-ui-claude-shortcuts'

  使用稳定 id，保证 HMR 和 patch 重载只替换该插件。

- [ ] 步骤 4：安装 workspace 依赖并检查 lockfile 只包含新包相关变化。

  运行：

      cd /Volumes/hydisk/deepseek-harness
      pnpm install --lockfile-only
      git diff -- pnpm-lock.yaml

  预期：lockfile 增加新包 importer/依赖关系，不修改无关包版本。

- [ ] 步骤 5：运行新包的初始 bundle 验证并提交。

  运行：

      pnpm --filter @deepseek-ai/dsh-client-ui-claude-shortcuts run bundle

  预期：生成 lib/index.js、lib/client.js 和类型产物，命令退出码为 0。

- [ ] 步骤 6：Commit。

      git add packages/client/ui-claude-shortcuts packages/bundle/web-app/package.json packages/bundle/web-app/cordis.patch.yml pnpm-lock.yaml
      git commit -m "feat: scaffold Claude shortcut client plugin"

## 任务 2：实现键盘导航 reducer

文件：

- 创建：packages/client/ui-claude-shortcuts/src/client/keyboard/types.ts
- 创建：packages/client/ui-claude-shortcuts/src/client/keyboard/navigation.ts
- 创建：packages/client/ui-claude-shortcuts/tests/navigation.client.spec.ts

- [ ] 步骤 1：先写失败测试，固定纯函数契约。

  测试至少覆盖：

      moveFocus(['option', 'option', 'action'], 0, 1) === 1
      moveFocus(['option', 'option', 'action'], 0, -1) === 2
      resolveKey({ surface: 'question', key: 'ArrowDown', composing: false }) 返回 move
      resolveKey({ surface: 'question', key: 'Enter', composing: true }) 返回 pass
      resolveKey({ surface: 'question', key: 'Enter', repeat: true }) 返回 pass
      resolveKey({ surface: 'question', key: 'Escape' }) 返回 cancel-task
      resolveKey({ surface: 'approval', key: 'Escape' }) 返回 cancel-task
      resolveKey({ surface: 'approval', key: 'Enter' }) 返回 activate

  测试必须确认 approval 的 Escape 不是 answer-rejected。

- [ ] 步骤 2：运行失败测试。

  运行：

      cd /Volumes/hydisk/deepseek-harness
      pnpm exec vitest run packages/client/ui-claude-shortcuts/tests/navigation.client.spec.ts

  预期：因 navigation.ts 尚不存在而失败。

- [ ] 步骤 3：实现最小键盘 reducer。

  固定以下类型和行为：

      type ShortcutSurface = 'question' | 'approval'
      type ShortcutCommand =
        | { kind: 'move'; delta: -1 | 1 }
        | { kind: 'activate' }
        | { kind: 'cancel-task' }
        | { kind: 'pass' }

      function moveFocus(items: readonly FocusItem[], index: number, delta: -1 | 1): number
      function resolveKey(input: KeyInput): ShortcutCommand

  ArrowUp/ArrowDown 循环移动；Enter 在 composition、repeat 或 disabled 时返回 pass；Escape 在两种 surface 都返回 cancel-task。

- [ ] 步骤 4：运行测试确认通过。

  运行同一步骤 2 的 Vitest 命令，预期所有 navigation 测试通过。

- [ ] 步骤 5：Commit。

      git add packages/client/ui-claude-shortcuts/src/client/keyboard packages/client/ui-claude-shortcuts/tests/navigation.client.spec.ts
      git commit -m "feat: add Claude shortcut keyboard reducer"

## 任务 3：接入 composer selector 和 session cancel

文件：

- 创建：packages/client/ui-claude-shortcuts/src/client/contract.ts
- 创建：packages/client/ui-claude-shortcuts/src/client/selectors.ts
- 修改：packages/client/ui-claude-shortcuts/src/client/index.ts
- 修改：packages/client/ui-claude-shortcuts/tests/browser-plugin.client.spec.ts

- [ ] 步骤 1：先写失败的 slot wiring 测试。

  测试 bench 创建真实 Context、SlotRegistry、LocaleRuntime、sessions fake 和 conversation.composer chain declaration。断言：

  - inject 声明 slots、sessions、locale；
  - entry priority 为 -1；
  - approval 和 question 都能匹配；
  - interactions 同时含两者时 question 优先；
  - 空 interactions 和普通 interaction 返回 null；
  - entry.inject(sessionId).cancelTask() 调用对应 session 的 conversation.cancel()；
  - fiber.dispose() 后 entry 从 slot 中移除。

- [ ] 步骤 2：运行失败测试。

  运行：

      pnpm exec vitest run packages/client/ui-claude-shortcuts/tests/browser-plugin.client.spec.ts

  预期：因 selector、组件和注入契约尚未实现而失败。

- [ ] 步骤 3：实现公开契约和纯 selector。

  question 类型复用 @deepseek-ai/dsh-client-ui-user-questions/client 的 QuestionWait/PendingQuestion；approval 不从 ui-conversation 私有路径导入，定义为 PendingWait<'approval'> 的本地别名，并使用公开 approval payload 类型完成回答。

  selector 采用：

      return interactions.find(item => item.kind === 'question')
        ?? interactions.find(item => item.kind === 'approval')
        ?? null

- [ ] 步骤 4：实现 slot registration 和 session 注入。

  在 ctx.slots.inject('conversation.composer', ...) 中注册 entry，设置 priority: -1、locale: 'claudeShortcuts'、select 和按 sessionId 解析的 inject。cancelTask 通过 ctx.sessions.scope(sessionId) 取得 session context，再调用 scope.conversation.cancel()；未知 session 必须抛出包含 session id 的错误。

- [ ] 步骤 5：运行 browser-plugin 测试确认通过。

  运行同一步骤 2 的 Vitest 命令，预期 slot、selector、cancelTask 和 teardown 测试全绿。

- [ ] 步骤 6：Commit。

      git add packages/client/ui-claude-shortcuts/src/client/contract.ts packages/client/ui-claude-shortcuts/src/client/selectors.ts packages/client/ui-claude-shortcuts/src/client/index.ts packages/client/ui-claude-shortcuts/tests/browser-plugin.client.spec.ts
      git commit -m "feat: route Claude shortcuts through composer slot"

## 任务 4：实现任务问答 takeover

文件：

- 创建：packages/client/ui-claude-shortcuts/src/client/components/ClaudeComposer.tsx
- 创建：packages/client/ui-claude-shortcuts/src/client/components/QuestionFlow.tsx
- 创建：packages/client/ui-claude-shortcuts/src/client/components/PlanReviewFlow.tsx
- 创建：packages/client/ui-claude-shortcuts/src/client/components/ClaudeShortcuts.module.css
- 创建：packages/client/ui-claude-shortcuts/src/client/locales.ts
- 创建：packages/client/ui-claude-shortcuts/tests/question-flow.client.spec.tsx
- 修改：packages/client/ui-claude-shortcuts/src/client/contract.ts

- [ ] 步骤 1：先写失败的 React 测试。

  使用 jsdom、Testing Library、真实 PendingWait 和脚本化 respond carrier，覆盖：

  - 第一题默认聚焦第一选项；
  - ArrowDown/ArrowUp 在选项间循环；
  - 单选 Enter 选择并自动进入下一题；
  - 最后一题 Enter 提交完整答案 envelope；
  - 多选 Enter 切换当前选项，提交 action 的 Enter 提交答案；
  - 自定义输入 Enter 推进，Shift+Enter 不推进；
  - IME Enter 和 keyCode 229 不推进；
  - plan-review 使用批准/继续规划选项，不出现普通问答的多题控件；
  - Escape 调用注入的 cancelTask，不调用 PendingQuestion.cancel；
  - cancelTask 失败恢复按钮和错误状态；
  - 显式取消按钮仍调用 PendingQuestion.cancel；
  - respond receipt rejected 时保留 draft 并允许重试。

- [ ] 步骤 2：运行失败测试。

  运行：

      pnpm exec vitest run packages/client/ui-claude-shortcuts/tests/question-flow.client.spec.tsx

  预期：因 takeover 组件尚未存在而失败。

- [ ] 步骤 3：实现 ClaudeComposer 分派和 QuestionFlow。

  ClaudeComposer 根据 matched.kind 渲染 QuestionFlow 或 ApprovalFlow。QuestionFlow 复用 PendingQuestion 的 answer/cancel 协议，按题目索引保存 drafts，使用 reducer 的 FocusItem 管理 option、custom、previous、skip、next/submit。

  组件必须保持现有问答的可访问语义：option 使用 radio/checkbox，操作使用 button，当前项有 aria-selected 或等价的明确状态，卡片根节点带稳定 data-question-key。

- [ ] 步骤 4：实现 PlanReviewFlow。

  使用 ui-user-questions 的 plan review 判断规则，保持 plan Markdown、批准和拒绝/继续规划答案标签原样传回。Plan review 的 Escape 仍走注入的 cancelTask，不走 question cancel receipt。

- [ ] 步骤 5：实现 locale 和 CSS。

  提供 zh/en 的 question、plan、keyboard、cancelling、error 文案；内容滚动区域设置最大高度，操作区保持可见；不使用 document 级事件监听。

- [ ] 步骤 6：运行组件测试确认通过。

  运行同一步骤 2 的 Vitest 命令，预期 question、multi-select、plan review、IME、Esc 和错误恢复测试全绿。

- [ ] 步骤 7：Commit。

      git add packages/client/ui-claude-shortcuts/src/client/components packages/client/ui-claude-shortcuts/src/client/locales.ts packages/client/ui-claude-shortcuts/src/client/contract.ts packages/client/ui-claude-shortcuts/tests/question-flow.client.spec.tsx
      git commit -m "feat: add keyboard-driven question takeover"

## 任务 5：实现授权/审批 takeover

文件：

- 创建：packages/client/ui-claude-shortcuts/src/client/components/ApprovalFlow.tsx
- 创建：packages/client/ui-claude-shortcuts/tests/approval-flow.client.spec.tsx
- 修改：packages/client/ui-claude-shortcuts/src/client/components/ClaudeShortcuts.module.css
- 修改：packages/client/ui-claude-shortcuts/src/client/locales.ts

- [ ] 步骤 1：先写失败的审批组件测试。

  使用 PendingWait<'approval'> 和脚本化 approval respond，断言：

  - 默认焦点是允许一次；
  - ArrowUp/ArrowDown 在拒绝和允许一次之间切换；
  - Enter 在允许一次上回传 allowed-once；
  - Enter 在拒绝上回传 rejected；
  - Escape 调用 cancelTask，respond 不收到 rejected；
  - Enter repeat、cancel 中和 answer 中的重复动作都被忽略；
  - answer receipt 拒绝后按钮恢复并显示错误。

- [ ] 步骤 2：运行失败测试。

  运行：

      pnpm exec vitest run packages/client/ui-claude-shortcuts/tests/approval-flow.client.spec.tsx

  预期：因 ApprovalFlow 尚未存在而失败。

- [ ] 步骤 3：实现 ApprovalFlow。

  使用本地 ApprovalWait = PendingWait<'approval'> 和本地 response wrapper，避免依赖 ui-conversation 的未公开 PendingApproval 导出。操作状态为 reject/allow-once，默认 allow-once，高亮项由 navigation reducer 驱动。

  Escape 必须执行 cancelTask()，而不是调用 approval.answer('rejected')。回答调用成功后锁住两个按钮，直到 carrier 解析并卸载。

- [ ] 步骤 4：补齐审批卡片可访问性和布局。

  根节点带稳定 data-approval-key，正文区域带 data-approval-scroll 和可聚焦滚动语义；两个操作按钮在短视口下仍可见。

- [ ] 步骤 5：运行测试确认通过并提交。

  运行同一步骤 2 的 Vitest 命令，预期审批键盘、cancelTask 和错误恢复测试全绿。

      git add packages/client/ui-claude-shortcuts/src/client/components/ApprovalFlow.tsx packages/client/ui-claude-shortcuts/src/client/components/ClaudeShortcuts.module.css packages/client/ui-claude-shortcuts/src/client/locales.ts packages/client/ui-claude-shortcuts/tests/approval-flow.client.spec.tsx
      git commit -m "feat: add keyboard-driven approval takeover"

## 任务 6：验证 Web bundle 的真实组合与键盘回归

文件：

- 创建：apps/web/tests/claude-shortcuts.e2e.ts
- 修改：apps/web/tests/question-composer.e2e.ts
- 修改：apps/web/tests/approval-composer.e2e.ts
- 视实际 ARIA 变化更新：apps/web/tests/snapshots/question-composer/*、apps/web/tests/snapshots/approval-composer/*

- [ ] 步骤 1：先添加问答键盘 E2E 断言。

  在既有 question-composer 场景中，用 locator.focus() + press('ArrowDown') + press('Enter') 完成至少一个选项选择；保留最终答案事件和 regular composer restored 断言。多选场景使用 Enter 切换选项，再用键盘操作提交。

- [ ] 步骤 2：先添加审批键盘 E2E 断言。

  在既有 approval-composer 场景中聚焦允许一次按钮并 press('Enter')，保留 approval/decided 的 allowed-once 事件断言。

- [ ] 步骤 3：添加独立 Esc 中断场景。

  新场景复用 launchWebScaffold、question/approval fixture 和 session/event 监听：

  - question pending 出现后 press('Escape')，断言出现 turn/end reason interrupted，question answer 没有提交；
  - approval pending 出现后 press('Escape')，断言出现 turn/end reason interrupted，approval/decided 不含 rejected；
  - 两个场景都断言 takeover 卸载、普通 textarea 恢复可用、页面没有 console error/warning。

- [ ] 步骤 4：运行 focused Web E2E。

  运行：

      cd /Volumes/hydisk/deepseek-harness
      pnpm exec vitest run apps/web/tests/question-composer.e2e.ts apps/web/tests/approval-composer.e2e.ts apps/web/tests/claude-shortcuts.e2e.ts

  预期：键盘确认、审批结果、Esc 中断和普通 composer 恢复全部通过。

- [ ] 步骤 5：仅在渲染语义确实改变时更新 snapshots，并重新运行 focused E2E。

  预期：不因 CSS class hash 或无关页面变化批量刷新 golden；稳定 ARIA 变化必须对应本插件的可见行为。

- [ ] 步骤 6：Commit。

      git add apps/web/tests/question-composer.e2e.ts apps/web/tests/approval-composer.e2e.ts apps/web/tests/claude-shortcuts.e2e.ts apps/web/tests/snapshots/question-composer apps/web/tests/snapshots/approval-composer
      git commit -m "test: cover Claude shortcut Web interactions"

## 任务 7：全量验证、打包和收尾

文件：

- 修改：仅在验证需要时修改前述实现/测试文件；不引入无关格式化。

- [ ] 步骤 1：运行新包类型和 bundle 验证。

  运行：

      cd /Volumes/hydisk/deepseek-harness
      pnpm --filter @deepseek-ai/dsh-client-ui-claude-shortcuts run bundle
      pnpm exec tsc --noEmit -p packages/client/ui-claude-shortcuts/tsconfig.json

  预期：bundle 和 TypeScript 检查退出码均为 0。

- [ ] 步骤 2：运行新包全部单元/组件测试。

  运行：

      pnpm exec vitest run packages/client/ui-claude-shortcuts/tests

  预期：navigation、browser-plugin、question-flow、approval-flow 全绿。

- [ ] 步骤 3：运行既有问答/审批回归测试。

  运行：

      pnpm exec vitest run packages/client/ui-user-questions/tests packages/client/ui-conversation/tests

  预期：既有核心包测试不受新插件源码修改影响，全部通过。

- [ ] 步骤 4：运行 focused Web E2E 和包结构检查。

  运行：

      pnpm exec vitest run apps/web/tests/question-composer.e2e.ts apps/web/tests/approval-composer.e2e.ts apps/web/tests/claude-shortcuts.e2e.ts packages/bundle/web-app/tests

  预期：插件在真实 Web bundle 中生效，普通输入、问答、审批和任务中断都通过。

- [ ] 步骤 5：检查发布产物内容。

  运行：

      pnpm --filter @deepseek-ai/dsh-client-ui-claude-shortcuts pack --pack-destination /tmp/dsh-claude-shortcuts-pack
      tar -tzf /tmp/dsh-claude-shortcuts-pack/deepseek-ai-dsh-client-ui-claude-shortcuts-*.tgz

  预期：tarball 包含 lib/index.js、lib/client.js、lib/invariant.js、lib/types/**/*.d.ts 和 package.json，不包含 tests、源码 fixture 或本地构建缓存。

- [ ] 步骤 6：检查最终 diff 和仓库状态。

  运行：

      git diff --check
      git status --short
      git log --oneline -8

  预期：无空白错误；变更只属于新 client 插件、Web bundle 接入、对应测试和 lockfile；当前工作区其他用户改动不被回退或覆盖。

- [ ] 步骤 7：Commit 验证相关的必要修正。

      git add packages/client/ui-claude-shortcuts packages/bundle/web-app apps/web/tests pnpm-lock.yaml
      git commit -m "chore: verify Claude shortcut plugin package"

## 规格覆盖检查

- 独立 client 插件和不修改核心包：任务 1、任务 3、任务 4、任务 5。
- question selector、approval selector 和 question 优先级：任务 3。
- 单选、多选、自定义输入、多题、plan review：任务 2、任务 4。
- approval 默认允许、上下键、Enter 允许/拒绝：任务 2、任务 5。
- question/approval 的 Esc 都调用 conversation.cancel()：任务 3、任务 4、任务 5、任务 6。
- IME、重复 Enter、错误恢复和卸载清理：任务 2、任务 4、任务 5。
- 普通聊天不受影响：任务 3、任务 6、任务 7。
- bundle 接入、锁文件、发布产物和真实 Web 验证：任务 1、任务 6、任务 7。
