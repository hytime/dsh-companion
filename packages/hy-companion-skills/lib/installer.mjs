import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

export function parseArgs(argv) {
  const out = { dshHome: process.env.DSH_HOME || join(process.env.HOME || homedir(), '.dsh'), force: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dsh-home') out.dshHome = argv[i + 1];
    else if (argv[i] === '--force') out.force = true;
    else if (argv[i] === '--help') out.help = true;
  }
  return out;
}

export async function installSkills({ sourceDir, targetDir, force }) {
  const probe = spawnSync('hyc', ['--help'], { stdio: 'ignore' });
  const hycMissing = Boolean(probe.error && probe.error.code === 'ENOENT');
  if (hycMissing) console.warn('[hy-companion-install] 警告：PATH 中未检测到 hyc，请先安装 CLI（npm i -g @hytime/hyc）');
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  const installed = []; const skipped = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const dest = join(targetDir, name);
    if (!force && await exists(dest)) { skipped.push(name); continue; }
    await rm(dest, { recursive: true, force: true });
    await cp(join(sourceDir, name), dest, { recursive: true });
    installed.push(name);
  }
  return { installed, skipped, hycMissing };
}
