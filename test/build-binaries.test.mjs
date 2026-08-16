import { describe, expect, it } from 'vitest';
import { matrix } from '../scripts/build-binaries.mjs';

describe('build-binaries matrix', () => {
  it('darwin-arm64 输出到平台包 bin/hyc，ldflags 与 install.sh 一致', () => {
    const entry = matrix().find((m) => m.goos === 'darwin' && m.goarch === 'arm64');
    expect(entry).toBeTruthy();
    expect(entry.out).toMatch(/hyc-darwin-arm64\/bin\/hyc$/);
    expect(entry.ldflags).toContain('main.apiProfileVar=production');
  });
});
