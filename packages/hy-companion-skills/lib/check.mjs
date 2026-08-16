import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

export function parseArgs(argv) {
  const out = { dshHome: process.env.DSH_HOME || join(process.env.HOME || homedir(), '.dsh'), help: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dsh-home') out.dshHome = argv[i + 1];
    else if (argv[i] === '--help') out.help = true;
  }
  return out;
}

const defaultHycProbe = () => spawnSync('hyc', ['--help'], { stdio: 'ignore' });

// 检查项：hyc CLI 与 DSH 技能。
// hyc 通过可注入的 hycProbe 探测（ENOENT 或非 0 退出码 → MISSING）。
// 技能校验口径（README）：<dshHome>/skills 下存在 hy-companion 目录，且 hy-companion-* 目录数 >= 1。
async function checkHyc(hycProbe) {
  let probe;
  try {
    probe = hycProbe();
  } catch (error) {
    probe = { error };
  }
  if (probe.error && probe.error.code === 'ENOENT') return 'missing';
  if (probe.status !== undefined && probe.status !== 0) return 'missing';
  return 'ok';
}

async function checkSkills(dshHome) {
  try {
    const entries = await readdir(join(dshHome, 'skills'), { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const hasBase = dirs.includes('hy-companion');
    const subCount = dirs.filter((n) => n.startsWith('hy-companion-')).length;
    return hasBase && subCount >= 1 ? 'ok' : 'missing';
  } catch {
    return 'missing';
  }
}

export async function checkPrereqs({ dshHome, hycProbe = defaultHycProbe }) {
  const [hyc, skills] = await Promise.all([checkHyc(hycProbe), checkSkills(dshHome)]);
  const missing = [];
  if (hyc !== 'ok') missing.push('hyc');
  if (skills !== 'ok') missing.push('skills');
  return { ok: missing.length === 0, missing, hyc, skills };
}
