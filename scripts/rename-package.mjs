#!/usr/bin/env node
// 用法: node scripts/rename-package.mjs <scope> [--root <dir>]
// 把仓库内所有当前 scope @hytime/*（package.json 包名、cordis.patch.yml、REMOTE_PACKAGE）改为 @<scope>/*
// scope 已定型为 @hytime，仅当需要整体更换 scope 时才运行本脚本
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const toAbs = (p) => (isAbsolute(p) ? p : resolve(p));

const args = process.argv.slice(2);
const scope = args.find((a) => !a.startsWith('--'));
const rootIdx = args.indexOf('--root');
if (!scope || !/^[a-z0-9][a-z0-9-]*$/.test(scope)) {
  console.error('用法: node scripts/rename-package.mjs <scope> [--root <dir>]');
  process.exit(1);
}
const root = rootIdx >= 0 ? toAbs(args[rootIdx + 1]) : dirname(dirname(fileURLToPath(import.meta.url)));
const OLD = '@hytime';
const NEW = `@${scope}`;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'lib' || entry.name === '.git') continue;
      yield* walk(full);
    } else if (entry.isFile()) yield full;
  }
}

let changed = 0;
for await (const file of walk(root)) {
  const isTarget = file.endsWith('package.json') ||
    file.endsWith('cordis.patch.yml') ||
    file.endsWith('remote-descriptors.ts');
  if (!isTarget) continue;
  const text = await readFile(file, 'utf8');
  if (!text.includes(OLD)) continue;
  await writeFile(file, text.split(OLD).join(NEW));
  console.log(`[rename] ${file}`);
  changed += 1;
}
if (changed === 0) console.warn('[rename] 没有发现 @hytime 引用');
