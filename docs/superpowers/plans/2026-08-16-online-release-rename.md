# 线上发行改名(scope + 插件 id)实现计划

> **面向 AI 代理的工作者:** 必需子技能:使用 superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框(`- [ ]`)语法来跟踪进度。

**目标:** 把 4 个子包的占位 scope `@your-scope` 替换为真实 `@hytime`,插件 id `travel-note-companion` 替换为 `dsh-companion`,补齐发布元数据,新增 `hy-companion-check` 前置检查脚本,全量验证后发布到 npmjs.org,并清除 DSH profile 中旧插件安装。

**架构:** 机械改名 + 测试同步 + 元数据补齐 + 检查脚本 + 全量验证 + 发布 + 清除旧安装,共 9 个任务。核心替换直接改源文件(仓库自带 `rename-package.mjs` 只覆盖 package.json / cordis.patch.yml / remote-descriptors.ts,其余文件手动替换);测试断言必须同步,否则全量测试失败;`hy-companion-check` 是技能包新增 bin 命令,随 npm 包分发,作为安装前端插件前的门禁(检查 hyc CLI + 技能目录,任一缺失退出 1);发布用 `pnpm -r publish` 按依赖拓扑自动排序(hyc-darwin-arm64 → hyc → hy-companion-skills → dsh-companion),`~/.npmrc` 默认 registry 已是 npmjs.org,无需 `--registry`。旧插件安装在 `~/.dsh/profiles/web/`(当前 GUI 所用 profile):移除 `@your-scope/dsh-companion` 依赖与 bundles 条目、删除 `@travel-note` 遗留 symlink;该目录在 workspace 之外,写入需授权 `danger-full-access`。

**技术栈:** pnpm workspace、TypeScript、vitest、tsdown、cordis.patch.yml、npm publish。

**已确认输入:** scope = `@hytime`;插件 id = `dsh-companion`;发布目标 = npmjs.org。

---

## 任务 1:scope 替换(@your-scope → @hytime)

**文件:**
- 修改:`packages/dsh-companion/package.json:2`(name)
- 修改:`packages/hy-companion-skills/package.json:2`(name)
- 修改:`packages/hyc/package.json:2,10`(name、optionalDependencies 的 `@your-scope/hyc-darwin-arm64`)
- 修改:`packages/hyc-darwin-arm64/package.json:2`(name)
- 修改:`packages/dsh-companion/cordis.patch.yml:3`(name)
- 修改:`packages/dsh-companion/src/contracts/remote-descriptors.ts:9`(REMOTE_PACKAGE)
- 修改:`packages/dsh-companion/tsdown.config.ts:7`(ID)
- 修改:`packages/hyc/bin/hyc.mjs:9-13,24`(平台包映射 5 处 + 错误提示)
- 修改:`packages/hy-companion-skills/lib/installer.mjs:23`(提示语)
- 修改:`packages/hyc/test/hyc.test.mjs`(3 处 `@your-scope` → `@hytime`,否则平台包解析测试失败)
- 修改:`packages/dsh-companion/src/contracts/remote-descriptors.test.ts:7`
- 修改:`packages/dsh-companion/src/client/remote-contract.test.ts:6`
- 修改:`packages/dsh-companion/src/test/package-structure.test.ts:28`

- [ ] **步骤 1:替换 9 个源/配置文件中的 `@your-scope` → `@hytime`**(用 edit 工具逐个替换)
- [ ] **步骤 2:同步 4 个测试文件的断言**(hyc.test.mjs、remote-descriptors.test.ts、remote-contract.test.ts、package-structure.test.ts)
- [ ] **步骤 3:全量测试**

运行:`pnpm -r run test`
预期:全部通过(hyc 测试验证改名后 `node_modules/@hytime/hyc-darwin-arm64` 解析;插件测试验证 `REMOTE_PACKAGE = '@hytime/dsh-companion'`)

- [ ] **步骤 4:Commit**

```bash
git add -A
git commit -m "refactor: 占位 scope @your-scope 替换为 @hytime(源码/配置/测试断言)"
```

## 任务 2:插件 id 替换(travel-note-companion → dsh-companion)

**文件:**
- 修改:`packages/dsh-companion/cordis.patch.yml:2`(`- id: travel-note-companion` → `- id: dsh-companion`)
- 修改:`packages/dsh-companion/src/host/plugin.ts:2,52,372,375,440,445,448`(注释、`export const name`、ping 路由 path 与响应体、3 处日志前缀)
- 修改:`test/rename-package.test.mjs:21`(输入样例的 id 字段,保持与现状一致)

- [ ] **步骤 1:替换 cordis.patch.yml 与 plugin.ts 中的插件 id**

`export const name = 'travel-note-companion'` → `export const name = 'dsh-companion'`;`/api/travel-note-companion/ping` → `/api/dsh-companion/ping`;日志前缀 `[travel-note-companion]` → `[dsh-companion]`;文件头注释同步。

- [ ] **步骤 2:确认无残留**

运行:`grep -rn "travel-note-companion" packages/ test/ scripts/ | grep -v node_modules`
预期:无输出(rename 测试输入样例已同步)

- [ ] **步骤 3:插件测试**

运行:`pnpm --filter @hytime/dsh-companion run test`
预期:全部通过

- [ ] **步骤 4:Commit**

```bash
git add -A
git commit -m "refactor: 插件 id travel-note-companion 替换为 dsh-companion"
```

## 任务 3:发布元数据(repository / author / LICENSE)

**需要用户提供:** ① author 名称与邮箱(默认 `hytime`);② repository 的 URL(git remote 当前为空,需用户给出远端地址);③ LICENSE 版权人。

**文件:**
- 修改:`packages/*/package.json`(4 个,补 `author` 与 `repository` 字段,格式:`"author": "<名称> <邮箱>"`、`"repository": { "type": "git", "url": "<URL>" }`)
- 创建:`LICENSE`(根目录,MIT 模板,版权行:`Copyright (c) 2026 <版权人>`)

- [ ] **步骤 1:向用户确认 author / repository URL / 版权人**
- [ ] **步骤 2:4 个 package.json 补字段**(跟随包各自的 description 之后插入)
- [ ] **步骤 3:创建 LICENSE 文件**(MIT 全文)
- [ ] **步骤 4:验证字段合法**

运行:`node -e "for (const p of ['packages/dsh-companion','packages/hy-companion-skills','packages/hyc','packages/hyc-darwin-arm64']) { const j=require('./'+p+'/package.json'); console.log(p, j.name, j.author, j.repository?.url) }"`
预期:4 行,均显示 `@hytime/*` 与 author/repository

- [ ] **步骤 5:Commit**

```bash
git add -A
git commit -m "chore: 补发布元数据(repository/author/LICENSE)"
```

## 任务 4:文档与脚本收尾

**文件:**
- 修改:`README.md`(根,7-11、24、60-80、92-101、118-155、213-219 行:@your-scope → @hytime;「发布步骤」改为已定型 scope 的说明——不再需要 rename,直接 `npm login` + `pnpm -r publish`;可发布状态说明同步)
- 修改:`packages/dsh-companion/README.md`、`packages/hy-companion-skills/README.md`(如存在)、`packages/hyc/README.md`、`packages/hyc-darwin-arm64/README.md`(@your-scope → @hytime)
- 修改:`AGENTS.md`(11-13、36 行)
- 修改:`scripts/rename-package.mjs:18`(OLD 改为 `'@hytime'`,注释更新为「把当前 scope 换成新 scope」,保持脚本可复用)

- [ ] **步骤 1:替换全部文档中的 @your-scope → @hytime**
- [ ] **步骤 2:更新根 README 发布流程**(rename 步骤说明:scope 已定型为 @hytime,换 scope 时才需运行 rename 脚本)
- [ ] **步骤 3:更新 rename 脚本 OLD 常量与注释,并同步测试**

`scripts/rename-package.mjs:18` 的 `OLD` 改为 `'@hytime'`,注释更新为「把当前 scope 换成新 scope」(保持脚本可复用)。

同步 `test/rename-package.test.mjs`:输入文件内容与断言中的 `@your-scope` 全部改为 `@hytime`(如 `{ name: '@hytime/dsh-companion' }`、`optionalDependencies: { '@hytime/hyc-darwin-arm64': ... }`、`"name: '@hytime/dsh-companion'"`、`REMOTE_PACKAGE = '@hytime/dsh-companion'`),断言改为替换结果 `@新scope`(如 `@hytime2/...`),并运行 `pnpm exec vitest run test/rename-package.test.mjs` 确认通过。
- [ ] **步骤 4:确认文档无 @your-scope 残留(rename 测试的占位输入除外)**

运行:`grep -rn "@your-scope" README.md AGENTS.md packages/*/README.md scripts/`
预期:仅 `test/rename-package.test.mjs` 与 `scripts/rename-package.mjs` 中的占位/OLD 定义可保留,其余无输出

- [ ] **步骤 5:Commit**

```bash
git add -A
git commit -m "docs: 文档与 rename 脚本同步 @hytime 新 scope"
```

## 任务 5:创建 hy-companion-check 前置检查脚本

**目标:** 技能包新增 `hy-companion-check` bin 命令,作为安装前端插件前的门禁:检查 hyc CLI 与 DSH 技能是否就绪,全部 OK 退出 0,任一缺失退出 1 并给出按序安装指引。

**文件:**
- 创建:`packages/hy-companion-skills/lib/check.mjs`(检查逻辑,导出 `checkPrereqs` / `parseArgs`;hyc 探测通过注入参数,便于测试)
- 创建:`packages/hy-companion-skills/bin/hy-companion-check.mjs`(入口,`#!/usr/bin/env node`,模式同 `hy-companion-install.mjs`)
- 修改:`packages/hy-companion-skills/package.json`(`bin` 加 `"hy-companion-check": "bin/hy-companion-check.mjs"`)
- 创建:`packages/hy-companion-skills/test/check.test.mjs`(模式同 `installer.test.mjs`)

- [ ] **步骤 1:编写 lib/check.mjs**

```js
// 检查项:
// 1. hyc CLI —— hycProbe()(默认 spawnSync('hyc', ['--help'])),ENOENT 或非 0 退出码 → MISSING
// 2. 技能目录 —— <dshHome>/skills 下存在 hy-companion 目录,且 hy-companion-* 目录数 >= 1(README 校验口径)
// 输出格式:每项一行 [hy-companion-check] 状态(OK/MISSING),缺失时附安装指引(npm i -g @hytime/hyc / hy-companion-install)
// 全部 OK → 打印「可以安装前端插件」并返回 { ok: true };任一缺失 → { ok: false, missing: [...] }
```

- [ ] **步骤 2:编写 bin/hy-companion-check.mjs**

```js
#!/usr/bin/env node
// usage: hy-companion-check [--dsh-home <dir>]   —— 安装前端插件前的前置门禁
// 解析参数 → checkPrereqs({ dshHome }) → ok 则 process.exit(0),否则 process.exit(1)
```

- [ ] **步骤 3:package.json 注册 bin**

`"bin": { "hy-companion-install": "bin/hy-companion-install.mjs", "hy-companion-check": "bin/hy-companion-check.mjs" }`

- [ ] **步骤 4:编写测试(注入式,不依赖真实 PATH)**

```js
// check.test.mjs:
// 1. hyc 缺失(注入 hycProbe 抛 ENOENT 错误)+ 技能缺失 → ok:false,missing 含 hyc 与 skills
// 2. hyc 存在 + 技能目录含 hy-companion 与 hy-companion-chat → ok:true
// 3. 技能缺失但 hyc 存在 → missing 只含 skills
// 4. parseArgs(['--dsh-home','/tmp/x']) → { dshHome:'/tmp/x' };parseArgs([]) → 默认 $HOME/.dsh
```

- [ ] **步骤 5:运行测试**

运行:`pnpm --filter @hytime/hy-companion-skills run test`
预期:installer + check 测试全绿

- [ ] **步骤 6:手动冒烟(本机真实环境)**

运行:`node packages/hy-companion-skills/bin/hy-companion-check.mjs`
预期:hyc CLI OK(`/Users/huangyu/.local/bin/hyc`)、技能 OK(11 个),退出码 0

- [ ] **步骤 7:Commit**

```bash
git add packages/hy-companion-skills
git commit -m "feat(hy-companion-skills): 新增 hy-companion-check 前置检查命令(安装插件前门禁)"
```

## 任务 6:全量验证与清理

**文件:**
- 删除(忽略产物):`packages/*/your-scope-*.tgz`、`packages/*/hytime-*.tgz`(残留 tarball,被 .gitignore 忽略)

- [ ] **步骤 1:清理残留 tgz**

运行:`rm -f packages/dsh-companion/your-scope-*.tgz packages/dsh-companion/hytime-*.tgz packages/hy-companion-skills/hytime-*.tgz packages/hyc/hytime-*.tgz`

- [ ] **步骤 2:类型检查**

运行:`pnpm -r run typecheck`
预期:通过(仅插件包有此 script)

- [ ] **步骤 3:全量测试**

运行:`pnpm -r run test && pnpm exec vitest run --config vitest.packages.config.ts`
预期:插件 + 技能 + CLI + 根级全部通过

- [ ] **步骤 4:构建与打包**

运行:`pnpm -r run build && pnpm -r run pack`
预期:4 个 tarball 产出,文件名均为 `hytime-*-0.1.0.tgz`

- [ ] **步骤 5:tarball 抽查**

运行:`tar -tzf packages/dsh-companion/hytime-dsh-companion-0.1.0.tgz | head; tar -tzf packages/hyc/hytime-hyc-0.1.0.tgz`
预期:插件含 lib/、cordis.patch.yml;CLI 含 bin/hyc.mjs

- [ ] **步骤 6:Commit(如有改动)**

```bash
git add -A
git commit -m "chore: 清理残留 tarball"  # 若仅有忽略产物则跳过
```

## 任务 7:发布到 npmjs.org

**前置:** 用户批准执行发布(副作用操作,执行前再次确认)。

- [ ] **步骤 0:构建 hyc darwin-arm64 二进制(发布前置,任务 6 确认缺口)**

运行:`TRAVEL_NOTE_GO=/Volumes/hydisk/vsProject/travel-note-go node scripts/build-binaries.mjs`
预期:`packages/hyc-darwin-arm64/bin/hyc` 存在(可执行文件);`hyc-darwin-arm64` 无 pack script,发布时 `files: ["bin/"]` 直接包含二进制

- [ ] **步骤 1:确认 npm 已登录**

运行:`npm whoami --cache /tmp/npmcheck-cache`
预期:`hytime`

- [ ] **步骤 2:发布全部包(拓扑序)**

运行:`pnpm -r publish`
预期:hyc-darwin-arm64 → hyc → hy-companion-skills → dsh-companion 依次发布成功

- [ ] **步骤 3:验证线上可见**

运行:`npm view @hytime/hyc version; npm view @hytime/dsh-companion version; npm view @hytime/hy-companion-skills version; npm view @hytime/hyc-darwin-arm64 version`
预期:均返回 `0.1.0`

## 任务 8:清除 DSH profile 中的旧插件安装

**背景:** 旧插件安装在 `~/.dsh/profiles/web/`(当前 DSH Web GUI 所用 profile,workspace 之外,写入需 `danger-full-access` 授权):
- `web/package.json` 的 dependencies 含 `@your-scope/dsh-companion: file:<tarball>`
- `web/package.json` 的 `dsh.profile.bundles` 含 `@your-scope/dsh-companion`
- `web/node_modules/@travel-note/dsh-companion` 是更早的遗留 symlink(指向 travel-note-agent,不在当前依赖中)

**文件:**
- 修改:`~/.dsh/profiles/web/package.json`(移除 `@your-scope/dsh-companion` 依赖行与 bundles 条目)
- 删除:`~/.dsh/profiles/web/node_modules/@travel-note/`

- [ ] **步骤 1:编辑 profile 的 package.json,移除旧插件**

用 edit 工具删除 `"@your-scope/dsh-companion": "file:..."` 依赖行与 `dsh.profile.bundles` 中的 `"@your-scope/dsh-companion"` 条目(保留 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`dsh-thinking-effort`)。

- [ ] **步骤 2:删除 @travel-note 遗留 symlink(更早的 travel-note 插件安装)**

运行:`rm -rf ~/.dsh/profiles/web/node_modules/@travel-note`
(该目录是旧项目 `travel-note-agent/apps/dsh-companion` 的 link 残留,不在 package.json 依赖中,删除安全;`dsh-thinking-effort` 来自 github 依赖,不动)

> **用户已确认保留(不删):** `~/.dsh/sessions/--Volumes-hydisk-vsProject-travel-note-agent--` 与 `--Volumes-hydisk-vsProject-travel-note-go--` 是旧会话数据目录,仅作历史记录保留;本次只清除插件安装的 symlink 残留。

- [ ] **步骤 3:同步 node_modules**

运行:`cd ~/.dsh/profiles/web && pnpm install`
预期:pnpm 移除 `@your-scope/dsh-companion` 相关安装(本地 tarball 依赖)

- [ ] **步骤 4:确认无残留**

运行:`grep -rn "your-scope\|@travel-note" ~/.dsh/profiles/web/package.json ~/.dsh/profiles/web/cordis.patch.yml ~/.dsh/profiles/web/cordis.yml; ls ~/.dsh/profiles/web/node_modules/@travel-note 2>&1`
预期:grep 无输出;`@travel-note` 目录不存在

- [ ] **步骤 5:重启 DSH 使生效(告知用户)**

清除后旧插件不再加载;新的 `@hytime/dsh-companion` 在任务 9 安装。

> 注意:此任务会移除当前 GUI 的鲸鱼插件功能,直到新插件安装完成。

## 任务 9:安装新插件(可选,需用户确认)

**前置:** 任务 7 发布成功、任务 8 清除完成。

**安装前置检查(按 README 顺序,已存在则跳过,缺失才安装;安装插件前必须运行 hy-companion-check 门禁):**

- [ ] **步骤 1:检查 hyc CLI**

运行:`command -v hyc`
预期:命中(当前为 `/Users/huangyu/.local/bin/hyc`)→ **跳过 CLI 安装**
若未命中:运行 `npm i -g @hytime/hyc`,再复查 `command -v hyc`

- [ ] **步骤 2:检查 DSH 技能**

运行:`ls -d $DSH_HOME/skills/hy-companion $DSH_HOME/skills/hy-companion-*`
预期:命中 11 个目录(当前已安装)→ **跳过技能安装**
若缺失:运行 `npm i -g @hytime/hy-companion-skills && hy-companion-install`,再复查

- [ ] **步骤 3:运行 hy-companion-check 门禁(安装插件前必须全部 OK)**

运行:`hy-companion-check`(技能包随 npm 安装提供的全局命令)
预期:hyc CLI OK + 技能 OK,退出码 0;任一 MISSING 则按输出指引补齐后重跑,不得跳步安装插件

- [ ] **步骤 4:安装前端插件**

运行:`dsh plugin add @hytime/dsh-companion`(在 DSH 环境内;若 dsh 不在 PATH,改用 profile 内 pnpm 或 DSH 提供的入口)
预期:`~/.dsh/profiles/web/package.json` 出现 `@hytime/dsh-companion` 依赖,bundles 列表更新

- [ ] **步骤 5:重启 DSH**

预期:鲸鱼插件以新包名 `@hytime/dsh-companion`、新插件 id `dsh-companion` 加载

---

## 自检记录

- **规格覆盖度:** 4 个子包改名(任务 1)、插件 id 改名(任务 2)、README 检查清单中的 repository/author/LICENSE(任务 3)、文档同步(任务 4)、hy-companion-check 前置检查脚本(任务 5)、验证命令(任务 6)、发布(任务 7)、清除旧插件安装(任务 8)、安装新插件(任务 9)。✅
- **占位符扫描:** 无 TODO;`test/rename-package.test.mjs` 与 `scripts/rename-package.mjs` 中的 `@your-scope` 是有意保留的脚本输入/OLD 定义,已在任务 4 注明。✅
- **类型一致性:** 改名后所有引用统一为 `@hytime/*`;插件 id 统一为 `dsh-companion`;remote service 名 `travelNoteCompanion`(REMOTE_SERVICE/REMOTE_NAMESPACE)不在本次范围,保持不变。✅
- **清除范围:** 任务 8 只动 `~/.dsh/profiles/web/` 中的 `@your-scope/dsh-companion` 依赖/bundles 与 `@travel-note` 遗留 symlink(更早 travel-note 插件安装残留);`dsh-thinking-effort`、skills 目录、`hyc` 全局安装均不受影响;`~/.dsh/sessions/` 下 2 个 travel-note 旧会话数据目录经用户确认**保留**,不删除。✅
- **安装前置检查:** 任务 9 按 README 顺序先检查 hyc CLI(当前已装 `/Users/huangyu/.local/bin/hyc`)与 11 个技能(当前已装),命中即跳过,缺失才执行安装;安装插件前必须运行 `hy-companion-check` 门禁(任务 5 新建),全部 OK 才允许 `dsh plugin add`。✅
