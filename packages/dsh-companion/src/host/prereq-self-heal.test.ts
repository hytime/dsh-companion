import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPrereqs, installMissing } from './prereq-self-heal';

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
});
