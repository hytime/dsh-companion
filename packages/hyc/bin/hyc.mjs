#!/usr/bin/env node
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const PLATFORM = `${process.platform}-${process.arch}`;
const PACKAGES = {
  'darwin-arm64': '@your-scope/hyc-darwin-arm64',
  'darwin-x64': '@your-scope/hyc-darwin-x64',
  'linux-x64': '@your-scope/hyc-linux-x64',
  'linux-arm64': '@your-scope/hyc-linux-arm64',
  'win32-x64': '@your-scope/hyc-win32-x64',
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
  console.error(`hyc: 缺少平台包 ${pkg}，请重新安装 @your-scope/hyc`);
  process.exit(1);
}
const child = spawn(binPath, process.argv.slice(2), { stdio: 'inherit' });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
