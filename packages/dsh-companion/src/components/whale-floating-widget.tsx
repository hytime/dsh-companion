/* eslint-disable @next/next/no-img-element -- 本插件不是 Next.js 项目，使用原生 img 加载鲸鱼娘帧 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { WhaleContextMenu } from './context-menu';
import { DeepSeekLogo } from './deepseek-logo';
import { frameUrl, resolveWhaleFrame } from './expression-map';
import { useTypewriter } from '../hooks/use-typewriter';
import { useWidgetDrag } from '../hooks/use-widget-drag';
import { useReplyBubbles } from '../hooks/use-reply-bubbles';
import { WhaleMessageBubble } from './message-bubble';
import {
  FIGURE_H,
  PEEK_H,
  PEEK_W,
  FIGURE_W,
  POPOVER_EDGE,
  POPOVER_GAP,
  initialPosition,
  peekPosition,
  type PeekEdge,
} from '../utils/widget-position';
import type { CompanionEmotion, SkillStatus } from '../contracts/skill-contract';
import styles from '../styles/companion.module.css';

export interface WhaleFloatingWidgetProps {
  status: SkillStatus;
  emotion?: CompanionEmotion;
  statusMessage?: string;
  companionName?: string;
  buddyTitle?: string;
  buddyMessage?: string;
  latestReply?: string;
  onReply?: () => void;
}

const STATUS_HINT: Record<SkillStatus, string> = {
  idle: 'idle',
  connecting: 'connecting',
  thinking: 'thinking',
  replying: 'replying',
  success: 'success',
  error: 'error',
  cancelled: 'cancelled',
};

/**
 * 鲸鱼娘悬浮人物：完整立绘悬浮（可拖动、位置记忆、表情帧切换）。
 * 对话窗在人物上方展开（边界自适应），控件使用 DSH ui-primitives。
 */
export function WhaleFloatingWidget({
  status,
  emotion,
  statusMessage,
  companionName = '旅伴',
  buddyTitle,
  buddyMessage,
  latestReply,
  onReply,
}: WhaleFloatingWidgetProps) {
  const [position, setPosition] = useState(initialPosition);
  const [peek, setPeek] = useState<PeekEdge | null>(null);
  const [contextMenu, setContextMenu] = useState<{ left: number; top: number } | null>(null);
  const [bubbleLeft, setBubbleLeft] = useState(0);
  const speechRef = useRef<HTMLDivElement | null>(null);
  const toastRef = useRef<HTMLDivElement | null>(null);
  const frame = resolveWhaleFrame(status, emotion);
  const { toast, replyToast, dismissToast, dismissReply } = useReplyBubbles({
    status,
    statusMessage,
    buddyTitle,
    buddyMessage,
    latestReply,
  });
  const { startDrag } = useWidgetDrag({
    peek,
    position,
    setPosition,
    setPeek,
  });

  const displayPos = peek === null ? position : peekPosition(peek, position);

  /** 回复/提醒气泡边界自适应：默认与人物左缘对齐向右展开；
   * 右侧空间不足时向左展开，渲染后按实测校正水平溢出。 */
  useLayoutEffect(() => {
    const node = replyToast !== null ? speechRef.current : toast !== null ? toastRef.current : null;
    if (node === null) return;
    const rect = node.getBoundingClientRect();
    const bubbleW = rect.width > 0 ? rect.width : 280;
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const widgetW = peek === null ? FIGURE_W : PEEK_W;
    const widgetLeft = displayPos.left;
    let left = 0;
    if (widgetLeft + left + bubbleW > viewportW - POPOVER_EDGE) {
      left = widgetW - bubbleW;
    }
    left = Math.max(
      POPOVER_EDGE - widgetLeft,
      Math.min(left, viewportW - bubbleW - POPOVER_EDGE - widgetLeft),
    );
    setBubbleLeft(left);
  }, [replyToast, toast, displayPos.left, peek]);

  const handleReply = (): void => {
    setContextMenu(null);
    onReply?.();
  };

  const openContextMenu = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (onReply === undefined) return;
    const menuWidth = 160;
    const menuHeight = 44;
    const edge = 8;
    setContextMenu({
      left: Math.min(event.clientX, window.innerWidth - menuWidth - edge),
      top: Math.min(event.clientY, window.innerHeight - menuHeight - edge),
    });
  };

  useEffect(() => {
    if (contextMenu === null) return;
    const close = (): void => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  const label = `${companionName}：${STATUS_HINT[status]}`;
  const typedToast = useTypewriter(toast?.message, 30);
  const typedReplyToast = useTypewriter(replyToast ?? undefined, 30);
  const widgetH = peek === null ? FIGURE_H : PEEK_H;
  const bubbleStyle = peek === 'top'
    ? { left: bubbleLeft, top: widgetH + POPOVER_GAP + 4 }
    : { left: bubbleLeft, bottom: widgetH + POPOVER_GAP + 4 };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      className={styles['dsh-companion-whale']}
      style={{ left: displayPos.left, top: displayPos.top }}
      onPointerDown={startDrag}
      onContextMenu={openContextMenu}
    >
      {peek === null ? (
        <div className={styles['dsh-companion-whale__figure']} style={{ width: FIGURE_W, height: FIGURE_H }}>
          <img
            className={styles['dsh-companion-whale__img']}
            src={frameUrl(frame)}
            alt=""
            draggable={false}
            aria-hidden="true"
          />
        </div>
      ) : (
        <button
          type="button"
          className={styles['dsh-companion-whale__peek']}
          title={`${companionName}（点击恢复）`}
          aria-label="恢复鲸鱼"
          onClick={(event) => {
            event.stopPropagation();
            setPeek(null);
          }}
        >
          <DeepSeekLogo className={styles['dsh-companion-whale__peek-logo']} />
        </button>
      )}
      {replyToast !== null ? (
        <WhaleMessageBubble
          ref={speechRef}
          kind="reply"
          companionName={companionName}
          text={replyToast}
          typedText={typedReplyToast}
          style={bubbleStyle}
          closeLabel="关闭回复"
          onClose={dismissReply}
        />
      ) : null}
      {toast !== null ? (
        <WhaleMessageBubble
          ref={toastRef}
          kind="toast"
          companionName={companionName}
          title={toast.title}
          text={toast.message}
          typedText={typedToast}
          style={bubbleStyle}
          closeLabel="关闭提醒"
          onClose={dismissToast}
        />
      ) : null}
      {contextMenu !== null ? (
        <WhaleContextMenu companionName={companionName} left={contextMenu.left} top={contextMenu.top} onChat={handleReply} />
      ) : null}
    </div>
  );
}
