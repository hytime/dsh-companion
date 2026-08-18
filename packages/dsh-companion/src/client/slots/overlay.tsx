import * as React from 'react';
import { WhaleFloatingWidget } from '../../components/whale-floating-widget';
import { useCompanionEventStream } from '../stream/event-stream';
import type { ClientRemote, ClientTimer, SlotsService } from './slot-types';
import type { CompanionRemoteFace } from '../companion-types';

class WhaleBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error): { error: Error } { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[dsh-companion] occupant render error:', error, info.componentStack);
  }
  render(): React.ReactNode {
    if (this.state.error !== null) {
      return React.createElement('div', {
        style: {
          position: 'fixed', right: 16, bottom: 16, zIndex: 2147483000,
          background: '#fdecea', color: '#b3261e', border: '1px solid #f5c6c2',
          borderRadius: 8, padding: '8px 12px', fontSize: 12, fontFamily: 'sans-serif',
        },
      }, `旅行插件渲染错误: ${String(this.state.error.message ?? this.state.error)}`);
    }
    return this.props.children;
  }
}

export function injectCompanionReplyCommand(): void {
  try {
    const textarea = document.querySelector('textarea');
    if (textarea === null) return;
    const proto = typeof window !== 'undefined' && window.HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : null;
    const setter = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : undefined;
    if (setter?.set === undefined) textarea.value = '/hy-companion-chat ';
    else setter.set.call(textarea, '/hy-companion-chat ');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
  } catch {
    // Chat command injection is best effort and must not break the overlay.
  }
}

interface WhaleOverlayProps {
  remote: ClientRemote;
  timer?: ClientTimer;
  onReply: () => void;
}

function WhaleOverlay({ remote, timer, onReply }: WhaleOverlayProps): React.ReactElement {
  const { state, buddy, latestReply } = useCompanionEventStream(remote, timer);
  return React.createElement(
    WhaleBoundary,
    null,
    React.createElement(WhaleFloatingWidget, {
      status: state.status,
      emotion: state.emotion,
      lastError: state.lastError,
      companionName: buddy?.companionName ?? '旅伴',
      userCallName: buddy?.userCallName,
      affection: buddy === null ? undefined : {
        affectionScore: buddy.affectionScore,
        intimacyScore: buddy.intimacyScore,
        trustScore: buddy.trustScore,
        engagementScore: buddy.engagementScore,
        talkativenessFactor: buddy.talkativenessFactor,
        proactiveProbabilityFactor: buddy.proactiveProbabilityFactor,
        cooldownFactor: buddy.cooldownFactor,
        lastEvaluatedDate: buddy.lastEvaluatedDate,
        lastAnnouncedDate: buddy.lastAnnouncedDate,
      },
      buddyTitle: buddy?.title,
      buddyMessage: buddy?.message,
      latestReply,
      onReply,
    }),
  );
}

export function registerOverlaySlot(
  slots: SlotsService,
  remote: ClientRemote,
  timer: ClientTimer | undefined,
  onReply: () => void,
): () => void {
  return slots.inject('shell.overlay', () => slots.register(
    { name: 'shell.overlay', id: 'dsh-companion-whale' },
    () => React.createElement(WhaleOverlay, { remote, timer, onReply }),
  ));
}

export type { CompanionRemoteFace };
