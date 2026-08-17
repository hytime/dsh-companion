/**
 * 开发模式双表注册用：`@deepseek-ai/dsh-typert-protocol/src/index.ts` 子路径
 * 在运行时经包的 exports 映射解析到 workspace 源码（tsx 加载），但发布产物
 * 不含 src，tsconfig 的模块解析也可能不跟随 exports 到该子路径——这里为
 * 类型检查声明同一契约（与主入口一致），运行时解析失败由调用方兜底。
 */
declare module '@deepseek-ai/dsh-typert-protocol/src/index.ts' {
  export * from '@deepseek-ai/dsh-typert-protocol';
}
