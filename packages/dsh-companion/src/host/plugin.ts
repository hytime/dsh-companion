/**
 * travel-note-companion — Host half（node half of the dual-face dsh.client 包）。
 *
 * 通过 DSH Typert Gateway 提供正式 Client→Host RPC：
 * - travelNoteCompanion.buddy() —— 最新 buddy 消息 + 旅伴显示名称
 * - travelNoteCompanion.asset({ frame }) —— 鲸鱼娘表情帧 → { url }（静态路由）
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
export const name = 'travel-note-companion';

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

class CompanionRemote extends TypertRemoteService {
  private currentStatus: StatusUpdate = { status: 'idle' };

  constructor(ctx: Context) {
    super(ctx, REMOTE_SERVICE);
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

  /** 最新 buddy 消息 + 旅伴显示名称 + 对用户的称呼 + 好感度全量（hyc personality get / affection）。 */
  @Remote
  async buddy(): Promise<{
    message: string;
    title: string;
    dueAt: string;
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
  }> {
    const shell = this.ctx.get('shell') as unknown as ShellService | undefined;
    if (shell === undefined) {
      return {
        message: '',
        title: '',
        dueAt: '',
        companionName: '旅伴',
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
    const base = {
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
    };
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

  /** 最近一次 hyc chat 回复（hy-companion-chat 技能落盘 ~/.hy-companion/state/last-reply.json）。 */
  @Remote
  async latestReply(): Promise<{ reply: string; emotion: string } | null> {
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
}

export function apply(ctx: Context, options: TravelNoteCompanionHostOptions = {}) {
  // 注册 SRC Remote 服务（buddy / asset / status），Gateway 自动发现。
  const remote = new CompanionRemote(ctx);

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
  let lastReplyRaw = '';
  const pushReply = async (): Promise<void> => {
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

  // 周期任务随插件生命周期清理。
  ctx.effect(() => {
    const buddyTimer = setInterval(() => void pushBuddy(), 30_000);
    const replyTimer = setInterval(() => void pushReply(), 5_000);
    return () => {
      clearInterval(buddyTimer);
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
        path: '/api/travel-note-companion/ping',
        handler: (_req, res) => {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, plugin: 'travel-note-companion' }));
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
          void pushBuddy();
          void pushReply();
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
    console.log('[travel-note-companion] webServer 路由已注册（apply 时 webServer 可用）');
  };
  registerRoutes();
  if (!routesRegistered) {
    ctx.on('internal/service', registerRoutes);
    console.log('[travel-note-companion] apply 时 webServer 不可用，等待 internal/service 延迟注册');
  }

  console.log('[travel-note-companion] host plugin loaded');
}
