import type { CompanionSettings, WriteResult } from './settings-store';
import type {
  CommandResult,
  RunCmd,
  ScheduleAction,
  ScheduleListResult,
} from './companion-commands';

/**
 * settings-rpc —— companion.* 配置 RPC 的 handler 表组装。
 *
 * 静态打包插件不走 harness.handle(那是动态 Cordis 插件机制);Host 侧正式通道是
 * TypertRemoteService 子类 + @Remote 方法(见 plugin.ts 的 CompanionRemote)。
 * 本模块只负责「依赖注入 + 方法名 → 业务调用」的纯函数组装,便于单测:
 * CompanionRemote 的每个 @Remote 方法内部调用这里返回的 handler 表,而
 * 本模块不接触 ctx / 网络 / 终端,store 与 commands 全部注入。
 *
 * 约定:
 * - handler 表恰好 10 个方法名(authStatus / login / register / logout /
 *   getConfig / setConfig / listSchedules / enableSchedule / disableSchedule /
 *   deleteSchedule),与 Client 侧 remote-contract 的 companion.* 方法一一对应。
 * - 所有 handler 返回 `{ ok, ...data, error? }` 信封,绝不抛出;
 *   依赖抛出的异常统一折叠为 `{ ok:false, error }`。
 * - 方法参数形状对齐远程调用语义:login/register 收 `{username,password}`,
 *   schedule 三方法收 `{id}`,setConfig 直接收 partial 配置对象。
 */

/** RPC handler 的依赖面:配置存储 + 认证/schedule 命令(全部可注入替身)。 */
export interface SettingsRpcDeps {
  store: {
    readSettings(options?: { configPath?: string }): Promise<CompanionSettings>;
    writeSettings(partial: Partial<CompanionSettings>, options?: { configPath?: string }): Promise<WriteResult>;
  };
  commands: {
    checkAuthStatus(options?: { run?: RunCmd }): Promise<'authenticated' | 'unauthenticated'>;
    loginWithCredentials(username: string, password: string, options?: { run?: RunCmd }): Promise<CommandResult>;
    registerWithCredentials(username: string, password: string, options?: { run?: RunCmd }): Promise<CommandResult>;
    logout(options?: { run?: RunCmd }): Promise<CommandResult>;
    listSchedules(options?: { run?: RunCmd }): Promise<ScheduleListResult>;
    scheduleAction(action: ScheduleAction, id: string, options?: { run?: RunCmd }): Promise<CommandResult>;
  };
}

export type AuthStatusResult = { ok: true; status: 'authenticated' | 'unauthenticated' } | { ok: false; error: string };

export type GetConfigResult = ({ ok: true } & CompanionSettings) | { ok: false; error: string };

/** 10 个 companion.* 方法的 handler 表(键名即远程方法名)。 */
export interface SettingsRpcHandlers {
  authStatus(): Promise<AuthStatusResult>;
  login(args: { username: string; password: string }): Promise<CommandResult>;
  register(args: { username: string; password: string }): Promise<CommandResult>;
  logout(): Promise<CommandResult>;
  getConfig(): Promise<GetConfigResult>;
  setConfig(partial: Partial<CompanionSettings>): Promise<WriteResult>;
  listSchedules(): Promise<ScheduleListResult>;
  enableSchedule(args: { id: string }): Promise<CommandResult>;
  disableSchedule(args: { id: string }): Promise<CommandResult>;
  deleteSchedule(args: { id: string }): Promise<CommandResult>;
}

/**
 * 把依赖调用包进 try/catch:成功原样返回,异常折叠为 { ok:false, error }
 * (message 优先,非 Error 转 String),保证 handler 永不抛出。
 */
async function safeResult<T>(run: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await run();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** 按方法名组装 handler 表:每个 handler 内部只做参数适配 + 依赖透传。 */
export function createSettingsHandlers(deps: SettingsRpcDeps): SettingsRpcHandlers {
  return {
    authStatus: () =>
      safeResult(async () => ({
        ok: true as const,
        status: await deps.commands.checkAuthStatus(),
      })),
    login: ({ username, password }) =>
      safeResult(() => deps.commands.loginWithCredentials(username, password)),
    register: ({ username, password }) =>
      safeResult(() => deps.commands.registerWithCredentials(username, password)),
    logout: () => safeResult(() => deps.commands.logout()),
    getConfig: () =>
      safeResult(async () => ({
        ok: true as const,
        ...(await deps.store.readSettings()),
      })),
    setConfig: (partial) => safeResult(() => deps.store.writeSettings(partial)),
    listSchedules: () => safeResult(() => deps.commands.listSchedules()),
    enableSchedule: ({ id }) => safeResult(() => deps.commands.scheduleAction('enable', id)),
    disableSchedule: ({ id }) => safeResult(() => deps.commands.scheduleAction('disable', id)),
    deleteSchedule: ({ id }) => safeResult(() => deps.commands.scheduleAction('delete', id)),
  };
}
