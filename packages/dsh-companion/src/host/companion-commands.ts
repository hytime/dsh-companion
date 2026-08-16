import { spawnSync } from 'node:child_process';

/**
 * companion-commands —— 认证与 schedule 命令执行模块。
 *
 * 所有命令执行都经由可注入的 run(cmd, args, options?) 完成（缺省 spawnSync），
 * 便于单测注入替身断言命令构造与 stdin 喂入，避免测试触碰真实 hyc / 终端。
 *
 * 命令形态与真实 hyc CLI 对齐（已对线上二进制逐条核实）：
 * - hyc login / hyc register 只认交互式终端（term.ReadPassword 读取 stdin fd，
 *   非 tty 时直接失败），故用 `script -q /dev/null hyc login` 伪终端喂入
 *   账号密码；register 额外有一次「确认密码」提示，共喂三行。
 * - hyc schedule enable|disable|delete 通过 `--id <id>` flag 指定事件
 *   （位置参数会得到 "unknown command" 错误）。
 * - CLI 错误统一输出 JSON 信封 `{"error":"..."}` 到 stdout，且部分场景
 *   （schedule enable/disable/delete 的 server 错误）退出码仍为 0，
 *   因此成功判定 = 无 error 信封 && 退出码 0，错误一律原样透传。
 */

export interface ScheduleItem {
  id: string;
  title: string;
  message: string;
  enabled: boolean;
  repeatRule: string;
  slot: string;
  timeOfDay: string;
  createdAt: string;
  updatedAt: string;
  confidence: number;
  sourceQuery: string | null;
  userId: string;
}

export interface RunResult {
  status?: number | null;
  error?: unknown;
  stdout?: string;
  stderr?: string;
}

export interface RunOptions {
  /** 写入子进程 stdin 的内容（script 伪终端登录喂入账号密码）。 */
  input?: string;
}

export type RunCmd = (cmd: string, args: string[], options?: RunOptions) => RunResult;

export interface CommandResult {
  ok: boolean;
  error?: string;
}

export interface ScheduleListResult {
  ok: boolean;
  items?: ScheduleItem[];
  error?: string;
}

export type ScheduleAction = 'enable' | 'disable' | 'delete';

/** 缺省命令执行器：spawnSync + utf8，input 经 stdin 喂入。 */
const defaultRun: RunCmd = (cmd, args, options) =>
  spawnSync(cmd, args, {
    input: options?.input,
    encoding: 'utf8',
  });

/** script 伪终端不可用（非 POSIX 平台/无 script 命令）时的固定提示。 */
const PLATFORM_UNSUPPORTED_LOGIN = '当前平台不支持页面内登录,请在终端运行 hyc login';

/** 统一捕获 run 抛出的异常（spawnSync 不抛，注入替身可能抛）。 */
function runOrCatch(run: RunCmd, cmd: string, args: string[], options?: RunOptions): RunResult {
  try {
    return run(cmd, args, options);
  } catch (error) {
    return { error };
  }
}

function isEnoent(result: RunResult): boolean {
  return Boolean(result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT');
}

/**
 * 从 stdout 中提取 CLI 的 JSON 错误信封（{"error":"..."}），找不到返回 undefined。
 * script 伪终端的 stdout 是终端转录，逐行尝试解析以容忍提示符混排。
 */
function extractJsonError(stdout: string | undefined): string | undefined {
  if (!stdout) return undefined;
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        typeof (parsed as { error?: unknown }).error === 'string'
      ) {
        const message = (parsed as { error: string }).error.trim();
        if (message) return message;
      }
    } catch {
      // 非 JSON 行，跳过继续找下一行。
    }
  }
  return undefined;
}

/** hyc 错误原样透传：优先 stdout 的 JSON error 字段，其次 stderr，再次 stdout，最后 error.message。 */
function passthroughError(result: RunResult): string {
  const jsonError = extractJsonError(result.stdout);
  if (jsonError) return jsonError;
  const stderr = (result.stderr ?? '').trim();
  if (stderr) return stderr;
  const stdout = (result.stdout ?? '').trim();
  if (stdout) return stdout;
  if (result.error) return result.error instanceof Error ? result.error.message : String(result.error);
  return 'hyc 命令执行失败';
}

/**
 * 认证状态探测：`hyc personality get` 退出 0 → authenticated；
 * 非 0 退出、ENOENT 或任何错误 → unauthenticated（绝不抛出）。
 */
export async function checkAuthStatus(options: { run?: RunCmd } = {}): Promise<'authenticated' | 'unauthenticated'> {
  const run = options.run ?? defaultRun;
  const result = runOrCatch(run, 'hyc', ['personality', 'get']);
  if (result.error) return 'unauthenticated';
  if (result.status !== 0) return 'unauthenticated';
  return 'authenticated';
}

/**
 * login / register 共同实现：script 伪终端 + stdin 喂入账号密码。
 * - script 缺失（ENOENT）→ 平台不支持错误；
 * - hyc 侧失败（退出非 0 或 stdout 含 error 信封）→ 原样透传。
 */
async function runCredentialCommand(
  command: 'login' | 'register',
  username: string,
  password: string,
  run: RunCmd,
): Promise<CommandResult> {
  // register 额外有「确认密码」提示，需要第三行输入（密码喂两次）。
  const input =
    command === 'register' ? `${username}\n${password}\n${password}\n` : `${username}\n${password}\n`;
  const result = runOrCatch(run, 'script', ['-q', '/dev/null', 'hyc', command], { input });
  if (isEnoent(result)) return { ok: false, error: PLATFORM_UNSUPPORTED_LOGIN };
  if (result.error) return { ok: false, error: passthroughError(result) };
  if (result.status !== 0) return { ok: false, error: passthroughError(result) };
  const jsonError = extractJsonError(result.stdout);
  if (jsonError) return { ok: false, error: jsonError };
  return { ok: true };
}

/** 页面内登录：`script -q /dev/null hyc login` 伪终端喂入 账号\n密码\n。 */
export async function loginWithCredentials(
  username: string,
  password: string,
  options: { run?: RunCmd } = {},
): Promise<CommandResult> {
  return runCredentialCommand('login', username, password, options.run ?? defaultRun);
}

/** 页面内注册：`script -q /dev/null hyc register` 喂入 账号/密码/确认密码。 */
export async function registerWithCredentials(
  username: string,
  password: string,
  options: { run?: RunCmd } = {},
): Promise<CommandResult> {
  return runCredentialCommand('register', username, password, options.run ?? defaultRun);
}

/** 登出：`hyc logout`（清除当前 profile 的已保存 JWT）。 */
export async function logout(options: { run?: RunCmd } = {}): Promise<CommandResult> {
  const run = options.run ?? defaultRun;
  const result = runOrCatch(run, 'hyc', ['logout']);
  if (result.error) return { ok: false, error: passthroughError(result) };
  if (result.status !== 0) return { ok: false, error: passthroughError(result) };
  const jsonError = extractJsonError(result.stdout);
  if (jsonError) return { ok: false, error: jsonError };
  return { ok: true };
}

/**
 * 解析 schedule list 输出：接受 `{items:[...]}` 分页信封（真实形态）与裸数组；
 * `{"error":...}` 信封原样透传；其余（非 JSON / 结构不符）→ 解析错误。
 */
function parseScheduleList(stdout: string): { ok: true; items: ScheduleItem[] } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { ok: false, error: 'schedule list 输出不是合法 JSON' };
  }
  if (Array.isArray(parsed)) return { ok: true, items: parsed as ScheduleItem[] };
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as { items?: unknown; error?: unknown };
    if (typeof obj.error === 'string' && obj.error.trim()) return { ok: false, error: obj.error.trim() };
    if (Array.isArray(obj.items)) return { ok: true, items: obj.items as ScheduleItem[] };
  }
  return { ok: false, error: 'schedule list 输出不是合法 JSON' };
}

/** 列出定时陪伴事件：`hyc schedule list`，解析 stdout JSON 为 ScheduleItem[]。 */
export async function listSchedules(options: { run?: RunCmd } = {}): Promise<ScheduleListResult> {
  const run = options.run ?? defaultRun;
  const result = runOrCatch(run, 'hyc', ['schedule', 'list']);
  if (result.error) return { ok: false, error: passthroughError(result) };
  if (result.status !== 0) return { ok: false, error: passthroughError(result) };
  return parseScheduleList(result.stdout ?? '');
}

/**
 * 启停/删除定时事件：`hyc schedule <enable|disable|delete> --id <id>`。
 * server 侧错误以退出码 0 + `{"error":...}` 信封返回，因此必须同时检查信封。
 */
export async function scheduleAction(
  action: ScheduleAction,
  id: string,
  options: { run?: RunCmd } = {},
): Promise<CommandResult> {
  const run = options.run ?? defaultRun;
  const result = runOrCatch(run, 'hyc', ['schedule', action, '--id', id]);
  if (result.error) return { ok: false, error: passthroughError(result) };
  if (result.status !== 0) return { ok: false, error: passthroughError(result) };
  const jsonError = extractJsonError(result.stdout);
  if (jsonError) return { ok: false, error: jsonError };
  return { ok: true };
}
