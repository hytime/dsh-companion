# 插件前置自愈(hyc CLI + 技能自动安装)设计

## 目标

让「用户安装插件」成为唯一动作:`dsh plugin add @hytime/dsh-companion` + 重启 DSH 后,插件在加载时自动检查 hyc CLI 与 DSH 技能,缺失则自动安装,前置就位后插件功能可用。CLI 不存在自动装 CLI,技能不存在自动装技能。

## 背景与约束

- **为什么不能在安装钩子里做**:DSH profile 用 pnpm(实际 11.21)安装插件,pnpm 10+ 默认阻止依赖包的 preinstall/postinstall 脚本,`allowBuilds` / `onlyBuiltDependencies` 多种配置实测均不放行。没有比「插件加载(apply)」更早的可靠触发时机。
- **自动安装只限自家包**:`@hytime/hyc`、`@hytime/hy-companion-skills`(npm 全局),不碰任何其他包。
- **失败容错**:安装失败(网络/权限)只打印明确指引,插件继续加载,不阻塞 DSH、不崩溃。
- **幂等**:每次启动快速检查,已装则跳过,开销毫秒级。

## 架构

- **新模块** `packages/dsh-companion/src/host/prereq-self-heal.ts`(host half):
  - 导出 `checkPrereqs({ dshHome, hycProbe })` → `{ hyc: 'ok'|'missing', skills: 'ok'|'missing' }`(口径与 `hy-companion-check` 一致:hyc 用 spawnSync 探测 ENOENT/非 0;技能为 `<dshHome>/skills` 下存在 `hy-companion` 目录且 `hy-companion-*` ≥ 1)
  - 导出 `installMissing({ missing, npm, dshHome })` → 对缺失项执行安装:
    - hyc 缺失 → `npm i -g @hytime/hyc`
    - skills 缺失 → `npm i -g @hytime/hy-companion-skills` → `hy-companion-install`(落地到 `$DSH_HOME/skills`)
  - 依赖注入:`hycProbe`、`npm`(spawn 可注入,便于测试),`dshHome` 默认 `$DSH_HOME` 或 `$HOME/.dsh`
- **调用点** `packages/dsh-companion/src/host/plugin.ts` apply 开头:
  1. 同步快速检查(毫秒级)
  2. 全部就绪 → 打印 `[dsh-companion] 前置就绪(hyc ✓, skills ✓)`,继续正常注册
  3. 有缺失 → 异步(不阻塞 apply)执行 `installMissing`,安装中/完成后打印日志;任一安装失败 → 打印指引「请手动运行:hy-companion-check 或 npm i -g @hytime/hyc」,插件继续加载
- **测试** `packages/dsh-companion/src/host/prereq-self-heal.test.ts`(注入式,模式同既有 host 测试):
  - 检查:hyc 存在+技能存在 → 全 ok;hyc 缺失(注入 ENOENT probe)→ missing;技能缺失 → missing
  - 安装决策:hyc 缺失 → 调用 npm i -g @hytime/hyc;skills 缺失 → npm i -g skills + hy-companion-install;全 ok → 不调用安装
  - 失败:安装命令非 0 → 返回失败结果(不抛出)

## 数据流

```
DSH 启动 → 插件 apply()
  → checkPrereqs(同步,毫秒级)
      ├─ 全 ok → 日志"前置就绪" → 注册 RPC/SSE/状态服务
      └─ 有缺失 → installMissing(异步 fire-and-forget)
            ├─ hyc 缺 → npm i -g @hytime/hyc
            ├─ skills 缺 → npm i -g @hytime/hy-companion-skills && hy-companion-install
            └─ 完成/失败 → 日志(成功 ✓ / 失败给出手动指引)
```

## 错误处理

- 检查阶段:技能目录不存在/不可读 → 视为 missing(与 hy-companion-check 一致)
- 安装阶段:每个命令非 0 退出 → 该项标记失败,不抛出异常;全部完成后汇总日志
- 全局失败(如 npm 本身不存在)→ 指引用户手动安装

## 测试

- 单元测试(注入式,不依赖真实 PATH/网络):检查逻辑 4 用例、安装决策 3 用例、失败路径 2 用例
- 现有 98 个插件测试不回归

## 范围(非目标)

- 不做 preinstall/postinstall 钩子(pnpm 阻止,已验证不可行)
- 不自动安装插件本身(插件由用户 dsh plugin add 安装)
- 不在 Client 侧做任何改动
- 不修改 hy-companion-check 命令(技能包已有检查能力;插件自愈是独立实现,不跨包依赖)

## 文档

- README「安装前置依赖」章节更新:说明 dsh plugin add + 重启后插件会自动检查并安装缺失前置;手动校验命令保留
- AGENTS.md 红线 2 补充说明(可选)
