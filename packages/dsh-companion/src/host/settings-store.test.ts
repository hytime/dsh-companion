import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_SETTINGS,
  type CompanionSettings,
  readSettings,
  writeSettings,
} from './settings-store';

describe('readSettings', () => {
  let dir: string;
  let configPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'settings-store-'));
    configPath = join(dir, '.hy-companion', 'config.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('配置文件不存在 → 返回缺省设置', async () => {
    await expect(readSettings({ configPath })).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('配置文件存在 → 读取并解析,缺失字段回落到缺省', async () => {
    await mkdir(join(dir, '.hy-companion'), { recursive: true });
    await writeFile(configPath, JSON.stringify({ companionName: '小鲸', reminderIntervalMin: 30 }), 'utf8');
    await expect(readSettings({ configPath })).resolves.toEqual({
      ...DEFAULT_SETTINGS,
      companionName: '小鲸',
      reminderIntervalMin: 30,
    });
  });

  it('配置文件为非法 JSON → 返回缺省且不抛出', async () => {
    await mkdir(join(dir, '.hy-companion'), { recursive: true });
    await writeFile(configPath, '{ 这不是合法 JSON', 'utf8');
    await expect(readSettings({ configPath })).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('文件含未知字段 → 返回值仅含 6 个已知字段(未知字段不泄漏)', async () => {
    await mkdir(join(dir, '.hy-companion'), { recursive: true });
    await writeFile(configPath, JSON.stringify({ companionName: '小鲸', token: 'secret' }), 'utf8');
    await expect(readSettings({ configPath })).resolves.toEqual({
      ...DEFAULT_SETTINGS,
      companionName: '小鲸',
    });
  });
});

describe('writeSettings', () => {
  let dir: string;
  let configPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'settings-store-'));
    configPath = join(dir, '.hy-companion', 'config.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('深合并:只更新传入字段,其余保留;父目录不存在时自动创建', async () => {
    const result = await writeSettings({ companionName: '小鲸', showBubble: false }, { configPath });
    expect(result).toEqual({ ok: true });
    const raw = JSON.parse(await readFile(configPath, 'utf8')) as CompanionSettings;
    expect(raw).toEqual({ ...DEFAULT_SETTINGS, companionName: '小鲸', showBubble: false });
  });

  it('连续写入:第二次只更新传入字段,第一次的修改保留', async () => {
    await writeSettings({ companionName: '小鲸' }, { configPath });
    await writeSettings({ reminderIntervalMin: 120 }, { configPath });
    await expect(readSettings({ configPath })).resolves.toEqual({
      ...DEFAULT_SETTINGS,
      companionName: '小鲸',
      reminderIntervalMin: 120,
    });
  });

  it('只写配置的 6 个已知字段(未知字段被忽略)', async () => {
    const extra = { companionName: '小鲸', token: 'must-not-persist' } as unknown as Partial<CompanionSettings>;
    const result = await writeSettings(extra, { configPath });
    expect(result).toEqual({ ok: true });
    const raw = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(raw).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('文件预置未知字段 → 写入后落盘键集合仍恰好为 6 个已知字段', async () => {
    await mkdir(join(dir, '.hy-companion'), { recursive: true });
    await writeFile(configPath, JSON.stringify({ evil: 'x', token: 'secret' }), 'utf8');
    const result = await writeSettings({ companionName: '小鲸' }, { configPath });
    expect(result).toEqual({ ok: true });
    const raw = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(raw).sort()).toEqual(
      ['companionName', 'userCallName', 'showAffection', 'showBubble', 'reminderEnabled', 'reminderIntervalMin'].sort(),
    );
  });

  it('写入失败(注入 writeFile 抛错)→ 返回 { ok:false, error } 不抛出', async () => {
    const failingWriteFile = vi.fn().mockRejectedValue(new Error('EACCES: permission denied, open'));
    const result = await writeSettings({ companionName: '小鲸' }, { configPath, writeFile: failingWriteFile });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('EACCES');
  });
});

describe('configPath 缺省', () => {
  let dir: string;
  let prevHome: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'settings-store-'));
    prevHome = process.env.HOME;
    process.env.HOME = dir;
  });

  afterEach(async () => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    await rm(dir, { recursive: true, force: true });
  });

  it('不传 configPath → 读写 ~/.hy-companion/config.json', async () => {
    await writeSettings({ companionName: '默认路径' }, {});
    await expect(readSettings({})).resolves.toEqual({ ...DEFAULT_SETTINGS, companionName: '默认路径' });
  });
});
