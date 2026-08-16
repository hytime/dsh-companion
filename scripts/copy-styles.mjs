// scripts/copy-styles.mjs
// 两段式构建的前置步骤：tsc 把 src/*.ts 编译到 lib/types/* 后，产出的
// lib/types/client/plugin.js 仍 `import '../styles/*.module.css'`，相对路径指向
// lib/types/styles/。tsdown 的 cssModulePlugin 在打包 client 半时据此回找并内联
// 样式，因此必须在 tsdown 运行前把 CSS Modules 源拷贝到 lib/types/styles/。
import { cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, '..', 'packages', 'dsh-companion');
const stylesSrc = join(pkgDir, 'src', 'styles');
const stylesDest = join(pkgDir, 'lib', 'types', 'styles');

await rm(stylesDest, { recursive: true, force: true });
await cp(stylesSrc, stylesDest, { recursive: true });

console.log(`[copy-styles] ${stylesSrc} → ${stylesDest}`);
