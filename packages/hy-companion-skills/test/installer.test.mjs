import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installSkills, parseArgs } from '../lib/installer.mjs';

let base, src, dst;
beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'hy-skills-'));
  src = join(base, 'src'); dst = join(base, 'dst');
  await mkdir(join(src, 'hy-companion'), { recursive: true });
  await mkdir(join(src, 'hy-companion-chat'), { recursive: true });
  await writeFile(join(src, 'hy-companion/SKILL.md'), '# hy-companion v1');
  await writeFile(join(src, 'hy-companion-chat/SKILL.md'), '# chat v1');
});
afterAll(() => rm(base, { recursive: true, force: true }));

describe('installSkills', () => {
  it('复制缺失技能并跳过已存在（幂等）', async () => {
    const first = await installSkills({ sourceDir: src, targetDir: dst, force: false });
    expect(first.installed.sort()).toEqual(['hy-companion', 'hy-companion-chat']);
    await writeFile(join(src, 'hy-companion/SKILL.md'), '# hy-companion v2');
    const second = await installSkills({ sourceDir: src, targetDir: dst, force: false });
    expect(second.skipped).toContain('hy-companion');
    expect(await readFile(join(dst, 'hy-companion/SKILL.md'), 'utf8')).toBe('# hy-companion v1');
  });
  it('--force 覆盖已有技能', async () => {
    const forced = await installSkills({ sourceDir: src, targetDir: dst, force: true });
    expect(forced.installed).toContain('hy-companion');
    expect(await readFile(join(dst, 'hy-companion/SKILL.md'), 'utf8')).toBe('# hy-companion v2');
  });
});
describe('parseArgs', () => {
  it('解析 --dsh-home / --force / 缺省', () => {
    expect(parseArgs(['--dsh-home', '/tmp/x', '--force'])).toMatchObject({ dshHome: '/tmp/x', force: true, help: false });
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs([]).dshHome).toBe(join(process.env.HOME ?? '', '.dsh'));
  });
});
