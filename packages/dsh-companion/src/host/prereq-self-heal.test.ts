import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkPrereqs,
  installGuidance,
  installMissing,
  runSelfHeal,
  type SelfHealLogger,
} from './prereq-self-heal';

describe('checkPrereqs', () => {
  let dshHome: string;
  let skillsDir: string;

  beforeEach(async () => {
    dshHome = await mkdtemp(join(tmpdir(), 'prereq-self-heal-'));
    skillsDir = join(dshHome, 'skills');
  });

  afterEach(async () => {
    await rm(dshHome, { recursive: true, force: true });
  });

  it('hyc 探测成功 + 技能目录含 hy-companion 与 hy-companion-chat → hyc/skills 均 ok', async () => {
    await mkdir(join(skillsDir, 'hy-companion'), { recursive: true });
    await mkdir(join(skillsDir, 'hy-companion-chat'), { recursive: true });
    const hycProbe = () => ({ status: 0 });
    await expect(checkPrereqs({ dshHome, hycProbe })).resolves.toEqual({ hyc: 'ok', skills: 'ok' });
  });

  it('hyc 探测抛 ENOENT 错误 → hyc: missing', async () => {
    await mkdir(join(skillsDir, 'hy-companion'), { recursive: true });
    await mkdir(join(skillsDir, 'hy-companion-chat'), { recursive: true });
    const err: NodeJS.ErrnoException = new Error('ENOENT');
    err.code = 'ENOENT';
    const hycProbe = () => {
      throw err;
    };
    await expect(checkPrereqs({ dshHome, hycProbe })).resolves.toEqual({ hyc: 'missing', skills: 'ok' });
  });

  it('hyc 探测返回 { status: 1 } → hyc: missing', async () => {
    await mkdir(join(skillsDir, 'hy-companion'), { recursive: true });
    await mkdir(join(skillsDir, 'hy-companion-chat'), { recursive: true });
    const hycProbe = () => ({ status: 1 });
    await expect(checkPrereqs({ dshHome, hycProbe })).resolves.toEqual({ hyc: 'missing', skills: 'ok' });
  });

  it('skills 目录不存在 → skills: missing', async () => {
    const hycProbe = () => ({ status: 0 });
    await expect(checkPrereqs({ dshHome, hycProbe })).resolves.toEqual({ hyc: 'ok', skills: 'missing' });
  });

  it('skills 目录存在但无 hy-companion → skills: missing', async () => {
    await mkdir(join(skillsDir, 'other'), { recursive: true });
    await mkdir(join(skillsDir, 'hy-companion-chat'), { recursive: true });
    const hycProbe = () => ({ status: 0 });
    await expect(checkPrereqs({ dshHome, hycProbe })).resolves.toEqual({ hyc: 'ok', skills: 'missing' });
  });

  it('skills 目录只有 hy-companion 无 hy-companion-* → skills: missing', async () => {
    await mkdir(join(skillsDir, 'hy-companion'), { recursive: true });
    const hycProbe = () => ({ status: 0 });
    await expect(checkPrereqs({ dshHome, hycProbe })).resolves.toEqual({ hyc: 'ok', skills: 'missing' });
  });

  it('dshHome 缺省时解析为 $DSH_HOME || $HOME/.dsh', async () => {
    const prevDshHome = process.env.DSH_HOME;
    const prevHome = process.env.HOME;
    process.env.DSH_HOME = dshHome;
    process.env.HOME = '/nonexistent-home';
    try {
      await mkdir(join(dshHome, 'skills', 'hy-companion'), { recursive: true });
      await mkdir(join(dshHome, 'skills', 'hy-companion-chat'), { recursive: true });
      const hycProbe = () => ({ status: 0 });
      await expect(checkPrereqs({ hycProbe })).resolves.toEqual({ hyc: 'ok', skills: 'ok' });
    } finally {
      if (prevDshHome === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = prevDshHome;
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
    }
  });
});

describe('installMissing', () => {
  it('missing: [hyc] → 用 npm i -g @hytime/hyc 安装 hyc，且不装 skills', async () => {
    const calls: Array<[string, string[]]> = [];
    const run = (cmd: string, args: string[]) => {
      calls.push([cmd, args]);
      return { status: 0 };
    };
    const result = await installMissing({ missing: ['hyc'], run });
    expect(result).toEqual({ ok: true, failures: [] });
    expect(calls).toEqual([['npm', ['i', '-g', '@hytime/hyc']]]);
  });

  it('missing: [skills] → 装技能包后运行 hy-companion-install，且不装 hyc', async () => {
    const calls: Array<[string, string[]]> = [];
    const run = (cmd: string, args: string[]) => {
      calls.push([cmd, args]);
      return { status: 0 };
    };
    const result = await installMissing({ missing: ['skills'], run });
    expect(result).toEqual({ ok: true, failures: [] });
    expect(calls).toEqual([
      ['npm', ['i', '-g', '@hytime/hy-companion-skills']],
      ['hy-companion-install', []],
    ]);
  });

  it('missing: [] → 不调用 run，ok 为 true', async () => {
    const calls: Array<[string, string[]]> = [];
    const run = (cmd: string, args: string[]) => {
      calls.push([cmd, args]);
      return { status: 0 };
    };
    const result = await installMissing({ missing: [], run });
    expect(result).toEqual({ ok: true, failures: [] });
    expect(calls).toEqual([]);
  });

  it('run 返回 { status: 1 } → ok 为 false，failures 含该项且不抛出', async () => {
    const run = () => ({ status: 1 });
    const result = await installMissing({ missing: ['hyc'], run });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('hyc');
  });

  it('run 抛非 ENOENT 错误(如 new Error(\'boom\')) → 统一降级为 failed，不抛出', async () => {
    const run = () => {
      throw new Error('boom');
    };
    await expect(installMissing({ missing: ['hyc'], run })).resolves.toEqual({
      ok: false,
      failures: ['hyc'],
    });
  });
});

describe('runSelfHeal', () => {
  const readyCheck = async () => ({ hyc: 'ok' as const, skills: 'ok' as const });
  const okInstall = async () => ({ ok: true, failures: [] });

  /** 收集 log/warn 调用的替身日志。 */
  function captureLog(): { calls: Array<[string, string[]]>; log: SelfHealLogger } {
    const calls: Array<[string, string[]]> = [];
    const log: SelfHealLogger = {
      log: (...args) => calls.push(['log', args.map(String)]),
      warn: (...args) => calls.push(['warn', args.map(String)]),
    };
    return { calls, log };
  }

  it('全部就绪 → log 收到「前置就绪(hyc ✓, skills ✓)」，不调用 install', async () => {
    const { calls, log } = captureLog();
    const install = vi.fn(okInstall);
    await runSelfHeal({ check: readyCheck, install, log });
    expect(install).not.toHaveBeenCalled();
    expect(calls.some(([m, a]) => m === 'log' && a.includes('[dsh-companion] 前置就绪(hyc ✓, skills ✓)'))).toBe(
      true,
    );
  });

  it('缺失 hyc → missing 数组为 [\'hyc\']，install 收到正确参数', async () => {
    const { log } = captureLog();
    const install = vi.fn(okInstall);
    await runSelfHeal({
      check: async () => ({ hyc: 'missing' as const, skills: 'ok' as const }),
      install,
      log,
    });
    expect(install).toHaveBeenCalledWith({ missing: ['hyc'] });
  });

  it('install 返回失败 → log 收到含手动指引的失败警告', async () => {
    const { calls, log } = captureLog();
    await runSelfHeal({
      check: async () => ({ hyc: 'missing' as const, skills: 'ok' as const }),
      install: async () => ({ ok: false, failures: ['hyc'] }),
      log,
    });
    const warn = calls.filter(([m]) => m === 'warn').map(([, a]) => a[0]);
    expect(warn.some((w) => (w ?? '').includes('前置安装失败(hyc)') && (w ?? '').includes('npm i -g @hytime/hyc'))).toBe(true);
  });

  it('check 抛错 → log 收到「前置自检失败」，runSelfHeal 不抛出', async () => {
    const { calls, log } = captureLog();
    const install = vi.fn(okInstall);
    await expect(
      runSelfHeal({
        check: async () => {
          throw new Error('check exploded');
        },
        install,
        log,
      }),
    ).resolves.toBeUndefined();
    expect(install).not.toHaveBeenCalled();
    expect(calls.some(([m, a]) => m === 'warn' && (a[0] ?? '').includes('前置自检失败'))).toBe(true);
  });
});

describe('installGuidance', () => {
  it('仅 hyc → 提示 hyc 命令', () => {
    expect(installGuidance(['hyc'])).toBe('npm i -g @hytime/hyc');
  });

  it('仅 skills → 提示技能安装命令', () => {
    expect(installGuidance(['skills'])).toBe('npm i -g @hytime/hy-companion-skills && hy-companion-install');
  });

  it('两者都含 → 合并两条命令', () => {
    const g = installGuidance(['hyc', 'skills']);
    expect(g).toContain('npm i -g @hytime/hyc');
    expect(g).toContain('npm i -g @hytime/hy-companion-skills && hy-companion-install');
    expect(g).toContain(' 或 ');
  });
});
