#!/usr/bin/env node
// 在 travel-note-go 交叉编译 hyc 到各平台包。env TRAVEL_NOTE_GO 指定 Go 仓库。
// --dry-run 只打印将要执行的命令（供测试/CI 检查）。
import { spawnSync } from 'node:child_process';
import { mkdir, chmod } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function matrix() {
  const ldflags = '-s -w -X main.apiProfileVar=production';
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  return [
    {
      pkg: 'hyc-darwin-arm64', goos: 'darwin', goarch: 'arm64', exe: 'hyc', ldflags,
      out: join(root, 'packages', 'hyc-darwin-arm64', 'bin', 'hyc'),
    },
    // 后续 CI 补充: darwin-x64 / linux-x64 / linux-arm64 / win32-x64（win exe 后缀 .exe）
  ];
}

const here = dirname(fileURLToPath(import.meta.url));
const goRepo = process.env.TRAVEL_NOTE_GO || '/Volumes/hydisk/vsProject/travel-note-go';
const root = join(here, '..');
const dryRun = process.argv.includes('--dry-run');

// 仅作为脚本直接运行（含 --dry-run）时执行构建循环；被测试 import 时只暴露 matrix()。
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) for (const m of matrix()) {
  const out = join(root, 'packages', m.pkg, 'bin', m.exe);
  const cmd = `go build -ldflags="${m.ldflags}" -o ${out} ./cmd/hycompanion`;
  console.log(`[build-binaries] ${m.goos}/${m.goarch}: ${cmd}`);
  if (dryRun) continue;
  await mkdir(dirname(out), { recursive: true });
  const r = spawnSync('go', ['build', `-ldflags=${m.ldflags}`, '-o', out, './cmd/hycompanion'], {
    cwd: goRepo, stdio: 'inherit', env: { ...process.env, GOOS: m.goos, GOARCH: m.goarch },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
  await chmod(out, 0o755);
}
