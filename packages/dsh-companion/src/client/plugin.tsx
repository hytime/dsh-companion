/**
 * dsh-companion — Browser half（dsh.client exports["./client"] 的 Cordis 插件）。
 *
 * apply(ctx) 挂载 shell.overlay 的鲸鱼娘悬浮人物。
 * 正式插件没有动态插件的 `host` 全局：数据经 fetch 调用 Host half 的
 * webServer 路由（/api/dsh-companion/*）。
 * 对话窗与控件使用 DSH ui-primitives（StateDot/Button）；回复按钮在
 * 主对话输入框注入 /hy-companion-chat。
 */
import * as React from 'react';
import type { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';
import { WhaleFloatingWidget } from '../components/whale-floating-widget';
import type { AffectionStats, CompanionEmotion, SkillStatus } from '../contracts/skill-contract';
import { EVENTS_URL } from '../contracts/remote-descriptors';
import { normalizeSkillStatusUpdate } from '../state/skill-status-source';
import { fetchBuddyIfRemindersEnabled } from './buddy-gate';
import type { CompanionRemoteFace } from './companion-types';
import { travelNoteCompanionRemote } from './remote-contract';
import { SettingsCard } from './settings-card';
import type {} from './slot-contract';
import '../styles/companion.module.css';

interface PluginCtx {
  remote: RemoteFace;
  get<T>(name: string): T | undefined;
  plugin(plugin: unknown): PromiseLike<void> & { dispose(): Promise<void> };
}

/** gateway Client 面：ctx.remote.<namespace>.<method>()。 */
interface RemoteFace {
  $mount(contribution: typeof travelNoteCompanionRemote): Promise<() => Promise<void>>;
  travelNoteCompanion: CompanionRemoteFace;
}

/**
 * slots 服务的本地投影：inject 等待 slot 声明后执行注册，register 即
 * ui-slots SlotCore 的类型化注册（经 SlotMap 增强校验 slot 名与组合 props）。
 */
interface SlotsService {
  inject(key: string, callback: () => void | (() => void) | Iterable<() => void>): () => void;
  register: SlotCore['register'];
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
    console.error('[dsh-companion] occupant render error:', error, info.componentStack);
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
export const name = 'dsh-companion';

export const inject = ['remote'];

export async function apply(ctx: PluginCtx) {
  const disposeRemote = await ctx.remote.$mount(travelNoteCompanionRemote);
  const widgetFiber = ctx.plugin({
    inject: ['slots', 'remote', 'remote.travelNoteCompanion'],
    apply(widgetCtx: PluginCtx) {
      const slots = widgetCtx.get<SlotsService>('slots');
      if (slots === undefined) return;
      const timer = widgetCtx.get<{ interval(cb: () => void, ms: number): () => void }>('timer');
      const remote = widgetCtx.remote;

  slots.inject('shell.overlay', () => {
        const root = widgetCtx.get<SlotsService>('slots');
    if (root === undefined) return;
    return root.register({ name: 'shell.overlay', id: 'dsh-companion-whale' }, () => {
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
            // 兜底轮询固定 30s：间隔配置(reminderIntervalMin)由 host 轮询消费，
            // 客户端不跟随配置调整间隔，仅在 SSE 断连期间保底。
            // 兜底轮询的 buddy 通道受 reminderEnabled 守卫（与 host 轮询/SSE
            // 初次推送一致）：先读配置，关闭提醒时不采集也不 setBuddy；配置读取
            // 失败回退为照常推送（fail-open）。函数内部已吞掉 buddy 采集异常。
            void fetchBuddyIfRemindersEnabled(remote.travelNoteCompanion, applyBuddy);
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
          eventSource = new EventSource(EVENTS_URL);
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

      // 设置页独立入口：设置面板左侧导航的「我的鲸鱼娘」设置页
      // （settings.section 列表条目）。经 inject 把 travelNoteCompanion
      // 调用面注入页面 props（与页面实现解耦，单测直接以 prop 注入假 remote）。
      slots.inject('settings.section', () => {
        const root = widgetCtx.get<SlotsService>('slots');
        if (root === undefined) return;
        return root.register(
          {
            name: 'settings.section',
            id: 'whale',
            order: 100,
            label: '我的鲸鱼娘',
            registrant: 'dsh-companion',
            inject: () => ({ remote: remote.travelNoteCompanion }),
          },
          SettingsCard,
        );
      });
    },
  });
  await widgetFiber;

  return async () => {
    await widgetFiber.dispose();
    await disposeRemote();
  };
}
