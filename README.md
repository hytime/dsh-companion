# DSH Companion —— hy-companion 三件套独立发布仓库

本仓库是「hy-companion 陪伴系统」的独立发布仓库，把三个可发布单元放在一个 pnpm workspace 里统一构建、验证与发布：

| 包名 | 说明 | 安装方式 |
| --- | --- | --- |
| `@hytime/hyc` | hy-companion CLI（二进制分包分发，当前提供 darwin-arm64） | `npm i -g @hytime/hyc` |
| `@hytime/hy-companion-skills` | hy-companion DSH 技能（11 个），安装到 `$DSH_HOME/skills` | `npm i -g @hytime/hy-companion-skills && hy-companion-install` |
| `@hytime/dsh-companion` | DSH Companion 鲸鱼 Skill/CLI 前端（dual-face Cordis 插件） | `dsh plugin add @hytime/dsh-companion` |

> scope 已定型为 `@hytime`，安装 / 发布命令中的 `@hytime/*` 即为最终包名。仅当需要整体更换 scope 时，才运行根目录的 rename 脚本（见下文「发布步骤」）。

三件套共同构成完整的 hy-companion 使用链路：前端鲸鱼悬浮窗（插件）显示并反馈 Skill/CLI 状态；DSH Skill 调用 hyc CLI；hyc 转由 Go 后端产出结构化 `text/emotion/status` 响应。前端插件只接收可序列化的 Skill/CLI 状态，不直接访问 DSH Host/Client Service、credentials 或 live runtime 对象。

---

## 目录结构

```text
dsh-companion/
├── package.json              # workspace 根，仅放 devDependencies 与根级测试
├── pnpm-workspace.yaml
├── scripts/
│   ├── rename-package.mjs    # 换 scope 时全局替换 @hytime
│   ├── sync-skills.mjs       # 从 travel-note-go 同步 DSH 技能
│   ├── build-binaries.mjs    # 交叉编译 hyc 平台二进制
│   ├── copy-styles.mjs       # 拷贝插件样式
│   ├── copy-assets.mjs       # 拷贝鲸鱼帧资源
│   └── watch.mjs             # 插件构建监听
├── test/                     # 根级测试（rename / build-binaries）
└── packages/
    ├── dsh-companion/        # 前端插件（含 lib/ 产物与 cordis.patch.yml）
    ├── hy-companion-skills/  # DSH 技能包
    ├── hyc/                  # CLI 入口（bin/hyc.mjs）
    └── hyc-darwin-arm64/     # hyc 平台二进制包
```

---

## 环境要求

- Node.js >= 20
- pnpm >= 9（本项目使用 `pnpm@9.15.0`，`packageManager` 已声明）
- 装有 DSH 服务（宿主被注入 `window.__DSH_BOOT__`），插件在此之上运行

首次使用先安装内部依赖：

```bash
pnpm install
```

---

## 三件套安装（发布后）

按如下顺序安装（顺序不可颠倒，见「安装前置依赖」）：

```bash
# 1) 先安装 hyc CLI（提供 PATH 中的 hyc 命令）
npm i -g @hytime/hyc

# 2) 再安装 DSH 技能，并执行安装器写入 $DSH_HOME/skills
npm i -g @hytime/hy-companion-skills
hy-companion-install

# 3) 最后安装前端 DSH 插件
dsh plugin add @hytime/dsh-companion
```

技能安装器 `hy-companion-install` 会把 `hy-companion` 与 `hy-companion-*`（共 11 个）技能拷贝到 `$DSH_HOME/skills`（默认 `$HOME/.dsh/skills`）。已存在同名技能时默认跳过，加 `--force` 覆盖；可用 `--dsh-home <dir>` 指定 DSH 目录。

---

## 安装前置依赖（必须按序满足）

前端插件的安装前置条件必须按以下顺序满足，任一缺失时先补齐，不得跳步：

1. **先安装 hyc CLI**。校验：`command -v hyc` 应命中（如 `~/.local/bin/hyc` 或 PATH 中任一位置）。
2. **再安装 DSH 技能**。校验：`$DSH_HOME/skills/`（默认 `$HOME/.dsh/skills/`）下存在 `hy-companion` 与 `hy-companion-*` 目录。
3. **最后安装前端 DSH 插件**。校验：上面两前置均已满足，然后执行 `dsh plugin add @hytime/dsh-companion` 并重启 DSH。

> 完整顺序与验证命令的权威说明见原来的 `travel-note-go/docs/hy-companion-dsh-install.md`。

### 插件前置自愈（兜底路径）

执行 `dsh plugin add @hytime/dsh-companion` 并重启 DSH 后，插件会在启动时自动检查 hyc CLI 与 DSH 技能，缺失时自动补齐，无需手动按序安装：

- **hyc CLI 缺失** → 自动执行 `npm i -g @hytime/hyc`
- **技能缺失** → 自动执行 `npm i -g @hytime/hy-companion-skills`，成功后继续执行 `hy-companion-install`

安装采用 `spawnSync` 同步子进程执行，过程不阻塞插件加载（整体 fire-and-forget），但安装期间主事件循环会短暂停顿、其他并发任务暂停。若任一前置安装失败，DSH 日志会打印按缺失项分类的手动指引：仅技能缺失提示 `npm i -g @hytime/hy-companion-skills && hy-companion-install`，仅 hyc 缺失提示 `npm i -g @hytime/hyc`，两者都缺则两条并列；同时在日志顶部仍给出 `hy-companion-check` 兜底路径。

> 说明：插件自愈只是兜底。仍建议按上方 1 → 2 → 3 手动按序安装，以便尽早暴露依赖问题、避免插件首次加载时后台装包带来的额外等待。

---

## 本地开发循环（tarball）

前端插件以 tarball 方式安装到 DSH profile。本地每一次改动后的循环是：

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

### 为什么不能用 `link:` 目录安装

不要在 DSH profile 里用 `link:/path/to/this/repo/packages/dsh-companion` 这样的目录链接安装插件。

- **双实例问题**：目录链接会共享仓库里的源码与 `node_modules`，DSH 与开发进程可能各自加载一份模块实例（尤其 React / Cordis），导致插件与其依赖出现「两个 React」或「两个运行时」，出现 hook / 上下文对不上、状态不同步、热更新失效的莫名行为。
- **产物目录变化**：`build` 会先 `rm -rf lib`，链接方式下一次性重装，开发时构建与 DSH 引用直接冲突。
- **可复现性差**：`link:` 记录的是绝对路径，换机器、换目录即失效，无法随 profile 归档。

因此统一采用「build → pack → 装 tarball → 重启」的稳定循环，保证 DSH 消费的是独立、完整、可追溯的产物。

---

## 发布步骤

前置：scope 已定型为 `@hytime`，包名无需再改。先在 npm 上完成账号登录。

```bash
# 1) 登录 npm
npm login

# 2) 发布全部包（按依赖拓扑顺序）
pnpm -r publish
```

> 三个包 / 平台包均声明了 `"publishConfig": { "access": "public" }` 与 `"license": "MIT"`。

若要整体更换 scope（例如迁移到新组织名），则运行根目录的 rename 脚本把 `@hytime` 全局替换为新 scope，再按上述步骤发布：

```bash
node scripts/rename-package.mjs <新scope>   # 不传 --root 即以本仓库为根，全局替换 @hytime/* → @<新scope>/*
```

### 发布前检查清单

打好 tarball、`pnpm -r publish` 之前逐一核对：

- [ ] **LICENSE 确认**：本仓库文件、脚本、技能内容的许可符合 `MIT`；`packages/*/package.json` 均声明 `license: MIT`。对外发布前确认为合理。
- [ ] **`repository` / `author` 补填**：发布前给各 `packages/*/package.json` 补上 `repository`（指向本仓库实际远端地址）与 `author`（维护者名/邮箱），供 npm 元数据使用。
- [ ] **鲸鱼帧资源版权确认**：`packages/dsh-companion/public/deepseek-girl-phaser/` 下的 `deepseek-girl-atlas.png`、各 `frames/*.png` 表情帧来自既有 Companion 舞台资源，发布前确认其版权与再分发许可后再随包发布。
- [ ] **scope 一致**：发布包名均为 `@hytime/*`（含 `cordis.patch.yml`、`remote-descriptors.ts`、`hyc/bin/hyc.mjs` 的平台包映射）。
- [ ] **平台包二进制已构建**：`hyc-darwin-arm64/bin/hyc` 存在（见下「CLI 二进制构建」）。

### 可发布状态说明

`hy-companion-skills`、`hyc`、`hyc-darwin-arm64`（含 `dsh-companion`）四个子包均已在 `package.json` 声明 `"publishConfig": { "access": "public" }` 与 `"license": "MIT"`，**全部可直接发布**，无需改动任何字段。

scope 已定型为 `@hytime`，发布前只需两步：

1. `npm login`；
2. `pnpm -r publish`。

无 `private` 字段的包 `pack` / `publish` 均不受影响，`pnpm -r publish` 会按依赖拓扑发布全部子包。

---

## 后续事项（暂未搭建）

- **CI（暂未搭建）**：后续规划用 GitHub Actions 搭两套 workflow：
  - `ci.yml`：安装 → `pnpm -r run typecheck` → `pnpm -r run test` → `pnpm -r run build` → `pnpm -r run pack`。
  - `release.yml`：交叉编译各平台 hyc 二进制（`build-binaries.mjs` 已列出矩阵：darwin-arm64 / darwin-x64 / linux-x64 / linux-arm64 / win32-x64），随后 `pnpm -r publish` 发布全部包。
- 目前二进制仅构建 darwin-arm64，其余平台待 CI 补齐。

---

## 技能同步

从 `travel-note-go` 仓库把最新 DSH 技能同步进来（会覆盖 `packages/hy-companion-skills/skills/`）：

```bash
TRAVEL_NOTE_GO=/path/to/travel-note-go node scripts/sync-skills.mjs
```

> `TRAVEL_NOTE_GO` 未设置时默认 `/Volumes/hydisk/vsProject/travel-note-go`。同步来源目录为 `$TRAVEL_NOTE_GO/build/skill/dsh/hy-companion`。

---

## CLI 二进制构建

在 `travel-note-go` 交叉编译 hyc 到各平台包（产物写入 `packages/<平台包>/bin/`）：

```bash
TRAVEL_NOTE_GO=/path/to/travel-note-go node scripts/build-binaries.mjs
```

> `TRAVEL_NOTE_GO` 缺省同上。脚本会执行 `go build -ldflags="-s -w -X main.apiProfileVar=production"` 到目标平台包。当前矩阵只包含 darwin-arm64；`--dry-run` 只打印将要执行的命令，供测试 / CI 检查。

---

## 开发命令

```bash
pnpm install                     # 安装全部 workspace 依赖
pnpm -r run typecheck            # 类型检查（仅插件包含 typecheck script）
pnpm -r run test                 # 包级测试（插件 98 + 技能 3 + CLI 1）
pnpm exec vitest run --config vitest.packages.config.ts   # 根级 + 技能 + CLI 测试（含 rename/build-binaries）
pnpm -r run build                # 构建（插件产物）
pnpm -r run pack                 # 打包全部可发布包
```

---

## 验证命令参考（本次全量验证）

```bash
cd <本仓库>
pnpm -r run typecheck            # 预期：只有插件包有 typecheck script
pnpm -r run test                 # 预期：插件 98 + 技能 3 + CLI 1 全绿（根级测试不在此列）
pnpm exec vitest run --config vitest.packages.config.ts   # 根级 rename/build-binaries + 技能 + CLI
pnpm -r run build                # 预期：插件 build 通过
pnpm --filter @hytime/dsh-companion run pack
pnpm --filter @hytime/hy-companion-skills run pack
pnpm --filter @hytime/hyc run pack
ls packages/*/*.tgz              # 三个 tarball 分别产出
tar -tzf packages/dsh-companion/hytime-dsh-companion-0.1.0.tgz   # 抽查插件：lib/、cordis.patch.yml、lib/deepseek-girl-phaser/
tar -tzf packages/hy-companion-skills/hytime-hy-companion-skills-0.1.0.tgz  # 抽查技能：skills/ 11 目录、lib/installer.mjs
tar -tzf packages/hyc/hytime-hyc-0.1.0.tgz               # 抽查 CLI：bin/hyc.mjs
```
