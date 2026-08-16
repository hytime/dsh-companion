# @hytime/hyc-darwin-arm64

`hyc` 的 darwin/arm64 平台二进制分包。

`bin/hyc` 由根目录 `scripts/build-binaries.mjs` 交叉编译产出（`.gitignore` 忽略 `bin/`）。
安装后由 `@hytime/hyc` 启动器在 darwin-arm64 平台透传调用。
