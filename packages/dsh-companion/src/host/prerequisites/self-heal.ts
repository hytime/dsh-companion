import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface CheckResult { hyc: 'ok' | 'missing'; skills: 'ok' | 'missing' }
export interface RunResult { status?: number | null; error?: unknown }
export interface InstallResult { ok: boolean; failures: string[] }
export type HycProbe = () => RunResult;
export type RunCmd = (cmd: string, args: string[]) => RunResult;

export function defaultDshHome(): string {
  return process.env.DSH_HOME || join(process.env.HOME ?? homedir(), '.dsh');
}

const defaultHycProbe: HycProbe = () => spawnSync('hyc', ['--help'], { stdio: 'ignore' });

export function checkHyc(hycProbe: HycProbe): CheckResult['hyc'] {
  let probe: RunResult;
  try { probe = hycProbe(); } catch (error) { probe = { error }; }
  if (probe.error && (probe.error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
  if (probe.status !== undefined && probe.status !== 0) return 'missing';
  return 'ok';
}

export async function checkSkills(dshHome: string): Promise<CheckResult['skills']> {
  try {
    const entries = await readdir(join(dshHome, 'skills'), { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    return dirs.includes('hy-companion') && dirs.some((name) => name.startsWith('hy-companion-')) ? 'ok' : 'missing';
  } catch { return 'missing'; }
}

export async function checkPrereqs(options: { dshHome?: string; hycProbe?: HycProbe }): Promise<CheckResult> {
  const dshHome = options.dshHome ?? defaultDshHome();
  const hycProbe = options.hycProbe ?? defaultHycProbe;
  const [hyc, skills] = await Promise.all([checkHyc(hycProbe), checkSkills(dshHome)]);
  return { hyc, skills };
}

const defaultRun: RunCmd = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit' });

function runItem(steps: Array<[string, string[]]>, run: RunCmd): 'ok' | 'failed' {
  for (const [cmd, args] of steps) {
    let result: RunResult;
    try { result = run(cmd, args); } catch { return 'failed'; }
    if ((result.status !== 0 && result.status !== undefined) || result.error) return 'failed';
  }
  return 'ok';
}

export async function installMissing(options: { missing: Array<'hyc' | 'skills'>; run?: RunCmd }): Promise<InstallResult> {
  const run = options.run ?? defaultRun;
  const failures: string[] = [];
  if (options.missing.includes('hyc') && runItem([['npm', ['i', '-g', '@hytime/hyc']]], run) !== 'ok') failures.push('hyc');
  if (options.missing.includes('skills')) {
    const steps: Array<[string, string[]]> = [
      ['npm', ['i', '-g', '@hytime/hy-companion-skills']],
      ['hy-companion-install', []],
    ];
    if (runItem(steps, run) !== 'ok') failures.push('skills');
  }
  return { ok: failures.length === 0, failures };
}

export interface SelfHealLogger { log(...args: unknown[]): void; warn(...args: unknown[]): void }

export function installGuidance(failures: string[]): string {
  const commands: string[] = [];
  if (failures.includes('hyc')) commands.push('npm i -g @hytime/hyc');
  if (failures.includes('skills')) commands.push('npm i -g @hytime/hy-companion-skills && hy-companion-install');
  return commands.join(' 或 ');
}

export async function runSelfHeal(options: {
  check?: typeof checkPrereqs;
  install?: typeof installMissing;
  log?: SelfHealLogger;
}): Promise<void> {
  const check = options.check ?? checkPrereqs;
  const install = options.install ?? installMissing;
  const log = options.log ?? console;
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
      log.warn(`[dsh-companion] 前置安装失败(${result.failures.join(', ')}),请手动运行:hy-companion-check 或 ${installGuidance(result.failures)}`);
    }
  } catch (error) {
    log.warn(`[dsh-companion] 前置自检失败,跳过自愈:${error instanceof Error ? error.message : String(error)}`);
  }
}
