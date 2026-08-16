# @travel-note/dsh-companion

DSH Companion 鲸鱼 Skill/CLI 插件前端：默认显示右下角鲸鱼（二次元娘）悬浮按钮，用户继续使用 DSH 当前对话框输入；DSH Skill 调用 Go 仓库的 Travel Note Skill CLI，本插件接收 Host 投影的 CLI 状态并把鲸鱼回复反馈到当前 DSH 对话。

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

本前端 app **不负责** Token、CLI 执行和最终对话消息持久化；不创建第二个聊天输入框，不维护独立 SSE 会话。

## 安装前置条件（必须按序满足）

安装/激活前端 DSH 插件前，必须先满足：

1. **hyc CLI 可用**：`command -v hyc` 命中（系统入口 `~/.local/bin/hyc`）。
2. **DSH 技能已安装**：`$DSH_HOME/skills/` 下存在 `hy-companion` 与 `hy-companion-*`
   （在 `travel-note-go` 仓库执行 `bash build/skill/install-dsh.sh`）。

任一缺失时按顺序先补齐（先 CLI、再技能、再插件），不得跳步。顺序与验证见
`travel-note-go/docs/hy-companion-dsh-install.md`。

### 安装方式与 `private: true`

本包通过 **tarball / 本地路径**安装，不发布到 npm registry：

```bash
dsh plugin add ./apps/dsh-companion            # 本地路径安装
# 或先 pnpm pack 再安装 tarball：
pnpm --filter @travel-note/dsh-companion pack
dsh plugin add ./travel-note-dsh-companion-*.tgz
```

因此 `package.json` 保留 `"private": true`——它仅禁止 `npm publish`，不影响 `dsh plugin add`
对本地路径 / tarball 的安装。

## 开发

```bash
pnpm --filter @travel-note/dsh-companion test -- --run
pnpm --filter @travel-note/dsh-companion typecheck
pnpm --filter @travel-note/dsh-companion lint
pnpm --filter @travel-note/dsh-companion build      # library build → lib/
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
（idle/listening/thinking/speaking）与 `apps/web` 的 Phaser 角色状态机
（`COMPANION_EMOTIONS`、`CHARACTER_EMOTION_MAP`、`EXPRESSION_TO_FRAME`）逐项一致；
鲸鱼娘形象帧位于 `public/deepseek-girl-phaser/`（atlas + `frames/*.png`），
build 时由 `scripts/copy-assets.mjs` 拷贝到 `lib/deepseek-girl-phaser/`（host 半
`defaultAssetRoot()` 据此提供静态路由）；`resolveWhaleFrame(status, emotion)` 负责选择当前表情帧。

## 运行环境

- React 19（peer dependency），TypeScript 5.6，Vite 6，Vitest 3 + Testing Library。
- 仅浏览器环境；不依赖 Next.js、SSR 或 App Router。
