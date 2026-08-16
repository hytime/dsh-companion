# @hytime/dsh-companion

DSH Companion 鲸鱼 Skill/CLI 前端插件（dual-face Cordis 插件），发布到 npm 公共 registry。

默认在 DSH 右下角显示鲸鱼（二次元娘）悬浮按钮，用户继续使用 DSH 当前对话框输入；DSH Skill 调用 hyc CLI，本插件接收 Host 投影的 CLI 状态并把鲸鱼回复反馈到当前 DSH 对话。

## 数据流

```text
DSH 当前对话框 ──用户输入──▶ Skill 触发
                              │
                              ▼
                    DSH Host 调用 Go CLI（hyc）
                    （凭据 / 超时 / 取消 / 结构化结果）
                              │
                              ▼
                    结构化结果（text / emotion / status）
                              │
          ┌───────────────────┴───────────────────┐
          ▼                                       ▼
   当前 DSH 对话展示最终文本              鲸鱼悬浮窗反馈状态
   （唯一输出位置）                    （idle/connecting/thinking/
                                        replying/success/error/cancelled
                                         + 表情帧切换）
```

本插件**不负责** Token、CLI 执行和最终对话消息持久化；不创建第二个聊天输入框，不维护独立 SSE 会话。

## 安装前置条件（必须按序满足）

安装/激活本插件前，必须先满足：

1. **hyc CLI 可用**：`command -v hyc` 命中（系统入口 `~/.local/bin/hyc`）。
2. **DSH 技能已安装**：`$DSH_HOME/skills/` 下存在 `hy-companion` 与 `hy-companion-*`（先安装 CLI，再执行技能安装器写入 `$DSH_HOME/skills`）。

任一缺失时按顺序先补齐（先 CLI、再技能、再插件），不得跳步。完整顺序与验证命令见根 README「安装前置依赖」一节。

## 安装

### 发布后

本插件发布到 npm 公共 registry，直接添加：

```bash
dsh plugin add @hytime/dsh-companion
```

### 本地开发（tarball）

本地开发使用 tarball 安装，避免 `link:` 目录安装带来的双实例 / 产物目录变化 / 可复现性差问题：

```bash
# 1) 构建插件产物（生成 lib/ 与鲸鱼帧资源）
pnpm --filter @hytime/dsh-companion run build
#    或监听模式：
pnpm --filter @hytime/dsh-companion run watch

# 2) 打成 tarball
pnpm --filter @hytime/dsh-companion run pack
#    产物：packages/dsh-companion/hytime-dsh-companion-0.1.0.tgz

# 3) 装进 DSH（把 *.tgz 替换为实际文件名）
dsh plugin add ./packages/dsh-companion/hytime-dsh-companion-0.1.0.tgz

# 4) 重启 DSH 使插件生效
```

> 发布包名为 `@hytime/dsh-companion`（scope 已定型，无需再作替换）。仅当整体更换 scope 时，才运行根目录的 `node scripts/rename-package.mjs <新scope>` 全局替换。

## 开发命令

```bash
pnpm --filter @hytime/dsh-companion run typecheck
pnpm --filter @hytime/dsh-companion run lint
pnpm --filter @hytime/dsh-companion run test
pnpm --filter @hytime/dsh-companion run build      # library build → lib/
pnpm --filter @hytime/dsh-companion run pack
```

## 公开 API

- `WhaleFloatingWidget`（props：`status`、`emotion?`、`lastError?`、`companionName?`、
  `buddyTitle?`、`buddyMessage?`、`onReply?`、`onClose?`、`frameSrc?`）
- `createSkillStatusAdapter(source, onChange?)` 与 `SkillStatusSource` 接口
- 纯 JSON 类型与函数：`TravelNoteSkillInput`、`TravelNoteCLIResult`、`SkillStatus`、
  `CompanionEmotion`、`CharacterActivity`、`parseTravelNoteCLIResult`、
  `normalizeSkillStatus`、`normalizeCompanionEmotion`、`skillStatusToActivity`、
  `EMOTION_TO_FRAME`、`resolveWhaleFrame` 等
- 样式：由组件内联注入（CSS Modules，构建时编译进 `lib/client.js`）

不导出 mock、CLI 执行器或 DSH live 对象。

## 表情与 Phaser 对齐

`CompanionEmotion`（idle/thinking/talking/happy/shy/surprised）、`CharacterActivity`
（idle/listening/thinking/speaking）与既有 Companion 的 Phaser 角色状态机
（`COMPANION_EMOTIONS`、`CHARACTER_EMOTION_MAP`、`EXPRESSION_TO_FRAME`）逐项一致；
鲸鱼娘形象帧位于 `public/deepseek-girl-phaser/`（atlas + `frames/*.png`），
build 时由 `scripts/copy-assets.mjs` 拷贝到 `lib/deepseek-girl-phaser/`（host 半
`defaultAssetRoot()` 据此提供静态路由）；`resolveWhaleFrame(status, emotion)` 负责选择当前表情帧。

## 运行环境

- React 19（peer dependency），TypeScript 5.6，Vite 6，Vitest 3 + Testing Library。
- 仅浏览器环境；不依赖 Next.js、SSR 或 App Router。
