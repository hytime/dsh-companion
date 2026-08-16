# 插件配置页面(设置 → Plugins → dsh-companion)设计

## 目标

在 DSH 设置页面(Plugins 区)为 dsh-companion 插件提供配置卡,包含三个区块:
1. **账号与密码**:hyc 账号登录 / 注册 / 登出,状态展示
2. **基本配置**:旅伴名称、用户称呼、好感度显示开关、回复气泡显示开关
3. **事件提醒**:buddy 提醒总开关、提醒间隔、定时陪伴事件列表(查询/启停/删除)

参照 travel-note-agent 的配置做法(account-auth-gate 登录表单、profile-settings-modal 分组表单)与 DSH 内置插件设置卡(settings.plugin.item Slot)实现。

## 背景与约束(已核实)

- **DSH 设置扩展点**:`settings.plugin.item` Slot(list, root)——插件配置卡,注册 `{ id, order, label }`;DSH 内置 bash / web-search / agent-loop 用它。实现模式:`PropsRuntime<'settings.plugin.item'>` + Controller 表单动作(state/save/discard/edit/reset)。
- **hyc 认证**:`hyc login` / `hyc register` 均为**终端交互式**(ioctl 读 /dev/tty,stdin 管道被拒);JWT 存系统 Keychain/Secret Service(Go 内部实现,插件无法代写)。已实测 `printf 'u\np\n' | hyc login` → `inappropriate ioctl for device`。
- **登录方案(用户确认 A)**:插件用 `script -q /dev/null hyc login` 分配伪终端喂入账号/密码;`hyc register` 同理。macOS/Linux 可用。
- **hyc schedule**:list / enable / disable / delete / understand 命令齐全,覆盖事件提醒操作。
- **现有插件结构**:无 client↔host RPC,需新增;配置持久化到 `~/.hy-companion/config.json`(与 last-reply.json 同目录)。

## 架构

```
DSH 设置 → Plugins → dsh-companion 配置卡(settings.plugin.item)
        │
        ├─ Client:React 三区块表单(参照 travel-note-agent 分组风格)
        │    └─ host.call('companion.*', ...)  ← 包私有 JSON RPC
        │
        └─ Host:harness.handle RPC + 持久化
             ├─ companion.authStatus   → hyc personality get 退出码探测 JWT
             ├─ companion.login        → script 伪终端喂 hyc login(账号/密码)
             ├─ companion.register     → script 伪终端喂 hyc register(账号/密码)
             ├─ companion.logout       → hyc logout
             ├─ companion.getConfig    → 读 ~/.hy-companion/config.json
             ├─ companion.setConfig    → 写配置(合并写)
             ├─ companion.listSchedules  → hyc schedule list
             ├─ companion.enableSchedule / disableSchedule / deleteSchedule → hyc schedule enable/disable/delete
             └─ 配置消费:host 读 config 注入 companionName/userCallName 到现有 widget;
                showAffection/showBubble/reminderEnabled 控制对应渲染与 buddy 推送
```

## 配置 Schema(`~/.hy-companion/config.json`)

```json
{
  "companionName": "旅伴",
  "userCallName": "造物主",
  "showAffection": true,
  "showBubble": true,
  "reminderEnabled": true,
  "reminderIntervalMin": 1
}
```

- 缺省值如上;文件不存在时返回缺省,不报错
- `setConfig` 深合并(部分字段更新),只写这 6 个字段
- 登录/注册/登出不写入 config(凭据只在 Keychain,由 hyc 管理)
- **`reminderIntervalMin` 消费语义**:该值 = host buddy 轮询频率(分钟),轮询间隔 = max(30s, reminderIntervalMin × 60s);缺省 1 分钟 → 轮询间隔 60s(非法值兜底 30s)

## UI 布局(三区块)

```
┌─ dsh-companion 配置 ────────────────────────┐
│ ① 账号与密码                                  │
│   [登录] [注册]  ← 模式切换                   │
│   账号 [______]  密码 [______]                │
│   确认密码 [______]  (注册模式)               │
│   状态:已登录 / 未登录                       │
│   [提交] [登出]  ← 提交中禁用,错误原样显示    │
│ ② 基本配置                                    │
│   旅伴名称 [____]  用户称呼 [____]            │
│   ☑ 显示好感度   ☑ 显示回复气泡               │
│ ③ 事件提醒                                    │
│   ☑ 启用 buddy 提醒  间隔 [1] 分钟           │
│   定时事件列表:标题/时间 [启用|停用][删除]    │
│   [保存配置]  ✓ 已保存 / ✗ 错误信息           │
└───────────────────────────────────────────────┘
```

### 表单逻辑(参照 travel-note-agent account-auth-gate)

- 登录模式:账号/密码非空才可提交
- 注册模式:账号/密码非空、密码 ≥ 8 位、两次密码一致(前端校验,失败不发起请求)
- 提交中 loading 禁用按钮;hyc 错误原样展示
- 成功 → 刷新 authStatus

## 数据流

```
页面加载 → companion.authStatus + companion.getConfig + companion.listSchedules(并行)
   → 渲染三区块(状态/配置值/事件列表)
登录/注册提交 → companion.login/register → 刷新 authStatus
保存配置 → companion.setConfig → ✓ 已保存
事件启停/删除 → companion.enableSchedule/... → 刷新列表
```

## 错误处理

- login/register:hyc 非零退出或错误输出 → 原样返回错误信息,不清空表单
- script 不存在(非 macOS/Linux)→ 明确错误「当前平台不支持页面内登录,请在终端运行 hyc login」
- config 读写失败 → 返回错误,UI 展示
- schedule 命令失败 → 列表区显示错误,不阻塞其他区块

## 测试

- Host 单测(注入式):authStatus 退出码映射、login/register 命令构造(script + 账号密码转义)、config 缺省/深合并/读写失败、schedule 命令构造与输出解析
- Client 单测:三区块渲染、模式切换校验(密码长度/两次一致)、提交 loading 态、错误展示、保存成功提示
- 现有 119 插件测试不回归

## 范围(非目标)

- 不改 hyc/travel-note-go(script 方案绕过交互限制;hyc 加参数留作后续增强)
- 不做注册后的自动登录跳转等额外流程
- 不写凭据到 config 或任何 DSH 内部存储

## 文档

- README 快速开始补充「配置插件(登录/基本配置/事件提醒)」小节
- AGENTS.md 环境注意事项补充 config 文件位置(可选)
