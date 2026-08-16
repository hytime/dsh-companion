# @your-scope/hyc

hy-companion CLI（`hyc`）— 平台二进制分包分发启动器。

本包本身只包含启动器 `bin/hyc.mjs`，真正的二进制由各平台分包提供（如
`@your-scope/hyc-darwin-arm64`）。启动器依据 `process.platform-arch` 解析对应平台包，
并把参数与 stdio 透传给平台二进制。

## 安装

```bash
pnpm add @your-scope/hyc
```

平台分包作为 `optionalDependencies` 自动安装。当前提供：`darwin-arm64`。

## 用法

```bash
hyc chat --hello
hyc --help
```

## 支持平台

| 平台 | 分包 |
| ---- | ---- |
| darwin/arm64 | `@your-scope/hyc-darwin-arm64` |

## 构建

平台二进制由根目录 `scripts/build-binaries.mjs` 交叉编译产出（预检用 `--dry-run`）。
