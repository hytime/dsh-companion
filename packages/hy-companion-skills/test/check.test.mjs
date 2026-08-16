import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPrereqs, parseArgs } from '../lib/check.mjs';

let root;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'hy-check-'));
});
afterAll(() => rm(root, { recursive: true, force: true }));

async function makeHome(...skills) {
  const dshHome = await mkdtemp(join(root, 'home-'));
  for (const name of skills) await mkdir(join(dshHome, 'skills', name), { recursive: true });
  return dshHome;
}

describe('checkPrereqs', () => {
  it('hyc 缺失且技能缺失 → ok:false，missing 含 hyc 与 skills', async () => {
    const hycProbe = () => { throw Object.assign(new Error('spawn hyc ENOENT'), { code: 'ENOENT' }); };
    const result = await checkPrereqs({ dshHome: await makeHome(), hycProbe });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['hyc', 'skills']);
  });

  it('hyc 存在且技能目录含 hy-companion 与 hy-companion-chat → ok:true', async () => {
    const hycProbe = () => ({ error: null, status: 0 });
    const result = await checkPrereqs({
      dshHome: await makeHome('hy-companion', 'hy-companion-chat'),
      hycProbe,
    });
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('hyc 存在但技能缺失 → ok:false，missing 只含 skills', async () => {
    const hycProbe = () => ({ error: null, status: 0 });
    const result = await checkPrereqs({ dshHome: await makeHome(), hycProbe });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['skills']);
  });

  it('hyc 缺失但技能存在 → ok:false，missing 只含 hyc', async () => {
    const hycProbe = () => { throw Object.assign(new Error('spawn hyc ENOENT'), { code: 'ENOENT' }); };
    const result = await checkPrereqs({
      dshHome: await makeHome('hy-companion', 'hy-companion-chat'),
      hycProbe,
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['hyc']);
  });
});

describe('parseArgs', () => {
  it('解析 --dsh-home', () => {
    expect(parseArgs(['--dsh-home', '/tmp/x'])).toMatchObject({ dshHome: '/tmp/x', help: false });
  });
  it('--help 置位', () => {
    expect(parseArgs(['--help']).help).toBe(true);
  });
  it('缺省使用 $HOME/.dsh', () => {
    expect(parseArgs([]).dshHome).toBe(join(process.env.HOME ?? '', '.dsh'));
  });
});
