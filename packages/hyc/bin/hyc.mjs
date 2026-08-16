#!/usr/bin/env node
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const PLATFORM = `${process.platform}-${process.arch}`;
const PACKAGES = {
  'darwin-arm64': '@hytime/hyc-darwin-arm64',
  'darwin-x64': '@hytime/hyc-darwin-x64',
  'linux-x64': '@hytime/hyc-linux-x64',
  'linux-arm64': '@hytime/hyc-linux-arm64',
  'win32-x64': '@hytime/hyc-win32-x64',
};
const pkg = PACKAGES[PLATFORM];
if (!pkg) {
  console.error(`hyc: 不支持的平台 ${PLATFORM}（当前提供 darwin-arm64）`);
  process.exit(1);
}
let binPath;
try {
  binPath = join(dirname(require.resolve(`${pkg}/package.json`)), 'bin', process.platform === 'win32' ? 'hyc.exe' : 'hyc');
} catch {
  console.error(`hyc: 缺少平台包 ${pkg}，请重新安装 @hytime/hyc`);
  process.exit(1);
}
const child = spawn(binPath, process.argv.slice(2), { stdio: 'inherit' });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
