/**
 * travel-note-companion — Browser half（dsh.client exports["./client"] 的 Cordis 插件）。
 *
 * apply(ctx) 挂载 shell.overlay 的鲸鱼娘悬浮人物。
 * 正式插件没有动态插件的 `host` 全局：数据经 fetch 调用 Host half 的
 * webServer 路由（/api/travel-note-companion/*）。
 * 对话窗与控件使用 DSH ui-primitives（StateDot/Button）；回复按钮在
 * 主对话输入框注入 /hy-companion-chat。
 */
import * as React from 'react';
import { WhaleFloatingWidget } from '../components/whale-floating-widget';
import type { AffectionStats, CompanionEmotion, SkillStatus } from '../contracts/skill-contract';
import { normalizeSkillStatusUpdate } from '../state/skill-status-source';
import { travelNoteCompanionRemote } from './remote-contract';
import '../styles/companion.module.css';

interface PluginCtx {
  remote: RemoteFace;
  get<T>(name: string): T | undefined;
  plugin(plugin: unknown): PromiseLike<void> & { dispose(): Promise<void> };
}

/** gateway 方法返回的 RemoteResult 包装：{ ok: true, value } 或 { ok: false, error }。 */
type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

/** gateway Client 面：ctx.remote.<namespace>.<method>()。 */
interface RemoteFace {
  $mount(contribution: typeof travelNoteCompanionRemote): Promise<() => Promise<void>>;
  travelNoteCompanion: {
    buddy(): Promise<
      RemoteResult<{
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
      }>
    >;
    asset(frame: string): Promise<RemoteResult<{ url: string } | null>>;
    status(): Promise<RemoteResult<{ status: string; lastError?: string }>>;
    latestReply(): Promise<RemoteResult<{ reply: string; emotion: string } | null>>;
  };
}

interface SlotControl {
  register(
    key: { name: string; id: string },
    component: () => React.ReactElement,
  ): unknown;
}

interface WhaleStatus {
  status: SkillStatus;
  emotion?: CompanionEmotion;
  lastError?: string;
}

interface BuddyInfo {
  message: string;
  title?: string;
  dueAt?: string;
  companionName?: string;
  userCallName?: string;
  affection: AffectionStats;
}

interface LatestReplyInfo {
  reply: string;
  emotion?: string;
}

/** 渲染错误边界：把 occupant 组件异常上报到浏览器控制台，避免静默 inactive。 */
class WhaleBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[travel-note-companion] occupant render error:', error, info.componentStack);
  }
  render() {
    if (this.state.error !== null) {
      return React.createElement(
        'div',
        {
          style: {
            position: 'fixed',
            right: 16,
            bottom: 16,
            zIndex: 2147483000,
            background: '#fdecea',
            color: '#b3261e',
            border: '1px solid #f5c6c2',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            fontFamily: 'sans-serif',
          },
        },
        `旅行插件渲染错误: ${String(this.state.error.message ?? this.state.error)}`,
      );
    }
    return this.props.children;
  }
}

/** 插件身份标识（对齐「第一个插件」教程的 name 导出）。 */
export const name = 'travel-note-companion';

export const inject = ['remote'];

export async function apply(ctx: PluginCtx) {
  const disposeRemote = await ctx.remote.$mount(travelNoteCompanionRemote);
  const widgetFiber = ctx.plugin({
    inject: ['slots', 'remote', 'remote.travelNoteCompanion'],
    apply(widgetCtx: PluginCtx) {
      const slots = widgetCtx.get<{ inject(key: string, cb: () => unknown): unknown }>('slots');
      if (slots === undefined) return;
      const timer = widgetCtx.get<{ interval(cb: () => void, ms: number): () => void }>('timer');
      const remote = widgetCtx.remote;

  slots.inject('shell.overlay', () => {
        const root = widgetCtx.get<SlotControl>('slots');
    if (root === undefined) return;
    return root.register({ name: 'shell.overlay', id: 'travel-note-companion-whale' }, () => {
      const [state, setState] = React.useState<WhaleStatus>({ status: 'idle' });
      const [buddy, setBuddy] = React.useState<BuddyInfo | null>(null);
      const [lastReply, setLastReply] = React.useState<LatestReplyInfo | null>(null);

      // 状态/数据推送：EventSource 订阅 host 的 SSE 路由（命名事件 status/buddy/reply）。
      // 兜底轮询只在 SSE 断开（onerror）时启动，SSE 恢复（onopen）即停——
      // SSE 正常工作时零接口请求。
      React.useEffect(() => {
        if (remote === undefined) return;
        let active = true;
        let eventSource: EventSource | null = null;
        let disposeFallback: (() => void) | undefined;

        const applyBuddy = (value: {
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
        }): void => {
          if (!active) return;
          setBuddy({
            message: value.message,
            title: value.title,
            dueAt: value.dueAt,
            companionName: value.companionName,
            userCallName: value.userCallName,
            affection: {
              affectionScore: value.affectionScore,
              intimacyScore: value.intimacyScore,
              trustScore: value.trustScore,
              engagementScore: value.engagementScore,
              talkativenessFactor: value.talkativenessFactor,
              proactiveProbabilityFactor: value.proactiveProbabilityFactor,
              cooldownFactor: value.cooldownFactor,
              lastEvaluatedDate: value.lastEvaluatedDate,
              lastAnnouncedDate: value.lastAnnouncedDate,
            },
          });
        };
        const applyReply = (value: { reply: string; emotion?: string } | null): void => {
          if (!active) return;
          setLastReply(value);
        };
        const applyStatus = (value: { status: string; lastError?: string }): void => {
          if (!active) return;
          setState(normalizeSkillStatusUpdate(value));
        };

        const stopFallback = (): void => {
          disposeFallback?.();
          disposeFallback = undefined;
        };
        const startFallback = (): void => {
          if (!active || disposeFallback !== undefined) return;
          const tick = () => {
            remote.travelNoteCompanion
              .status()
              .then((result) => {
                if (result.ok) applyStatus(result.value);
              })
              .catch(() => {});
            remote.travelNoteCompanion
              .buddy()
              .then((result) => {
                if (result.ok) applyBuddy(result.value);
              })
              .catch(() => {});
            remote.travelNoteCompanion
              .latestReply()
              .then((result) => {
                if (result.ok) applyReply(result.value);
              })
              .catch(() => {});
          };
          tick();
          disposeFallback = timer !== undefined ? timer.interval(tick, 30_000) : undefined;
        };

        if (typeof window !== 'undefined' && typeof window.EventSource === 'function') {
          eventSource = new EventSource('/plugins/@your-scope/dsh-companion/events');
          eventSource.onopen = () => stopFallback();
          eventSource.addEventListener('status', (event) => {
            try {
              applyStatus(JSON.parse((event as MessageEvent<string>).data) as { status: string; lastError?: string });
            } catch {
              // 忽略畸形帧
            }
          });
          eventSource.addEventListener('buddy', (event) => {
            try {
              applyBuddy(JSON.parse((event as MessageEvent<string>).data) as Parameters<typeof applyBuddy>[0]);
            } catch {
              // 忽略畸形帧
            }
          });
          eventSource.addEventListener('reply', (event) => {
            try {
              applyReply(JSON.parse((event as MessageEvent<string>).data) as { reply: string; emotion?: string });
            } catch {
              // 忽略畸形帧
            }
          });
          eventSource.onerror = () => startFallback();
        } else {
          startFallback();
        }

        return () => {
          active = false;
          stopFallback();
          eventSource?.close();
        };
      }, []);

      const onReply = () => {
        try {
          const textarea = document.querySelector('textarea');
          if (textarea === null) return;
          const proto =
            typeof window !== 'undefined' && window.HTMLTextAreaElement
              ? window.HTMLTextAreaElement.prototype
              : null;
          const setter = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : undefined;
          if (setter === undefined || setter.set === undefined) {
            textarea.value = '/hy-companion-chat ';
          } else {
            setter.set.call(textarea, '/hy-companion-chat ');
          }
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.focus();
        } catch {
          // 注入失败不阻塞
        }
      };

      return React.createElement(
        WhaleBoundary,
        null,
        React.createElement(WhaleFloatingWidget, {
          status: state.status,
          emotion: state.emotion,
          lastError: state.lastError,
          companionName: buddy?.companionName ?? '旅伴',
          userCallName: buddy?.userCallName,
          affection: buddy?.affection,
          buddyTitle: buddy?.title,
          buddyMessage: buddy?.message,
          latestReply: lastReply?.reply,
          onReply,
        }),
      );
    });
      });
    },
  });
  await widgetFiber;

  return async () => {
    await widgetFiber.dispose();
    await disposeRemote();
  };
}
