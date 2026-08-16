import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface CheckResult {
  hyc: 'ok' | 'missing';
  skills: 'ok' | 'missing';
}

export interface RunResult {
  status: number | null;
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
    probe = { status: null, error };
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
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return 'failed';
      throw error;
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
