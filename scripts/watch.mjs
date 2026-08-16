#!/usr/bin/env node
// scripts/watch.mjs — dsh-companion 开发热更：watch src/，防抖后跑完整 build。
//
// 两段式构建（tsc → copy-styles → tsdown → copy-assets）里 copy-styles 需要在
// tsdown 前把 src/styles/*.module.css 拷到 lib/types/styles/，tsc --watch 不会
// 搬运 css，所以不能只用 tsc/tsdown 双 watch。这里 watch src/ 目录，任一文件
// 变化（防抖 300ms）后执行完整 `pnpm build`，产出 lib/index.js + lib/client.js，
// 由 DSH 的 host hmr / client-hmr 负责重载。
import { execSync } from 'node:child_process';
import { watch } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, '..', 'packages', 'dsh-companion');
const srcDir = join(pkgDir, 'src');

let timer;
let building = false;

function rebuild() {
  if (building) return;
  building = true;
  const started = Date.now();
  console.log('[watch] change detected — rebuilding…');
  try {
    execSync('pnpm build', { cwd: pkgDir, stdio: 'inherit' });
    console.log(`[watch] rebuilt in ${Date.now() - started}ms`);
  } catch (error) {
    console.error('[watch] build failed:', String(error));
  } finally {
    building = false;
  }
}

const watcher = watch(srcDir, { recursive: true });
console.log(`[watch] watching ${srcDir} — save a file to rebuild (HMR will reload)`);
for await (const _event of watcher) {
  clearTimeout(timer);
  timer = setTimeout(rebuild, 300);
}
