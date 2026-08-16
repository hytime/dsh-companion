import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, chmod, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

let base;
beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'hyc-launch-'));
  await mkdir(join(base, 'node_modules/@your-scope/hyc-darwin-arm64/bin'), { recursive: true });
  await writeFile(join(base, 'node_modules/@your-scope/hyc-darwin-arm64/package.json'),
    JSON.stringify({ name: '@your-scope/hyc-darwin-arm64', version: '0.1.0' }));
  await writeFile(join(base, 'node_modules/@your-scope/hyc-darwin-arm64/bin/hyc'),
    '#!/usr/bin/env node\nconsole.log("FAKE-HYC", process.argv.slice(2).join(" "));\n');
  await chmod(join(base, 'node_modules/@your-scope/hyc-darwin-arm64/bin/hyc'), 0o755);
  await cp(new URL('../bin/hyc.mjs', import.meta.url), join(base, 'hyc.mjs'));
});
afterAll(() => rm(base, { recursive: true, force: true }));

describe('hyc launcher', () => {
  it('解析平台包并透传参数/stdio', () => {
    const out = execFileSync('node', [join(base, 'hyc.mjs'), 'chat', '--hello'], { encoding: 'utf8' });
    expect(out.trim()).toBe('FAKE-HYC chat --hello');
  });
});
