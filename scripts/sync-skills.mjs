#!/usr/bin/env node
// 从 travel-note-go 同步 DSH 技能到技能包。env TRAVEL_NOTE_GO 指定 Go 仓库路径。
import { cp, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const goRepo = process.env.TRAVEL_NOTE_GO || '/Volumes/hydisk/vsProject/travel-note-go';
const src = join(goRepo, 'build', 'skill', 'dsh', 'hy-companion');
const dest = join(here, '..', 'packages', 'hy-companion-skills', 'skills');
await rm(dest, { recursive: true, force: true });
await cp(src, dest, { recursive: true });
console.log(`[sync-skills] ${src} → ${dest}`);
