# 插件前置自愈(hyc CLI + 技能自动安装)实现计划

> **面向 AI 代理的工作者:** 必需子技能:使用 superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框(`- [ ]`)语法来跟踪进度。

**目标:** 插件加载时(apply)自动检查 hyc CLI 与 DSH 技能,缺失则自动安装(`npm i -g @hytime/hyc`、`npm i -g @hytime/hy-companion-skills` + `hy-companion-install`),前置就位后插件功能可用;安装失败只警告给指引,不阻塞插件加载。

**架构:** 新建 `src/host/prereq-self-heal.ts` 模块(检查 + 安装,依赖注入可测),在 `host/plugin.ts` 的 apply 开头同步快速检查、缺失时异步 fire-and-forget 安装。检查口径与 `hy-companion-check` 一致(hyc 探测 ENOENT/非 0;技能为 `$DSH_HOME/skills` 下存在 `hy-companion` 且 `hy-companion-*` ≥ 1)。自动安装仅限自家 `@hytime/*` 包。不做 preinstall/postinstall 钩子(pnpm 阻止,已验证不可行)。

**技术栈:** TypeScript、vitest、Cordis 插件(host half)、spawnSync。

**规格:** `docs/superpowers/specs/2026-08-16-plugin-self-heal-design.md`

---

## 文件结构

- 创建:`packages/dsh-companion/src/host/prereq-self-heal.ts` — 检查 + 安装逻辑(纯逻辑,注入式,无副作用依赖)
- 创建:`packages/dsh-companion/src/host/prereq-self-heal.test.ts` — 注入式单元测试
- 修改:`packages/dsh-companion/src/host/plugin.ts` — apply 开头接入自愈(约 15 行)
- 修改:`README.md` — 「安装前置依赖」章节更新
- 修改:`AGENTS.md` — 红线 2 补充说明(可选)

---

## 任务 1:prereq-self-heal 模块 + 单元测试(TDD)

**文件:**
- 创建:`packages/dsh-companion/src/host/prereq-self-heal.ts`
- 创建:`packages/dsh-companion/src/host/prereq-self-heal.test.ts`

- [ ] **步骤 1:编写失败的测试**

```ts
// prereq-self-heal.test.ts 骨架(注入式,模式同 src/host/status-inference.test.ts)
import { describe, expect, it } from 'vitest';
import { checkPrereqs, installMissing } from './prereq-self-heal';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// checkPrereqs 用例:
// 1. hyc probe 返回 { status: 0 } + skills 目录含 hy-companion 与 hy-companion-chat → { hyc: 'ok', skills: 'ok' }
// 2. hyc probe 抛 ENOENT 错误 → hyc: 'missing'
// 3. hyc probe 返回 { status: 1 } → hyc: 'missing'
// 4. skills 目录不存在 → skills: 'missing'
// 5. skills 目录存在但无 hy-companion → skills: 'missing'
// 6. skills 目录只有 hy-companion 无 hy-companion-* → skills: 'missing'
// installMissing 用例(注入 run):
// 7. missing: ['hyc'] → run 被调用两次:['npm','i','-g','@hytime/hyc'](run 为 hyc 缺失时的安装命令),且只装 hyc 不装 skills
// 8. missing: ['skills'] → run 被调用:['npm','i','-g','@hytime/hy-companion-skills'] 与 ['hy-companion-install'],不装 hyc
// 9. missing: [] → run 不被调用,ok: true
// 10. run 返回 { status: 1 } → ok: false,failures 含该项
```

- [ ] **步骤 2:运行测试验证失败**

运行:`npm_config_cache=/tmp/npmcheck-cache pnpm --filter @hytime/dsh-companion exec vitest run src/host/prereq-self-heal.test.ts`
预期:FAIL,Cannot find module './prereq-self-heal'

- [ ] **步骤 3:实现 prereq-self-heal.ts**

```ts
// 关键接口(实现细节以实现者为准,口径与 hy-companion-check 一致):
// checkPrereqs({ dshHome?, hycProbe? }) → { hyc: 'ok'|'missing', skills: 'ok'|'missing' }
//   - hycProbe 默认 spawnSync('hyc', ['--help'], { stdio: 'ignore' });ENOENT 或非 0 status → 'missing'
//   - skills:<dshHome>/skills 下 readdir withFileTypes,isDirectory 且 name === 'hy-companion' 存在
//     且 name.startsWith('hy-companion-') 的目录数 >= 1 → 否则 'missing';目录不存在/不可读 → 'missing'
//   - dshHome 默认 process.env.DSH_HOME || join(process.env.HOME ?? homedir(), '.dsh')
// installMissing({ missing, run? }) → { ok: boolean, failures: string[] }
//   - run 默认 spawnSync;hyc 缺失 → run('npm', ['i', '-g', '@hytime/hyc'])
//   - skills 缺失 → run('npm', ['i', '-g', '@hytime/hy-companion-skills']) 成功后 run('hy-companion-install', [])
//   - 任一命令非 0 或 ENOENT → failures 记录该项,不抛出
```

- [ ] **步骤 4:运行测试验证通过**

运行:`npm_config_cache=/tmp/npmcheck-cache pnpm --filter @hytime/dsh-companion exec vitest run src/host/prereq-self-heal.test.ts`
预期:10 个用例全 PASS

- [ ] **步骤 5:Commit**

```bash
git add packages/dsh-companion/src/host/prereq-self-heal.ts packages/dsh-companion/src/host/prereq-self-heal.test.ts
git commit -m "feat(dsh-companion): 新增前置自愈模块(hyc/技能检查 + 缺失自动安装)"
```

## 任务 2:plugin.ts 接入自愈

**文件:**
- 修改:`packages/dsh-companion/src/host/plugin.ts`(apply 开头,`export const name` 之后、服务注册之前)

- [ ] **步骤 1:在 apply 开头接入自愈逻辑**

```ts
// 在 apply(ctx) 开头(约第 52 行 export const name 之后)插入:
// import { checkPrereqs, installMissing } from './prereq-self-heal';
// const prereq = checkPrereqs({});
// if (prereq.hyc === 'ok' && prereq.skills === 'ok') {
//   console.log('[dsh-companion] 前置就绪(hyc ✓, skills ✓)');
// } else {
//   const missing = [...(prereq.hyc === 'ok' ? [] : ['hyc']), ...(prereq.skills === 'ok' ? [] : ['skills'])];
//   console.log(`[dsh-companion] 检测到前置缺失(${missing.join(', ')}),自动安装中...`);
//   void installMissing({ missing }).then((result) => {
//     if (result.ok) console.log('[dsh-companion] 前置安装完成(hyc ✓, skills ✓)');
//     else console.warn(`[dsh-companion] 前置安装失败(${result.failures.join(', ')}),请手动运行:hy-companion-check 或 npm i -g @hytime/hyc`);
//   });
// }
```

注意:apply 保持同步注册服务,安装异步 fire-and-forget(`void ...then`),不阻塞。

- [ ] **步骤 2:验证**

运行:`npm_config_cache=/tmp/npmcheck-cache pnpm --filter @hytime/dsh-companion run typecheck`
预期:通过
运行:`npm_config_cache=/tmp/npmcheck-cache pnpm --filter @hytime/dsh-companion run test`
预期:98 + 10 = 108 全绿

- [ ] **步骤 3:Commit**

```bash
git add packages/dsh-companion/src/host/plugin.ts
git commit -m "feat(dsh-companion): apply 启动时自动检查并安装 hyc/技能前置"
```

## 任务 3:文档更新

**文件:**
- 修改:`README.md`(「安装前置依赖(必须按序满足)」章节)
- 修改:`AGENTS.md`(红线 2)

- [ ] **步骤 1:更新 README 安装章节**

在「安装前置依赖」章节补充:执行 `dsh plugin add @hytime/dsh-companion` 并重启 DSH 后,插件会自动检查 hyc CLI 与技能,缺失时自动执行 `npm i -g @hytime/hyc`、`npm i -g @hytime/hy-companion-skills && hy-companion-install`;安装失败会在 DSH 日志给出手动指引。手动按序安装的说明保留为备选路径。

- [ ] **步骤 2:更新 AGENTS.md 红线 2**

红线 2 补充:插件加载时会自动检查并安装缺失前置(hyc CLI / 技能);仍建议先装 CLI 再装技能再装插件,但插件自愈可兜底。

- [ ] **步骤 3:验证与 Commit**

运行:`grep -n "自动" README.md AGENTS.md | head` 确认新增内容存在
```bash
git add README.md AGENTS.md
git commit -m "docs: README/AGENTS 补充插件前置自愈说明"
```

## 任务 4:全量验证

- [ ] **步骤 1:类型检查 + 全量测试**

运行:`npm_config_cache=/tmp/npmcheck-cache pnpm -r run typecheck && npm_config_cache=/tmp/npmcheck-cache pnpm -r run test && npm_config_cache=/tmp/npmcheck-cache pnpm exec vitest run --config vitest.packages.config.ts`
预期:全部通过(插件 108 + skills 10 + CLI 1 + 根级 13)

- [ ] **步骤 2:构建**

运行:`npm_config_cache=/tmp/npmcheck-cache pnpm -r run build`
预期:通过(插件 lib/ 产出)

- [ ] **步骤 3:确认本机冒烟行为(可选,不阻塞)**

在 DSH 重启后观察日志出现「前置就绪(hyc ✓, skills ✓)」(本机前置已装,走就绪分支)

---

## 自检记录

- **规格覆盖度:** 规格的目标(apply 自愈)、检查口径、安装命令、幂等(检查先行)、失败容错(警告不崩)、测试(注入式)、范围(非目标)全部有对应任务。✅
- **占位符扫描:** 无 TODO;代码骨架为接口要点,实现者按规格细化。✅
- **类型一致性:** `checkPrereqs` / `installMissing` 签名在任务 1 定义,任务 2 按同一签名接入;`PrereqStatus.missing` 枚举值 `hyc`/`skills` 两任务一致。✅
