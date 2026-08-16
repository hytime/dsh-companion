# 插件配置页面(设置 → Plugins → dsh-companion)实现计划

> **面向 AI 代理的工作者:** 必需子技能:使用 superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框(`- [ ]`)语法来跟踪进度。

**目标:** 在 DSH 设置 → Plugins 区为 dsh-companion 注册配置卡,含账号(登录/注册/登出)、基本配置(名称/称呼/开关)、事件提醒(开关/间隔/定时事件管理)三区块;Host 提供 `companion.*` 包私有 RPC 与 `~/.hy-companion/config.json` 持久化。

**架构:** Client 端注册 `settings.plugin.item`(id: dsh-companion)渲染三区块表单,经 `host.call('companion.*')` 调 Host RPC;Host 端 `harness.handle` 注册方法,内部复用「配置存储模块(settings-store)+ 命令执行模块(auth/schedule)」,命令通过 `script -q /dev/null hyc ...` 伪终端与 spawnSync 执行。参照 travel-note-agent(account-auth-gate 登录校验、profile-settings-modal 分组表单)与 DSH 内置 BashCard(PluginCard/ValueField 模式)。

**技术栈:** TypeScript、React、Cordis dual-face 插件、vitest、spawnSync、script 伪终端。

**规格:** `docs/superpowers/specs/2026-08-16-plugin-settings-design.md`

---

## 文件结构

- 创建:`packages/dsh-companion/src/host/settings-store.ts` — 配置读写(缺省/深合并/持久化)
- 创建:`packages/dsh-companion/src/host/settings-store.test.ts`
- 创建:`packages/dsh-companion/src/host/companion-commands.ts` — auth/schedule 命令执行(script 伪终端、spawnSync、输出解析)
- 创建:`packages/dsh-companion/src/host/companion-commands.test.ts`
- 创建:`packages/dsh-companion/src/host/settings-rpc.ts` — `companion.*` RPC handler 组装(store + commands)
- 创建:`packages/dsh-companion/src/host/settings-rpc.test.ts`
- 创建:`packages/dsh-companion/src/client/settings-card.tsx` — 配置卡 UI(settings.plugin.item)
- 创建:`packages/dsh-companion/src/client/settings-card.test.tsx`
- 修改:`packages/dsh-companion/src/host/plugin.ts` — apply 注册 RPC + 配置消费(名称/称呼/开关注入)
- 修改:`packages/dsh-companion/src/client/plugin.tsx` — 注册 settings.plugin.item 卡
- 修改:`packages/dsh-companion/package.json` — 新增 peer/dev 依赖 `@deepseek-ai/dsh-client-ui-slots`
- 修改:`README.md` — 快速开始补「配置插件」小节

---

## 任务 1:Host 配置存储模块(settings-store)

**文件:**
- 创建:`packages/dsh-companion/src/host/settings-store.ts`
- 创建:`packages/dsh-companion/src/host/settings-store.test.ts`

- [ ] **步骤 1:编写失败测试**(注入式,模式同 prereq-self-heal.test.ts)

```ts
// 用例:
// 1. 文件不存在 → 返回缺省 { companionName:'旅伴', userCallName:'造物主', showAffection:true, showBubble:true, reminderEnabled:true, reminderIntervalMin:60 }
// 2. 文件存在 → 读取并解析;非法 JSON → 返回缺省(不抛出)
// 3. setConfig 深合并:只更新传入字段,其余保留
// 4. setConfig 写入文件成功;写入失败(注入 writeFile 抛错)→ 返回错误不抛出
// 5. configPath 可注入(默认 ~/.hy-companion/config.json)
```

- [ ] **步骤 2:运行确认失败** → `Cannot find module './settings-store'`
- [ ] **步骤 3:实现 settings-store.ts**

```ts
// 导出:
// interface CompanionSettings { companionName: string; userCallName: string; showAffection: boolean; showBubble: boolean; reminderEnabled: boolean; reminderIntervalMin: number }
// const DEFAULT_SETTINGS: CompanionSettings
// async function readSettings({ configPath? }): Promise<CompanionSettings>  // 缺省兜底
// async function writeSettings(settings: Partial<CompanionSettings>, { configPath? }): Promise<{ ok: boolean; error?: string }>
// 读写用 node:fs/promises;目录不存在时 mkdir -p;JSON 深合并(partial 覆盖)
```

- [ ] **步骤 4:运行确认全绿**
- [ ] **步骤 5:Commit** → `feat(dsh-companion): 新增配置存储模块(companion 设置持久化)`

## 任务 2:Host 认证与 schedule 命令执行模块(companion-commands)

**文件:**
- 创建:`packages/dsh-companion/src/host/companion-commands.ts`
- 创建:`packages/dsh-companion/src/host/companion-commands.test.ts`

- [ ] **步骤 1:编写失败测试**(注入 run/spawnSync,模式同 installMissing 测试)

```ts
// 用例:
// 1. authStatus:注入 run('hyc',['personality','get']) 退出 0 → 'authenticated';非 0 → 'unauthenticated';ENOENT → 'unauthenticated'
// 2. login 命令构造:注入 run → 断言调用 ['script','-q','/dev/null','hyc','login'],且通过 input 喂入 "账号\n密码\n"
//    (实现方式:spawnSync 带 input 参数;或 script 从 stdin 读——按实际可用性裁定,测试注入 run(cmd,args,opts) 断言 opts.input 内容)
// 3. register 同理(hyc register)
// 4. logout → run('hyc',['logout'])
// 5. listSchedules → run('hyc',['schedule','list']) 输出 JSON → 解析为数组;输出非 JSON → 返回错误
// 6. enableSchedule(id) → ['hyc','schedule','enable',id];disable/delete 同理
// 7. script 不可用(注入 ENOENT)→ 返回「当前平台不支持页面内登录,请在终端运行 hyc login」
```

- [ ] **步骤 2:运行确认失败**
- [ ] **步骤 3:实现 companion-commands.ts**

```ts
// 导出(全部依赖注入 run 便于测试,默认 spawnSync):
// async function checkAuthStatus({ run }): Promise<'authenticated'|'unauthenticated'>
// async function loginWithCredentials(username, password, { run }): Promise<{ ok: boolean; error?: string }>  // script 伪终端
// async function registerWithCredentials(username, password, { run }): Promise<{ ok: boolean; error?: string }>
// async function logout({ run }): Promise<{ ok: boolean; error?: string }>
// async function listSchedules({ run }): Promise<{ ok: boolean; items?: ScheduleItem[]; error?: string }>
// async function scheduleAction(action: 'enable'|'disable'|'delete', id, { run }): Promise<{ ok: boolean; error?: string }>
// script 登录实现要点:spawnSync('script', ['-q','/dev/null','hyc','login'], { input: `${username}\n${password}\n`, encoding:'utf8' });
//   若 ENOENT → 平台不支持错误;hyc 输出含 error 字段或退出非 0 → 原样透传错误
```

- [ ] **步骤 4:运行确认全绿**
- [ ] **步骤 5:Commit** → `feat(dsh-companion): 新增认证与 schedule 命令执行模块(script 伪终端登录)`

## 任务 3:Host RPC 注册(settings-rpc + harness.handle)

**文件:**
- 创建:`packages/dsh-companion/src/host/settings-rpc.ts`
- 创建:`packages/dsh-companion/src/host/settings-rpc.test.ts`
- 修改:`packages/dsh-companion/src/host/plugin.ts`(apply 中注册)

- [ ] **步骤 1:查询 harness 服务契约**(在插件宿主环境内)

用 cordis_inspect_query(platform=host, Service.listService, service='harness')确认 `harness.handle(method, handler)` 的精确签名与 package 隔离语义;若签名与预期不同,以 Inspect 结果为准并记录到报告。

- [ ] **步骤 2:实现 settings-rpc.ts**

```ts
// 导出:
// interface RpcDeps { store: { readSettings; writeSettings }; commands: {...} }
// function registerSettingsRpc(ctx, deps): void
//   → ctx 上 harness.handle('companion.authStatus', ...)
//   → harness.handle('companion.login', async ({username,password}) => ...)
//   → harness.handle('companion.register', ...)
//   → harness.handle('companion.logout', ...)
//   → harness.handle('companion.getConfig', ...)
//   → harness.handle('companion.setConfig', async (partial) => ...)
//   → harness.handle('companion.listSchedules', ...)
//   → harness.handle('companion.enableSchedule'|'disableSchedule'|'deleteSchedule', async ({id}) => ...)
// 所有 handler 返回 { ok: boolean, ...data, error? } 结构;不抛出(错误进 error 字段)
```

- [ ] **步骤 3:编写 RPC 测试**(注入 store/commands 假实现)

```ts
// 用例:
// 1. 每个方法名都注册到 harness.handle(注入 ctx 记录调用)
// 2. login handler 传参透传给 commands.loginWithCredentials
// 3. setConfig 透传 store.writeSettings 并返回结果
// 4. handler 异常 → 返回 { ok:false, error } 不抛出
```

- [ ] **步骤 4:plugin.ts 接入**

在 apply 中调用 `registerSettingsRpc(ctx, { store: realStore, commands: realCommands })`;harness 不可用时(容错)打日志不崩。

- [ ] **步骤 5:验证** → typecheck + 全量插件测试(119 + 新增)
- [ ] **步骤 6:Commit** → `feat(dsh-companion): 注册 companion.* 配置 RPC(harness.handle)`

## 任务 4:Client 配置卡 UI(settings.plugin.item)

**文件:**
- 创建:`packages/dsh-companion/src/client/settings-card.tsx`
- 创建:`packages/dsh-companion/src/client/settings-card.test.tsx`
- 修改:`packages/dsh-companion/src/client/plugin.tsx`(注册卡)
- 修改:`packages/dsh-companion/package.json`(依赖 `@deepseek-ai/dsh-client-ui-slots`)

- [ ] **步骤 1:确认 client 扩展依赖与 Slot 注册方式**

用 cordis_inspect_query(platform=client, Service.listService)查 `@deepseek-ai/dsh-client-ui-slots` 的 PropsRuntime/PropsLocale 类型来源与 slot 注册 API(参考 BashCard:注册于 settings.plugins.tab 下的 settings.plugin.item);将 `@deepseek-ai/dsh-client-ui-slots` 加入 package.json 的 peerDependencies 与 devDependencies(版本参照 DSH 内置 ui-settings-plugins 的依赖)。

- [ ] **步骤 2:编写失败测试**

```tsx
// settings-card.test.tsx(注入 host.call 假实现):
// 1. 渲染三区块标题(账号与密码 / 基本配置 / 事件提醒)
// 2. 登录模式:账号密码为空点提交 → 错误「请输入账号和密码」,不调用 host.call
// 3. 注册模式:密码 < 8 位 → 错误;两次密码不一致 → 错误;不调用 host.call
// 4. 提交成功(注入 host.call 返回 ok)→ 状态刷新为已登录
// 5. 基本配置:渲染名称/称呼输入框与两个开关,保存调用 host.call('companion.setConfig', {...})
// 6. 事件提醒:渲染开关/间隔输入/事件列表(注入 listSchedules 返回 2 项),启停/删除按钮调用对应方法
// 7. 保存成功提示「已保存」;错误展示 error 文本
```

- [ ] **步骤 3:运行确认失败**
- [ ] **步骤 4:实现 settings-card.tsx**

```tsx
// 参照 travel-note-agent 分组表单:FieldGroup 风格分区、输入框/复选框/按钮样式沿用 companion.module.css 或新增 class
// host.call 用法(按步骤 1 Inspect 结果):const result = await host.call('companion.authStatus', {})
// 三区块组件内聚于一个文件;数据加载(useEffect 并行 getConfig/authStatus/listSchedules)
```

- [ ] **步骤 5:client/plugin.tsx 注册卡**

```tsx
// 在 client apply 中注册 settings.plugin.item 条目:
//   ctx.slots.register('settings.plugin.item', { id: 'dsh-companion', order: 100, label: 'dsh-companion', component: SettingsCard })
// 注册方式以 Inspect 结果为准(参考 DSH ui-settings-plugins 的 entry 写法)
```

- [ ] **步骤 6:运行确认全绿 + typecheck**
- [ ] **步骤 7:Commit** → `feat(dsh-companion): 新增设置页配置卡(账号/基本配置/事件提醒)`

## 任务 5:配置消费接入(plugin.ts 注入 widget)

**文件:**
- 修改:`packages/dsh-companion/src/host/plugin.ts`

- [ ] **步骤 1:apply 启动时读取配置并注入**

```ts
// 在 apply 中 await readSettings({}) → settings
// 现有 whale widget 渲染处:companionName=settings.companionName,userCallName=settings.userCallName
// showAffection=false → 不传 affection;showBubble=false → 抑制回复气泡推送(latestReply 置空)
// reminderEnabled=false → buddy 推送抑制(30s 轮询跳过)
// 配置变化后由 Client setConfig 触发 → 通过现有状态流(SSE/事件)重新读取(简单实现:setConfig 成功后 host 主动重读并推送新状态)
```

- [ ] **步骤 2:验证** → typecheck + 插件测试全绿(含既有 98 项不回归)
- [ ] **步骤 3:Commit** → `feat(dsh-companion): 配置消费(名称/称呼/显示开关/提醒开关接入 widget)`

## 任务 6:文档 + 全量验证

**文件:**
- 修改:`README.md`

- [ ] **步骤 1:README 补「配置插件」小节**

```markdown
## ⚙️ 配置插件

DSH 设置 → Plugins → dsh-companion:

- 账号与密码:hyc 账号登录 / 注册 / 登出(页面内完成,凭据存系统 Keychain)
- 基本配置:旅伴名称、用户称呼、好感度 / 回复气泡显示开关
- 事件提醒:buddy 提醒开关与间隔、定时陪伴事件管理(启停 / 删除)
```

- [ ] **步骤 2:全量验证**

运行:`npm_config_cache=/tmp/npmcheck-cache pnpm -r run typecheck && pnpm -r run test && pnpm exec vitest run --config vitest.packages.config.ts && pnpm -r run build`
预期:全部通过(插件 119 + 新增用例、skills 10、CLI 1、根级 13)

- [ ] **步骤 3:Commit** → `docs: README 补插件配置说明`

---

## 自检记录

- **规格覆盖度:** 三区块(账号/基本/事件)对应任务 1-4;RPC 对应任务 3;配置消费对应任务 5;文档对应任务 6。规格中「hyc schedule list/enable/disable/delete」由任务 2/3 覆盖;「script 伪终端」由任务 2 覆盖;「config 缺省/深合并」由任务 1 覆盖。✅
- **占位符扫描:** 无 TODO;`harness.handle`/`settings.plugin.item` 注册的确切签名标注「以 Inspect 结果为准」,是执行期查询而非占位符。✅
- **类型一致性:** `CompanionSettings` 字段在任务 1 定义,任务 3/5 复用同一类型;`companion.*` 方法名在任务 3 注册、任务 4 调用,命名一致。✅
