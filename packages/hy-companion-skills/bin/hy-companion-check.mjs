#!/usr/bin/env node
import { checkPrereqs, parseArgs } from '../lib/check.mjs';

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  console.log('usage: hy-companion-check [--dsh-home <dir>]   —— 安装前端插件前的前置门禁');
  process.exit(0);
}

const prefix = '[hy-companion-check]';
const { ok, missing, hyc, skills } = await checkPrereqs({ dshHome: opts.dshHome });

if (hyc === 'ok') console.log(`${prefix} hyc CLI 就绪：OK`);
else console.log(`${prefix} hyc CLI 缺失：MISSING（请先安装：npm i -g @hytime/hyc）`);

if (skills === 'ok') console.log(`${prefix} DSH 技能就绪：OK`);
else console.log(`${prefix} DSH 技能缺失：MISSING（请先安装：npm i -g @hytime/hy-companion-skills && hy-companion-install）`);

if (ok) {
  console.log(`${prefix} 可以安装前端插件`);
  process.exit(0);
}
console.log(`${prefix} 前置检查未通过，请按上述指引补齐（缺失：${missing.join('、')}）`);
process.exit(1);
