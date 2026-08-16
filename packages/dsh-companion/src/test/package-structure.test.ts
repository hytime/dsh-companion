// src/test/package-structure.test.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as Record<string, unknown>;
const patch = readFileSync(resolve(__dirname, '../../cordis.patch.yml'), 'utf8');

describe('dsh 发布配置', () => {
  it('package.json 声明 dsh.bundle.patch 与 dsh.client', () => {
    const dsh = pkg.dsh as Record<string, unknown>;
    expect((dsh.bundle as Record<string, unknown>).patch).toBe('./cordis.patch.yml');
    expect((dsh.client as Record<string, unknown>).platform).toBe('web');
  });
  it('package.json 有 files / prepare / 真实 version', () => {
    expect(Array.isArray(pkg.files)).toBe(true);
    expect((pkg.files as string[])).toContain('cordis.patch.yml');
    expect(typeof (pkg.scripts as Record<string, unknown>).prepare).toBe('string');
    expect(pkg.version).not.toBe('0.0.0');
  });
  it('peerDependencies 声明三个 @deepseek-ai 运行时包', () => {
    const peer = pkg.peerDependencies as Record<string, string>;
    expect(peer['@deepseek-ai/cordis']).toBeTruthy();
    expect(peer['@deepseek-ai/dsh-typert-protocol']).toBeTruthy();
    expect(peer['@deepseek-ai/dsh-client-ui-primitives']).toBeTruthy();
  });
  it('cordis.patch.yml 插入的 name 等于包名', () => {
    expect(patch).toContain('@your-scope/dsh-companion');
  });
});
