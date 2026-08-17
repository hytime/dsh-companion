/**
 * dsh-companion — Host half（node half of the dual-face dsh.client 包）。
 *
 * 通过 DSH Typert Gateway 提供正式 Client→Host RPC：
 * - travelNoteCompanion.buddy() —— 最新 buddy 消息 + 旅伴显示名称
 * - travelNoteCompanion.asset({ frame }) —— 鲸鱼娘表情帧 → { url }（静态路由）
 * - travelNoteCompanion.authStatus/login/register/logout —— 认证（hyc CLI）
 * - travelNoteCompanion.getConfig/setConfig —— 插件配置读写（settings-store）
 * - travelNoteCompanion.listSchedules/enableSchedule/disableSchedule/deleteSchedule —— 定时陪伴（hyc CLI）
 *   （后三组共 10 个方法由 settings-rpc 的 handler 表组装，@Remote 仅做参数适配与透传）
 *
 * 配置消费：apply 启动时 readSettings 注入 CompanionRemote；buddy() 用配置覆盖
 * 线上人格的名称/称呼（空值回退线上）、showAffection=false 时抑制好感度字段；
 * latestReply()/回复轮询在 showBubble=false 时置空；buddy 轮询（间隔由
 * reminderIntervalMin 配置驱动，下限 30s，配置变更时重启定时器）与 SSE 连接
 * 建立时的初次推送在 reminderEnabled=false 时跳过（scheduleInitialPushes）；
 * setConfig 成功后 host 重读配置并推送新状态（不走通道守卫，保证即时生效）。
 *
 * Remote 走 SRC 弱解析路径：`CompanionRemote extends TypertRemoteService` 用
 * `@Remote` 标记公开方法，Gateway 经 `remoteMethods(service)` + `typertRemote`
 * 绑定发现端点（无需 host 侧 `typert.remotes.register` 贡献；那是 Client `$mount`
 * 的注册面）。Client 侧经 ctx.remote.travelNoteCompanion.* 调用。
 *
 * 不写入任何凭据；JWT 只存在于系统 Keychain/Secret Service（hyc login 管理）。
 *
 * 生命周期：凡经 ctx.effect() 注册的 HTTP 路由，插件卸载时由 Cordis 自动清理
 * （对齐「第一个插件」教程的自动清理 / ctx.effect 约定）。
 */
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { Context } from '@deepseek-ai/cordis';
import { REMOTE_PACKAGE, REMOTE_SERVICE } from '../contracts/remote-descriptors';
import { inferFromAgentIdle, inferFromToolResult, inferFromToolStart, type StatusUpdate } from './status-inference';
import { runSelfHeal } from './prereq-self-heal';
import {
  DEFAULT_SETTINGS,
  readSettings,
  writeSettings,
  type CompanionSettings,
  type WriteResult,
} from './settings-store';
import {
  checkAuthStatus,
  COMMAND_TIMEOUT_MS,
  listSchedules,
  loginWithCredentials,
  logout,
  registerWithCredentials,
  scheduleAction,
  scheduleUnderstand,
  type CredentialPtyRun,
  type CommandResult,
  type ScheduleListResult,
} from './companion-commands';
import {
  createSettingsHandlers,
  type AuthStatusResult,
  type GetConfigResult,
  type SettingsRpcDeps,
  type SettingsRpcHandlers,
} from './settings-rpc';

/**
 * DSH Host 工具/Agent 事件的局部类型契约（对齐 harness `packages/core/tools`
 * 与 `packages/core/agent` 的 `declare module '@deepseek-ai/cordis'` 增强）。
 * 本包不直接依赖 DSH 运行时包，故在此声明最小结构，使 `ctx.on` 严格类型化。
 */
declare module '@deepseek-ai/cordis' {
  interface Events {
    /** tools/execute（waterfall）：工具即将派发。纯观察者必须 `return next()`。 */
    'tools/execute'(
      exec: { name: string; arguments: unknown; signal: AbortSignal; agent: unknown },
      next: () => Promise<unknown>,
    ): Promise<unknown>;
    /** tools/result（emit）：一次工具调用的冻结最终结果。 */
    'tools/result'(
      exec: { name: string; arguments: unknown; signal: AbortSignal; agent: unknown },
      result:
        | { isError: true; error: { message: string } }
        | { isError: false; error?: never },
    ): void;
    /** agent/status（emit）：agent 在 idle ⇄ running 间翻转。agent 为触发翻转的 agent 实例。 */
    'agent/status'(payload: { status: 'idle' | 'running'; agent: unknown }): void;
  }
}

/** 插件身份标识（对齐「第一个插件」教程的 name 导出）。 */
export const name = 'dsh-companion';
/** Credential 登录/注册使用 DSH 提供的真实 PTY。 */
export const inject = ['subprocess'];

export interface TravelNoteCompanionHostOptions {
  /** 鲸鱼娘资源根目录（默认走 travel-note-agent 仓库相对路径）。 */
  assetRoot?: string;
}

const FRAME_NAMES = ['idle', 'happy', 'smile', 'laugh', 'shy', 'surprised'] as const;

function defaultAssetRoot(): string {
  return fileURLToPath(new URL('deepseek-girl-phaser', import.meta.url));
}

interface ShellService {
  resolve(request: { command: string; timeoutMs?: number; stdoutMaxBytes?: number }): unknown;
  run(spec: unknown): Promise<{
    exitCode: number | null;
    stdout: { text: string };
    stderr: { text: string };
  }>;
}

interface CredentialTerminalHandle {
  output: AsyncIterable<Uint8Array | string>;
  done: Promise<{ exitCode: number | null; signal: unknown }>;
  write(data: string): Promise<void>;
  terminate(): Promise<void>;
}

interface CredentialSubprocessService {
  spawnTerminal(spec: {
    argv: readonly string[];
    cwd: string;
    rows: number;
    cols: number;
    graceMs: number;
  }): Promise<CredentialTerminalHandle>;
}

/** DSH PTY credential runner：避免 script 在 RPC socket/pipe stdin 上调用 tcgetattr。 */
export function createCredentialPtyRunner(ctx: Context): CredentialPtyRun {
  return async (command, input) => {
    const subprocess = ctx.get('subprocess') as unknown as CredentialSubprocessService | undefined;
    if (subprocess === undefined) {
      return { error: new Error('DSH subprocess PTY service unavailable') };
    }
    let terminal: CredentialTerminalHandle | undefined;
    let outputDone: Promise<void> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      terminal = await subprocess.spawnTerminal({
        argv: ['hyc', command],
        cwd: process.cwd(),
        rows: 24,
        cols: 120,
        graceMs: 3_000,
      });
      const chunks: string[] = [];
      const decoder = new TextDecoder();
      outputDone = (async () => {
        for await (const chunk of terminal!.output) {
          chunks.push(typeof chunk === 'string' ? chunk : decoder.decode(chunk));
        }
      })();
      await terminal.write(input);
      const outcome = await Promise.race([
        terminal.done,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            const error = new Error(`hyc ${command} PTY timed out after ${COMMAND_TIMEOUT_MS}ms`) as NodeJS.ErrnoException;
            error.code = 'ETIMEDOUT';
            reject(error);
          }, COMMAND_TIMEOUT_MS);
        }),
      ]);
      await outputDone;
      return { status: outcome.exitCode, stdout: chunks.join('') };
    } catch (error) {
      return { error };
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      if (terminal !== undefined) {
        await terminal.terminate().catch(() => {});
        await outputDone?.catch(() => {});
      }
    }
  };
}

interface WebServerService {
  register(route: {
    kind: 'exact' | 'prefix';
    path: string;
    handler: (req: unknown, res: {
      writeHead(code: number, headers?: Record<string, string>): void;
      write?(chunk: string): void;
      end(body?: string | Uint8Array): void;
    }) => void | Promise<void>;
  }): () => void;
}

/** SSE 连接句柄（状态推送用）。 */
interface SseClient {
  res: { write(chunk: string): void };
}

/** buddy 载荷的旅伴信息/好感度部分（hyc personality get + affection 采集结果）。 */
export interface BuddyBase {
  companionName: string;
  userCallName: string;
  affectionScore: number;
  intimacyScore: number;
  trustScore: number;
  engagementScore: number;
  talkativenessFactor: number;
  proactiveProbabilityFactor: number;
  cooldownFactor: number;
  lastEvaluatedDate: string;
  lastAnnouncedDate: string;
}

/** buddy() 完整返回：BuddyBase + 最新 buddy 消息。 */
export interface BuddyResult extends BuddyBase {
  message: string;
  title: string;
  dueAt: string;
}

/**
 * 配置消费（纯函数）：把 CompanionSettings 应用到线上采集的 buddy 基础载荷。
 * - companionName/userCallName：配置优先，空值回退线上值（缺省非空，正常恒为配置值）
 * - showAffection=false：9 个好感度字段全部置空（widget 好感度条/面板据此隐藏）
 */
export function applySettingsToBuddy(base: BuddyBase, settings: CompanionSettings): BuddyBase {
  const showAffection = settings.showAffection;
  return {
    companionName: settings.companionName !== '' ? settings.companionName : base.companionName,
    userCallName: settings.userCallName !== '' ? settings.userCallName : base.userCallName,
    affectionScore: showAffection ? base.affectionScore : 0,
    intimacyScore: showAffection ? base.intimacyScore : 0,
    trustScore: showAffection ? base.trustScore : 0,
    engagementScore: showAffection ? base.engagementScore : 0,
    talkativenessFactor: showAffection ? base.talkativenessFactor : 0,
    proactiveProbabilityFactor: showAffection ? base.proactiveProbabilityFactor : 0,
    cooldownFactor: showAffection ? base.cooldownFactor : 0,
    lastEvaluatedDate: showAffection ? base.lastEvaluatedDate : '',
    lastAnnouncedDate: showAffection ? base.lastAnnouncedDate : '',
  };
}

/** 周期推送通道开关：reminderEnabled=false 跳过 buddy 轮询；showBubble=false 跳过回复轮询。 */
export function selectPushChannels(settings: CompanionSettings): { buddy: boolean; reply: boolean } {
  return { buddy: settings.reminderEnabled, reply: settings.showBubble };
}

/**
 * buddy 轮询间隔换算(ms)：由 reminderIntervalMin 配置驱动(分钟 → ms)，
 * 下限 30s；0/负值/NaN 等非法值兜底 30s(见 DEFAULT_SETTINGS.reminderIntervalMin=1
 * 时缺省轮询为 1 分钟,这是配置消费的预期行为)。
 */
export function buddyPollIntervalMs(settings: CompanionSettings): number {
  const interval = settings.reminderIntervalMin * 60_000;
  return Number.isFinite(interval) && interval >= 30_000 ? interval : 30_000;
}

/** createBuddyTimer 的注入依赖面：取当前配置 + 每 tick 的采集动作。 */
export interface BuddyTimerDeps {
  getSettings(): CompanionSettings;
  tick(): void;
}

/**
 * buddy 周期推送定时器：间隔按 buddyPollIntervalMs(getSettings()) 换算，
 * 每 tick 先过 selectPushChannels().buddy 守卫(reminderEnabled=false 不采集)。
 * restart() 用于配置变更后以新间隔重建定时器(start/restart 前未 start 等价)；
 * dispose() 清理定时器并置 disposed 守卫(插件卸载 / 生命周期收尾),
 * 此后 start/restart 直接返回,不复活定时器(卸载竞态防护)。
 */
export function createBuddyTimer(deps: BuddyTimerDeps): {
  start(): void;
  restart(): void;
  dispose(): void;
} {
  let timer: ReturnType<typeof setInterval> | undefined;
  // disposed 守卫:dispose 后 start/restart 直接返回,不再新建定时器。
  // 防止卸载竞态(setConfig RPC 在插件卸载后才 resolve 的 restart)复活并泄漏。
  let disposed = false;
  const start = (): void => {
    if (disposed) return;
    if (timer !== undefined) clearInterval(timer);
    timer = setInterval(() => {
      if (selectPushChannels(deps.getSettings()).buddy) deps.tick();
    }, buddyPollIntervalMs(deps.getSettings()));
  };
  return {
    start,
    restart: start,
    dispose: (): void => {
      disposed = true;
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    },
  };
}

/**
 * SSE 连接建立时的初次推送调度（页面加载的状态快照）。
 * buddy 通道套用与 30s 轮询一致的 reminderEnabled 守卫；回复推送由 pushReply
 * 内部的 showBubble 守卫承担，故这里照常调度。注意：守卫只作用于本调度点，
 * setConfig 成功后的主动推送（onConfigApplied → pushBuddy）不经过本函数，
 * 保证配置变更即时生效。
 */
export function scheduleInitialPushes(
  settings: CompanionSettings,
  pushBuddy: () => void,
  pushReply: () => void,
): void {
  if (selectPushChannels(settings).buddy) pushBuddy();
  pushReply();
}

/** CompanionRemote 缺省依赖：真实 store + 真实命令（测试注入替身）。 */
function createDefaultRpcDeps(ctx: Context): SettingsRpcDeps {
  const ptyRun = createCredentialPtyRunner(ctx);
  return {
    store: { readSettings, writeSettings },
    commands: {
      checkAuthStatus,
      loginWithCredentials: (username, password) => loginWithCredentials(username, password, { ptyRun }),
      registerWithCredentials: (username, password) => registerWithCredentials(username, password, { ptyRun }),
      logout,
      listSchedules,
      scheduleAction,
      scheduleUnderstand,
    },
  };
}

export class CompanionRemote extends TypertRemoteService {
  private currentStatus: StatusUpdate = { status: 'idle' };

  /** 当前生效配置（apply 启动 / setConfig 成功后重读注入）。 */
  private settings: CompanionSettings = { ...DEFAULT_SETTINGS };

  /** setConfig 写入成功后的宿主回调（apply 注入：重读配置并推送新状态）。 */
  private onConfigApplied?: () => void;

  /** companion.* 配置 RPC handler 表(注入 store/commands,方法与 @Remote 同名)。 */
  private readonly settingsHandlers: SettingsRpcHandlers;

  constructor(ctx: Context, deps?: SettingsRpcDeps) {
    super(ctx, REMOTE_SERVICE);
    this.settingsHandlers = createSettingsHandlers(deps ?? createDefaultRpcDeps(ctx));
  }

  /** 注入配置快照（apply 启动读取 / setConfig 成功后重读）。 */
  applySettings(settings: CompanionSettings): void {
    this.settings = settings;
  }

  /** 当前生效配置快照（周期推送等按配置做通道决策）。 */
  getSettings(): CompanionSettings {
    return this.settings;
  }

  /** 注册 setConfig 成功回调（host 侧据此重读配置并推送新状态）。 */
  setOnConfigApplied(callback: () => void): void {
    this.onConfigApplied = callback;
  }

  setStatus(update: StatusUpdate): void {
    this.currentStatus = update;
  }

  getStatus(): StatusUpdate {
    return this.currentStatus;
  }

  /** 当前 companion 状态快照（Client 轮询）。 */
  @Remote
  async status(): Promise<StatusUpdate> {
    return this.currentStatus;
  }

  /** 最新 buddy 消息 + 旅伴显示名称 + 对用户的称呼 + 好感度全量（hyc personality get / affection）。
   *  名称/称呼经配置覆盖（applySettingsToBuddy：配置优先，空值回退线上）；showAffection=false 时好感度置空。 */
  @Remote
  async buddy(): Promise<BuddyResult> {
    const shell = this.ctx.get('shell') as unknown as ShellService | undefined;
    const emptyBase: BuddyBase = {
      companionName: '',
      userCallName: '',
      affectionScore: 0,
      intimacyScore: 0,
      trustScore: 0,
      engagementScore: 0,
      talkativenessFactor: 0,
      proactiveProbabilityFactor: 0,
      cooldownFactor: 0,
      lastEvaluatedDate: '',
      lastAnnouncedDate: '',
    };
    if (shell === undefined) {
      return { message: '', title: '', dueAt: '', ...applySettingsToBuddy(emptyBase, this.settings) };
    }
    let companionName = '';
    let userCallName = '';
    let affectionScore = 0;
    let intimacyScore = 0;
    let trustScore = 0;
    let engagementScore = 0;
    let talkativenessFactor = 0;
    let proactiveProbabilityFactor = 0;
    let cooldownFactor = 0;
    let lastEvaluatedDate = '';
    let lastAnnouncedDate = '';
    try {
      const pSpec = shell.resolve({
        command: 'hyc personality get',
        timeoutMs: 10_000,
        stdoutMaxBytes: 256 * 1024,
      });
      const pResult = await shell.run(pSpec);
      if (pResult.exitCode === 0) {
        const p = JSON.parse(pResult.stdout.text) as Record<string, unknown>;
        if (typeof p.companionName === 'string') companionName = p.companionName;
        if (typeof p.userCallName === 'string') userCallName = p.userCallName;
      }
    } catch {
      // 名称/称呼缺失时使用默认
    }
    try {
      const aSpec = shell.resolve({
        command: 'hyc affection',
        timeoutMs: 10_000,
        stdoutMaxBytes: 256 * 1024,
      });
      const aResult = await shell.run(aSpec);
      if (aResult.exitCode === 0) {
        const a = JSON.parse(aResult.stdout.text) as Record<string, unknown>;
        if (typeof a.affectionScore === 'number') affectionScore = a.affectionScore;
        if (typeof a.intimacyScore === 'number') intimacyScore = a.intimacyScore;
        if (typeof a.trustScore === 'number') trustScore = a.trustScore;
        if (typeof a.engagementScore === 'number') engagementScore = a.engagementScore;
        if (typeof a.talkativenessFactor === 'number') talkativenessFactor = a.talkativenessFactor;
        if (typeof a.proactiveProbabilityFactor === 'number') {
          proactiveProbabilityFactor = a.proactiveProbabilityFactor;
        }
        if (typeof a.cooldownFactor === 'number') cooldownFactor = a.cooldownFactor;
        if (typeof a.lastEvaluatedDate === 'string') lastEvaluatedDate = a.lastEvaluatedDate;
        if (typeof a.lastAnnouncedDate === 'string') lastAnnouncedDate = a.lastAnnouncedDate;
      }
    } catch {
      // 好感度缺失时使用 0
    }
    const base = applySettingsToBuddy(
      {
        companionName,
        userCallName,
        affectionScore,
        intimacyScore,
        trustScore,
        engagementScore,
        talkativenessFactor,
        proactiveProbabilityFactor,
        cooldownFactor,
        lastEvaluatedDate,
        lastAnnouncedDate,
      },
      this.settings,
    );
    try {
      const spec = shell.resolve({
        command: 'hyc buddy list --page-size 1',
        timeoutMs: 15_000,
        stdoutMaxBytes: 512 * 1024,
      });
      const result = await shell.run(spec);
      if (result.exitCode !== 0) {
        return { message: '', title: '', dueAt: '', ...base };
      }
      const parsed = JSON.parse(result.stdout.text) as Record<string, unknown>;
      const items = parsed.items;
      if (!Array.isArray(items) || items.length === 0) {
        return { message: '', title: '', dueAt: '', ...base };
      }
      const item = items[0] as Record<string, unknown>;
      return {
        message: typeof item.message === 'string' ? item.message : '',
        title: typeof item.title === 'string' ? item.title : '',
        dueAt: typeof item.dueAt === 'string' ? item.dueAt : '',
        ...base,
      };
    } catch {
      return { message: '', title: '', dueAt: '', ...base };
    }
  }

  /** 最近一次 hyc chat 回复（hy-companion-chat 技能落盘 ~/.hy-companion/state/last-reply.json）。
   *  showBubble=false 时置空（不读文件，直接返回 null）。 */
  @Remote
  async latestReply(): Promise<{ reply: string; emotion: string } | null> {
    if (!this.settings.showBubble) return null;
    try {
      const file = join(homedir(), '.hy-companion', 'state', 'last-reply.json');
      const raw = await readFile(file, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.reply !== 'string' || parsed.reply === '') return null;
      return {
        reply: parsed.reply,
        emotion: typeof parsed.emotion === 'string' ? parsed.emotion : 'idle',
      };
    } catch {
      return null;
    }
  }

  /** 鲸鱼娘表情帧 → dist 静态 URL。 */
  @Remote
  async asset(frame: string): Promise<{ url: string } | null> {
    const name = FRAME_NAMES.includes(frame as (typeof FRAME_NAMES)[number]) ? frame : 'idle';
    return { url: `/plugins/${REMOTE_PACKAGE}/deepseek-girl-phaser/frames/${name}.png` };
  }

  // ---- companion.* 配置 RPC(settings-rpc handler 表,Client 配置页调用) ----

  /** 认证状态探测(hyc personality get)。 */
  @Remote
  async authStatus(): Promise<AuthStatusResult> {
    return this.settingsHandlers.authStatus();
  }

  /** 页面内登录(script 伪终端喂入账号密码)。 */
  @Remote
  async login(username: string, password: string): Promise<CommandResult> {
    return this.settingsHandlers.login({ username, password });
  }

  /** 页面内注册(script 伪终端,喂入账号/密码/确认密码)。 */
  @Remote
  async register(username: string, password: string): Promise<CommandResult> {
    return this.settingsHandlers.register({ username, password });
  }

  /** 登出(hyc logout)。 */
  @Remote
  async logout(): Promise<CommandResult> {
    return this.settingsHandlers.logout();
  }

  /** 读取插件配置(~/.hy-companion/config.json)。 */
  @Remote
  async getConfig(): Promise<GetConfigResult> {
    return this.settingsHandlers.getConfig();
  }

  /** 保存插件配置(白名单深合并,只写 6 个已知字段)。写入成功后通知 host 重读并推送新状态。 */
  @Remote
  async setConfig(partial: Partial<CompanionSettings>): Promise<WriteResult> {
    const result = await this.settingsHandlers.setConfig(partial);
    if (result.ok) this.onConfigApplied?.();
    return result;
  }

  /** 列出定时陪伴事件(hyc schedule list)，可选透传分页参数。 */
  @Remote
  async listSchedules(page?: number, pageSize?: number): Promise<ScheduleListResult> {
    return this.settingsHandlers.listSchedules({ page, pageSize });
  }

  /** 通过自然语言创建定时事件(hyc schedule understand --text)。 */
  @Remote
  async createSchedule(text: string): Promise<CommandResult> {
    return this.settingsHandlers.createSchedule({ text });
  }

  /** 启用定时事件(hyc schedule enable --id)。 */
  @Remote
  async enableSchedule(id: string): Promise<CommandResult> {
    return this.settingsHandlers.enableSchedule({ id });
  }

  /** 停用定时事件(hyc schedule disable --id)。 */
  @Remote
  async disableSchedule(id: string): Promise<CommandResult> {
    return this.settingsHandlers.disableSchedule({ id });
  }

  /** 删除定时事件(hyc schedule delete --id)。 */
  @Remote
  async deleteSchedule(id: string): Promise<CommandResult> {
    return this.settingsHandlers.deleteSchedule({ id });
  }
}

/** 15 个 @Remote 公开方法名（与类中装饰器一一对应）。 */
const REMOTE_METHOD_NAMES = [
  'status', 'buddy', 'latestReply', 'asset', 'authStatus', 'login', 'register', 'logout',
  'getConfig', 'setConfig', 'listSchedules', 'createSchedule', 'enableSchedule', 'disableSchedule', 'deleteSchedule',
] as const;

/**
 * 双表注册（开发模式双实例适配）：
 *
 * DSH 以 tsx 从源码运行时，typert-protocol 包会以两个模块实例加载——in-box 源码
 * 导入解析到 src/index.ts（网关与内置服务读取此实例的私有标记表），而本插件
 * （构建产物 .js）的导入解析到 lib/index.js（类装饰器默认写入此实例的表）。
 * 两张表互不可见，导致网关在 SRC 弱解析路径上看不到本插件的端点
 * （/api/travelNoteCompanion/* 404）。
 *
 * 这里在服务挂载前，把同一组 @Remote 标记镜像写入 src 实例的标记表：按标准
 * ClassMethodDecoratorContext 契约调用 src 实例的 Remote，收集其注册的实例
 * 初始器，再以原型探针对象执行，使 mark(prototype, ...) 落到该实例的 WeakMap。
 * 生产安装（src 不随包发布）时该子路径导入失败自动跳过——单实例环境下本插件的
 * 标记本就与网关同表，无需镜像。开发模式下请确保 profile 的
 * @deepseek-ai/dsh-typert-protocol 解析到 workspace 源码（src 子路径可用）。
 */
/** 开发模式镜像注册的备选实例说明符：运行时按包的 exports 映射解析到 workspace
 *  源码（tsx 加载），发布产物不含 src 时导入失败由调用方兜底。用变量而非字面量
 *  书写，避免构建/测试工具链对子路径的静态解析。 */
const SRC_PROTOCOL_SPECIFIER = '@deepseek-ai/dsh-typert-protocol/src/index.ts';

let alternateMarkersRegistered = false;
export async function registerAlternateProtocolMarkers(
  alternate?: { Remote: typeof Remote },
): Promise<void> {
  if (alternate === undefined) {
    if (alternateMarkersRegistered) return;
    alternateMarkersRegistered = true;
  }
  let srcProtocol: { Remote: typeof Remote } | undefined = alternate;
  if (srcProtocol === undefined) {
    const imported: unknown = await import(SRC_PROTOCOL_SPECIFIER).catch(() => undefined);
    srcProtocol = imported as { Remote: typeof Remote } | undefined;
  }
  if (srcProtocol === undefined) return;
  const initializers: Array<() => void> = [];
  for (const methodName of REMOTE_METHOD_NAMES) {
    const method = Reflect.get(CompanionRemote.prototype, methodName) as ((...args: never[]) => unknown) | undefined;
    if (typeof method !== 'function') continue;
    srcProtocol.Remote(method, {
      kind: 'method',
      name: methodName,
      static: false,
      private: false,
      addInitializer: (initializer: () => void) => initializers.push(initializer),
    } as unknown as ClassMethodDecoratorContext);
  }
  const probe = Object.create(CompanionRemote.prototype);
  for (const initializer of initializers) initializer.call(probe);
}

export async function apply(ctx: Context, options: TravelNoteCompanionHostOptions = {}) {
  // 前置自愈（hyc/技能检查 + 缺失自动安装）：编排抽到 prereq-self-heal 的
  // runSelfHeal，此处仅 fire-and-forget（void），不阻塞 apply。
  void runSelfHeal({});

  // 双表注册：把 @Remote 标记镜像写入 src 实例的标记表（开发模式双实例适配，
  // 生产安装自动跳过）。必须在服务挂载前完成，保证网关任何时刻都能发现端点。
  await registerAlternateProtocolMarkers();

  // 注册 SRC Remote 服务（共 14 个 @Remote：status / buddy / latestReply / asset +
  // authStatus / login / register / logout / getConfig / setConfig / listSchedules /
  // enableSchedule / disableSchedule / deleteSchedule），Gateway 自动发现。
  // 必须用 ctx.plugin 挂载（fiber-owned）：手动 new 的实例虽经 Service 构造注册，
  // 但 gateway 的 collectSrcClaims 只遍历 fiber-owned service，否则端点 404。
  await ctx.plugin(CompanionRemote);
  const remote = ctx.get(REMOTE_SERVICE) as CompanionRemote;
  // 主动通知 gateway 重置 SRC claims 缓存：Service 在 fiber LOADING 阶段注册，
  // 不会触发 Cordis 的 internal/service 通知（notify 仅在 ACTIVE 时执行）；若 gateway
  // 的 srcClaims 已在本插件加载前（web UI 初始化 remote 调用）缓存空集，端点将 404。
  ctx.emit('internal/service', REMOTE_SERVICE, remote);

  // 状态/数据 SSE 推送：Client 用 EventSource 订阅（命名事件 status/buddy/reply），
  // 替代三个 RPC 轮询。broadcast 向所有连接写一帧 SSE。
  const sseClients = new Set<SseClient>();
  const broadcast = (type: string, payload: unknown): void => {
    const frame = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of sseClients) client.res.write(frame);
  };
  const publishStatus = (): void => broadcast('status', remote.getStatus());

  // buddy 周期推送（30s）：复用 RPC 方法采集 hyc 数据并广播。
  const pushBuddy = async (): Promise<void> => {
    try {
      broadcast('buddy', await remote.buddy());
    } catch {
      // 采集失败忽略，下个周期重试
    }
  };
  // 最近回复周期推送（5s）：last-reply.json 内容变化才广播。
  // showBubble=false 时整条通道抑制（SSE 连接建立时的初次推送同样不广播）。
  let lastReplyRaw = '';
  const pushReply = async (): Promise<void> => {
    if (!remote.getSettings().showBubble) return;
    try {
      const file = join(homedir(), '.hy-companion', 'state', 'last-reply.json');
      const raw = await readFile(file, 'utf8');
      if (raw === lastReplyRaw) return;
      lastReplyRaw = raw;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.reply === 'string' && parsed.reply !== '') {
        broadcast('reply', {
          reply: parsed.reply,
          emotion: typeof parsed.emotion === 'string' ? parsed.emotion : 'idle',
        });
      }
    } catch {
      // 文件缺失/读取失败忽略
    }
  };

  // buddy 周期推送：间隔由配置 reminderIntervalMin 驱动（下限 30s，见
  // buddyPollIntervalMs）。配置变更（setConfig 成功重读）时经 restart()
  // 以新间隔重建定时器；每 tick 的 reminderEnabled 守卫见 createBuddyTimer。
  const buddyTimer = createBuddyTimer({
    getSettings: () => remote.getSettings(),
    tick: () => void pushBuddy(),
  });

  // 配置消费：apply 启动时读取配置并注入（fire-and-forget，读取失败回缺省，
  // 与 runSelfHeal 同一模式，不阻塞 apply）。必须放在 buddyTimer 创建之后：
  // 读回持久化的 reminderIntervalMin 后立即 restart 重建轮询定时器（与
  // onConfigApplied 一致），否则每次 DSH 重启都按缺省 60s 轮询，直到下一次
  // setConfig 才经 restart 纠正。setConfig 成功后经 onConfigApplied 重读。
  void readSettings({}).then((settings) => {
    remote.applySettings(settings);
    buddyTimer.restart();
  });

  // 配置变化（Client setConfig 成功）→ host 主动重读配置并推送新状态：
  // 名称/称呼/好感度开关即时生效，无需重启插件；buddy 轮询间隔可能变化，重启定时器。
  remote.setOnConfigApplied(() => {
    void readSettings({}).then((settings) => {
      remote.applySettings(settings);
      buddyTimer.restart();
      void pushBuddy();
    });
  });

  // 周期任务随插件生命周期清理。通道按当前配置逐 tick 决策：
  // reminderEnabled=false 跳过 buddy 轮询（间隔由 reminderIntervalMin 驱动，
  // 下限 30s）；showBubble=false 跳过回复 5s 轮询。
  ctx.effect(() => {
    buddyTimer.start();
    const replyTimer = setInterval(() => {
      if (selectPushChannels(remote.getSettings()).reply) void pushReply();
    }, 5_000);
    return () => {
      buddyTimer.dispose();
      clearInterval(replyTimer);
    };
  });

  // 命中 companion 工具的 agent 实例；用于过滤 agent/status，避免 subagent/workflow
  // 回到 idle 时误把主 agent 的 replying 提前收敛为 success。
  let companionAgent: unknown;

  // tools/execute（waterfall 观察者）：必须 next()，不短路工具链。
  ctx.on('tools/execute', async (exec, next) => {
    const update = inferFromToolStart(exec.name, exec.arguments);
    if (update !== null) {
      companionAgent = exec.agent;
      remote.setStatus(update);
      publishStatus();
    }
    return next();
  });

  // tools/result（emit）：工具结束 → replying/error/cancelled。
  ctx.on('tools/result', (exec, result) => {
    const update = inferFromToolResult(
      exec.name,
      exec.arguments,
      { isError: result.isError, errorMessage: result.isError ? result.error.message : undefined },
      exec.signal.aborted,
    );
    if (update !== null) {
      companionAgent = exec.agent;
      remote.setStatus(update);
      publishStatus();
    }
  });

  // agent/status（emit）：回到 idle 时把 replying 收口为 success。
  // 仅当未记录到 companion agent（兼容旧负载）或 idle 来自同一 agent 时收口，
  // 避免 subagent/workflow 的 idle 提前收敛主 agent 尚未结束的状态。
  ctx.on('agent/status', (payload) => {
    if (payload.status !== 'idle') return;
    if (companionAgent !== undefined && payload.agent !== companionAgent) return;
    const update = inferFromAgentIdle(remote.getStatus().status);
    if (update !== null) {
      remote.setStatus(update);
      publishStatus();
    }
  });

  // webServer 路由：本插件无 inject（立即 apply），webServer 服务可能晚于本插件
  // 注册，故延迟注册——apply 时可用则直接注册；否则监听 internal/service，
  // 服务出现后补注册（幂等）。asset 帧用 node:fs 直接读（host 半在 DSH Node 进程内）。
  let routesRegistered = false;
  const registerRoutes = (): void => {
    if (routesRegistered) return;
    const ws = ctx.get('webServer') as unknown as WebServerService | undefined;
    if (ws === undefined) return;
    routesRegistered = true;
    const assetRoot =
      options.assetRoot ?? process.env.DSH_COMPANION_ASSET_ROOT ?? defaultAssetRoot();
    ctx.effect(() =>
      ws.register({
        kind: 'exact',
        path: '/api/dsh-companion/ping',
        handler: (_req, res) => {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, plugin: 'dsh-companion' }));
        },
      }),
    );
    for (const frameName of FRAME_NAMES) {
      ctx.effect(() =>
        ws.register({
          kind: 'exact',
          path: `/plugins/${REMOTE_PACKAGE}/deepseek-girl-phaser/frames/${frameName}.png`,
          handler: async (_req, res) => {
            try {
              const bytes = await readFile(`${assetRoot}/frames/${frameName}.png`);
              res.writeHead(200, {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=31536000, immutable',
              });
              res.end(bytes);
            } catch {
              res.writeHead(404);
              res.end();
            }
          },
        }),
      );
    }
    ctx.effect(() =>
      ws.register({
        kind: 'exact',
        path: `/plugins/${REMOTE_PACKAGE}/events`,
        handler: (req, res) => {
          if (res.write === undefined) {
            res.writeHead(501);
            res.end();
            return;
          }
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          res.write(`event: status\ndata: ${JSON.stringify(remote.getStatus())}\n\n`);
          const client: SseClient = { res: { write: (chunk: string) => res.write!(chunk) } };
          sseClients.add(client);
          // 连接建立后立即推送 buddy 与最近回复（异步采集完成后广播）。
          // buddy 通道受 reminderEnabled 守卫（与 30s 轮询一致，见 scheduleInitialPushes）；
          // setConfig 成功后的主动推送不走此处，保证配置变更即时生效。
          scheduleInitialPushes(remote.getSettings(), () => void pushBuddy(), () => void pushReply());
          // 心跳：每 15s 发 SSE 注释帧（EventSource 忽略注释），防止代理/服务器
          // 因空闲关闭连接导致断连。
          const heartbeat = setInterval(() => {
            try {
              res.write?.(': ping\n\n');
            } catch {
              // 连接已断，onClose 会清理
            }
          }, 15_000);
          const onClose = (): void => {
            sseClients.delete(client);
            clearInterval(heartbeat);
          };
          const request = req as { on?: (event: string, cb: () => void) => void };
          request.on?.('close', onClose);
          request.on?.('aborted', onClose);
        },
      }),
    );
    console.log('[dsh-companion] webServer 路由已注册（apply 时 webServer 可用）');
  };
  registerRoutes();
  if (!routesRegistered) {
    ctx.on('internal/service', registerRoutes);
    console.log('[dsh-companion] apply 时 webServer 不可用，等待 internal/service 延迟注册');
  }

  console.log('[dsh-companion] host plugin loaded');
}
