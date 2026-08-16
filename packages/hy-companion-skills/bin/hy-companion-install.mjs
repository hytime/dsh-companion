#!/usr/bin/env node
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installSkills, parseArgs } from '../lib/installer.mjs';

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  console.log('usage: hy-companion-install [--dsh-home <dir>] [--force]');
  process.exit(0);
}
const sourceDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills');
const result = await installSkills({ sourceDir, targetDir: join(opts.dshHome, 'skills'), force: opts.force });
console.log(`[hy-companion-install] 安装 ${result.installed.length} 个，跳过 ${result.skipped.length} 个 → ${join(opts.dshHome, 'skills')}`);
if (result.installed.length === 0 && result.skipped.length === 0) process.exit(1);
