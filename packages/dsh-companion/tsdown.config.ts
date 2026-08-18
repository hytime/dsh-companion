// apps/dsh-companion/tsdown.config.ts
import { readFile } from 'node:fs/promises'
import { basename, resolve as resolvePath, dirname } from 'node:path'
import { defineConfig } from 'tsdown'
import { transform } from 'lightningcss'

const ID = '@hytime/dsh-companion'

// CSS Modules：把 .module.css 编译成 hash 类名 + <style data-plugin> 注入
const cssModulePlugin = {
  name: 'dsh-css-modules-inline',
  resolveId(source: string, importer: string | undefined) {
    if (!source.endsWith('.module.css')) return null
    return '\0dsh-css:' + (importer ? resolvePath(dirname(importer), source) : source) + '.mjs'
  },
  async load(virtualId: string) {
    if (!virtualId.startsWith('\0dsh-css:')) return null
    const file = virtualId.slice('\0dsh-css:'.length, -'.mjs'.length)
    const { code, exports: cssExports } = transform({ filename: file, code: await readFile(file), cssModules: { pattern: '[hash]_[local]' }, minify: true })
    const map: Record<string, string> = {}
    for (const [local, exp] of Object.entries(cssExports ?? {})) map[local] = exp.name
    return [
      `const css = ${JSON.stringify(code.toString())};`,
      `const tagId = ${JSON.stringify(`${ID}/${basename(file)}`)};`,
      'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
      '  const tag = document.createElement(\'style\');',
      `  tag.dataset.plugin = ${JSON.stringify(ID)};`,
      '  tag.dataset.pluginCss = tagId;',
      '  tag.textContent = css;',
      '  document.head.appendChild(tag);',
      '}',
      `export default ${JSON.stringify(map)};`,
    ].join('\n')
  },
}

export default defineConfig([
  // host half → lib/index.js (ESM, node)
  {
    entry: { index: 'lib/types/host/index.js' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    dts: false,
    fixedExtension: false, // package type:module → 产出 lib/index.js（ESM），而非 lib/index.mjs
    clean: false, // 与 client 半共存，勿用 true（会清掉 lib/client.js）
    external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-typert-protocol', /^node:/],
  },
  // client half → lib/client.js (CJS, browser, __ModuleLoader__.load)
  {
    entry: { client: 'lib/types/client/index.js' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    dts: false,
    clean: false,
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/dsh-client-ui-primitives'],
    plugins: [cssModulePlugin],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
