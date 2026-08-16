import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'test/**/*.test.mjs',
      'packages/hy-companion-skills/test/**/*.test.mjs',
      'packages/hyc/test/**/*.test.mjs',
    ],
  },
});
