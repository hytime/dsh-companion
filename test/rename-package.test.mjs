import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/rename-package.mjs', import.meta.url));
let root;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'rename-pkg-'));
  await mkdir(join(root, 'packages/dsh-companion/src/contracts'), { recursive: true });
  await mkdir(join(root, 'packages/hyc'), { recursive: true });
  await writeFile(join(root, 'packages/dsh-companion/package.json'),
    JSON.stringify({ name: '@hytime/dsh-companion', peerDependencies: {} }));
  await writeFile(join(root, 'packages/hyc/package.json'),
    JSON.stringify({ name: '@hytime/hyc', optionalDependencies: { '@hytime/hyc-darwin-arm64': '0.1.0' } }));
  await writeFile(join(root, 'packages/dsh-companion/cordis.patch.yml'),
    "- id: dsh-companion\n  name: '@hytime/dsh-companion'\n");
  await writeFile(join(root, 'packages/dsh-companion/src/contracts/remote-descriptors.ts'),
    "export const REMOTE_PACKAGE = '@hytime/dsh-companion';\n");
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe('rename-package', () => {
  it('把 @hytime 重写为 @新scope（package.json/cordis.patch.yml/REMOTE_PACKAGE）', () => {
    execFileSync('node', [script, 'hytime2', '--root', root], { encoding: 'utf8' });
    const pkg = JSON.parse(readFileSync(join(root, 'packages/dsh-companion/package.json'), 'utf8'));
    expect(pkg.name).toBe('@hytime2/dsh-companion');
    const hyc = JSON.parse(readFileSync(join(root, 'packages/hyc/package.json'), 'utf8'));
    expect(hyc.optionalDependencies['@hytime2/hyc-darwin-arm64']).toBe('0.1.0');
    const patch = readFileSync(join(root, 'packages/dsh-companion/cordis.patch.yml'), 'utf8');
    expect(patch).toContain("name: '@hytime2/dsh-companion'");
    const desc = readFileSync(join(root, 'packages/dsh-companion/src/contracts/remote-descriptors.ts'), 'utf8');
    expect(desc).toContain("REMOTE_PACKAGE = '@hytime2/dsh-companion'");
  });
});
