import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface CheckResult {
  hyc: 'ok' | 'missing';
  skills: 'ok' | 'missing';
}

export interface RunResult {
  status?: number | null;
  error?: unknown;
}

export interface InstallResult {
  ok: boolean;
  failures: string[];
}

export type HycProbe = () => RunResult;
export type RunCmd = (cmd: string, args: string[]) => RunResult;

/** 缺省 DSH home：$DSH_HOME 优先，否则 $HOME/.dsh（口径同 hy-companion-check）。 */
export function defaultDshHome(): string {
  return process.env.DSH_HOME || join(process.env.HOME ?? homedir(), '.dsh');
}

const defaultHycProbe: HycProbe = () => spawnSync('hyc', ['--help'], { stdio: 'ignore' });

/** 探测 hyc：ENOENT 或非 0 退出码 → missing，否则 ok。 */
export function checkHyc(hycProbe: HycProbe): CheckResult['hyc'] {
  let probe: RunResult;
  try {
    probe = hycProbe();
  } catch (error) {
    probe = { error }; // 与 hy-companion-check 的 check.mjs probe = { error } 逐字一致
  }
  if (probe.error && (probe.error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
  if (probe.status !== undefined && probe.status !== 0) return 'missing';
  return 'ok';
}

/** 检查 DSH 技能：<dshHome>/skills 存在 hy-companion 目录且 hy-companion-* 目录数 >= 1。 */
export async function checkSkills(dshHome: string): Promise<CheckResult['skills']> {
  try {
    const entries = await readdir(join(dshHome, 'skills'), { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const hasBase = dirs.includes('hy-companion');
    const subCount = dirs.filter((n) => n.startsWith('hy-companion-')).length;
    return hasBase && subCount >= 1 ? 'ok' : 'missing';
  } catch {
    return 'missing';
  }
}

/**
 * 前置自检：返回 hyc 与 skills 的就绪状态。
 * hycProbe / dshHome 可注入以便测试，口径与 hy-companion-check 一致。
 */
export async function checkPrereqs(options: {
  dshHome?: string;
  hycProbe?: HycProbe;
}): Promise<CheckResult> {
  const dshHome = options.dshHome ?? defaultDshHome();
  const hycProbe = options.hycProbe ?? defaultHycProbe;
  const [hyc, skills] = await Promise.all([checkHyc(hycProbe), checkSkills(dshHome)]);
  return { hyc, skills };
}

const defaultRun: RunCmd = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit' });

function runItem(steps: Array<[string, string[]]>, run: RunCmd): 'ok' | 'failed' {
  for (const [cmd, args] of steps) {
    let result: RunResult;
    try {
      result = run(cmd, args);
    } catch {
      // 安装命令抛任何异常（含 ENOENT 与非 ENOENT）一律降级为 failed，
      // 保证 installMissing 永不 reject，安装失败统一进入 failures 而非升级为异常。
      return 'failed';
    }
    if (result.status !== 0 && result.status !== undefined) return 'failed';
    if (result.error) return 'failed';
  }
  return 'ok';
}

/**
 * 自动安装缺失项。
 * - hyc 缺失 → `npm i -g @hytime/hyc`
 * - skills 缺失 → `npm i -g @hytime/hy-companion-skills` 成功后 `hy-companion-install`
 * 任一命令非 0 / ENOENT → 记录该项到 failures，不抛出。
 */
export async function installMissing(options: {
  missing: Array<'hyc' | 'skills'>;
  run?: RunCmd;
}): Promise<InstallResult> {
  const run = options.run ?? defaultRun;
  const failures: string[] = [];

  if (options.missing.includes('hyc')) {
    if (runItem([['npm', ['i', '-g', '@hytime/hyc']]], run) !== 'ok') {
      failures.push('hyc');
    }
  }

  if (options.missing.includes('skills')) {
    const steps: Array<[string, string[]]> = [
      ['npm', ['i', '-g', '@hytime/hy-companion-skills']],
      ['hy-companion-install', []],
    ];
    if (runItem(steps, run) !== 'ok') {
      failures.push('skills');
    }
  }

  return { ok: failures.length === 0, failures };
}

/** 自愈日志接口：注入 console 或测试替身。 */
export interface SelfHealLogger {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
}

/**
 * 按安装失败项生成手动补装指引（Minor:对「仅技能缺失」也给出正确命令）。
 * - 含 hyc → `npm i -g @hytime/hyc`
 * - 含 skills → `npm i -g @hytime/hy-companion-skills && hy-companion-install`
 * - 两者都含 → 用「 或 」合并
 */
export function installGuidance(failures: string[]): string {
  const cmds: string[] = [];
  if (failures.includes('hyc')) cmds.push('npm i -g @hytime/hyc');
  if (failures.includes('skills')) cmds.push('npm i -g @hytime/hy-companion-skills && hy-companion-install');
  return cmds.join(' 或 ');
}

/**
 * 插件启动时的前置自愈编排：检查 → 就绪打日志 / 缺失自动安装 → 失败给手动指引。
 * 全程捕获异常，永不 reject（fire-and-forget，不阻塞插件加载）。
 * check / install / log 均可注入以便单测；plugin.ts 以 `void runSelfHeal({})` 调用。
 */
export async function runSelfHeal(options: {
  check?: typeof checkPrereqs;
  install?: typeof installMissing;
  log?: SelfHealLogger;
}): Promise<void> {
  const check = options.check ?? checkPrereqs;
  const install = options.install ?? installMissing;
  const log: SelfHealLogger = options.log ?? console;
  try {
    const prereq = await check({});
    if (prereq.hyc === 'ok' && prereq.skills === 'ok') {
      log.log('[dsh-companion] 前置就绪(hyc ✓, skills ✓)');
      return;
    }
    const missing: Array<'hyc' | 'skills'> = [];
    if (prereq.hyc !== 'ok') missing.push('hyc');
    if (prereq.skills !== 'ok') missing.push('skills');
    log.log(`[dsh-companion] 检测到前置缺失(${missing.join(', ')}),自动安装中...`);
    const result = await install({ missing });
    if (result.ok) {
      log.log('[dsh-companion] 前置安装完成(hyc ✓, skills ✓)');
    } else {
      log.warn(
        `[dsh-companion] 前置安装失败(${result.failures.join(', ')}),请手动运行:hy-companion-check 或 ${installGuidance(result.failures)}`,
      );
    }
  } catch (error) {
    // 自检本身失败不要阻塞插件启动。
    log.warn(`[dsh-companion] 前置自检失败,跳过自愈:${error instanceof Error ? error.message : String(error)}`);
  }
}
