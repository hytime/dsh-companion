import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 仅配置测试运行器；构建已移交 tsdown（tsdown.config.ts）。
// vite.config.ts 删除后 vitest 不再继承 jsdom 环境、setupFiles 与 React 插件，
// 此处补齐。
//
// 真实 @deepseek-ai/dsh-client-ui-primitives（link 自 deepseek-harness）自带
// node_modules/react@18，会在组件测试里产生双 React（react-dom@19 调 useRef
// 失败）。测试环境强制把 react 系列解析到本仓库的 React 19，与组件一致。
// 用 createRequire 从当前文件解析 react/react-dom 的真实安装路径，
// 避免硬编码 .pnpm 目录结构与版本号（升级/换包管理器不失效）。
const require = createRequire(import.meta.url);
// require.resolve 返回 react 包入口文件（.../react/index.js），
// 用 dirname 取回 react 包根目录，以同时解析 `react` 与 `react/jsx-runtime`。
const reactRoot = dirname(require.resolve('react'));
const reactDomRoot = dirname(require.resolve('react-dom'));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^react$/, replacement: resolve(reactRoot, 'index.js') },
      { find: /^react\//, replacement: reactRoot + '/' },
      { find: /^react-dom$/, replacement: resolve(reactDomRoot, 'index.js') },
      { find: /^react-dom\//, replacement: reactDomRoot + '/' },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // npm 版 @deepseek-ai/dsh-client-ui-primitives 的 lib/index.js 内部
    // `import 'katex/dist/katex.min.css'`（package.json 未声明 katex 依赖）。
    // 该包被外部化时 css 导入落到 Node 加载器报 "Unknown file extension .css"。
    // inline 该包本身，让它的 css 导入走 Vite transform（css:false 下被忽略）；
    // react 系列已由上方 alias 强制解析到本仓库 React 19，无双 React 风险。
    server: {
      deps: {
        inline: [/dsh-client-ui-primitives/, /katex/],
      },
    },
  },
});
