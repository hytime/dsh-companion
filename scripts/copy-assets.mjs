// scripts/copy-assets.mjs
// 把 apps/dsh-companion 的静态资源（鲸鱼娘表情帧）拷贝到库输出目录。
//
// host 半走两段式编译：tsc 先把 src/*.ts 编译到 lib/types/*，tsdown 再打包
// lib/types/* 产出 lib/index.js（ESM）。`defaultAssetRoot()` 用 `import.meta.url`
// 指向 lib/index.js，资源需位于 lib/deepseek-girl-phaser（建后复制到 lib）。
import { cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, '..', 'packages', 'dsh-companion');
const src = join(pkgDir, 'public', 'deepseek-girl-phaser');
const dest = join(pkgDir, 'lib', 'deepseek-girl-phaser');

// 清理旧资源，避免陈旧的帧/atlas 残留。
await rm(dest, { recursive: true, force: true });
await cp(src, dest, { recursive: true });

console.log(`[copy-assets] ${src} → ${dest}`);
