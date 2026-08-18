/* eslint-disable @next/next/no-img-element -- 本插件不是 Next.js 项目，使用原生 img 加载鲸鱼娘帧 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { WhaleStatusPopover } from './whale-status-popover';
import { DeepSeekLogo } from './deepseek-logo';
import { frameUrl, resolveWhaleFrame } from './expression-map';
import { useTypewriter } from '../hooks/use-typewriter';
import { useWidgetDrag } from '../hooks/use-widget-drag';
import { useReplyBubbles } from '../hooks/use-reply-bubbles';
import { WhaleAffectionMeter } from './affection-meter';
import { WhaleMessageBubble } from './message-bubble';
import {
  FIGURE_H,
  FIGURE_W,
  POPOVER_EDGE,
  POPOVER_GAP,
  initialPosition,
  peekPosition,
  type PeekEdge,
} from '../utils/widget-position';
import type { AffectionStats, CompanionEmotion, SkillStatus } from '../contracts/skill-contract';
import styles from '../styles/companion.module.css';

export interface WhaleFloatingWidgetProps {
  status: SkillStatus;
  emotion?: CompanionEmotion;
  lastError?: string;
  companionName?: string;
  userCallName?: string;
  affection?: AffectionStats;
  buddyTitle?: string;
  buddyMessage?: string;
  latestReply?: string;
  onReply?: () => void;
  onClose?: () => void;
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
  lastError,
  companionName = '旅伴',
  userCallName,
  affection,
  buddyTitle,
  buddyMessage,
  latestReply,
  onReply,
  onClose,
}: WhaleFloatingWidgetProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(initialPosition);
  const [peek, setPeek] = useState<PeekEdge | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>(() => ({
    left: 0,
    bottom: FIGURE_H + POPOVER_GAP,
  }));
  const [bubbleLeft, setBubbleLeft] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const speechRef = useRef<HTMLDivElement | null>(null);
  const toastRef = useRef<HTMLDivElement | null>(null);
  const frame = resolveWhaleFrame(status, emotion);
  const { toast, replyToast, dismissToast, dismissReply } = useReplyBubbles({
    status,
    buddyTitle,
    buddyMessage,
    latestReply,
  });
  const { startDrag, handleClick, togglePeek } = useWidgetDrag({
    peek,
    position,
    setPosition,
    setPeek,
    setOpen,
  });

  /** 回复/提醒气泡边界自适应：默认与人物左缘对齐向右展开；
   * 右侧空间不足时向左展开，渲染后按实测校正水平溢出。 */
  useLayoutEffect(() => {
    const node = replyToast !== null ? speechRef.current : toast !== null ? toastRef.current : null;
    if (node === null) return;
    const rect = node.getBoundingClientRect();
    const bubbleW = rect.width > 0 ? rect.width : 280;
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024;
    let left = 0;
    if (position.left + left + bubbleW > viewportW - POPOVER_EDGE) {
      left = FIGURE_W - bubbleW;
    }
    left = Math.max(
      POPOVER_EDGE - position.left,
      Math.min(left, viewportW - bubbleW - POPOVER_EDGE - position.left),
    );
    setBubbleLeft(left);
  }, [replyToast, toast, position]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        rootRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  /** 对话窗边界自适应：优先上方；空间不足转下方；水平防溢出（渲染后按实测校正）。
   *  对话窗是 root 的子元素，left 为相对 root 的偏移（root 本身定位在 position.left）。 */
  useLayoutEffect(() => {
    if (!open) return;
    const node = popoverRef.current;
    if (node === null) return;
    const rect = node.getBoundingClientRect();
    const popoverW = rect.width > 0 ? rect.width : 280;
    const popoverH = rect.height > 0 ? rect.height : 120;
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const spaceTop = position.top;
    const vertical: React.CSSProperties =
      spaceTop >= popoverH + POPOVER_GAP
        ? { bottom: FIGURE_H + POPOVER_GAP }
        : { top: FIGURE_H + POPOVER_GAP };
    // 相对 root 的偏移：默认 0（与鲸鱼左缘对齐）；右侧溢出时右对齐（右缘贴鲸鱼右缘）。
    let relativeLeft = 0;
    if (position.left + relativeLeft + popoverW > viewportW - POPOVER_EDGE) {
      relativeLeft = FIGURE_W - popoverW;
    }
    relativeLeft = Math.max(
      POPOVER_EDGE - position.left,
      Math.min(relativeLeft, viewportW - popoverW - POPOVER_EDGE - position.left),
    );
    setPopoverStyle({ left: relativeLeft, ...vertical });
  }, [open, position, buddyMessage, lastError]);

  const handleReply = (): void => {
    setOpen(false);
    onReply?.();
  };

  const label = `${companionName}：${STATUS_HINT[status]}`;
  const displayPos = peek === null ? position : peekPosition(peek, position);
  const typedToast = useTypewriter(toast?.message, 30);
  const typedReplyToast = useTypewriter(replyToast ?? undefined, 30);
  const toastBottom = FIGURE_H + POPOVER_GAP + 4;

  return (
    <div
      ref={rootRef}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-expanded={open}
      className={styles['dsh-companion-whale']}
      style={{ left: displayPos.left, top: displayPos.top }}
      onPointerDown={startDrag}
      onClick={handleClick}
      onContextMenu={(event) => {
        event.preventDefault();
        togglePeek();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setOpen((current) => !current);
        }
      }}
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
      <WhaleAffectionMeter affection={affection} />
      {replyToast !== null ? (
        <WhaleMessageBubble
          ref={speechRef}
          kind="reply"
          companionName={companionName}
          text={replyToast}
          typedText={typedReplyToast}
          style={{ left: bubbleLeft, bottom: toastBottom }}
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
          style={{ left: bubbleLeft, bottom: toastBottom }}
          closeLabel="关闭提醒"
          onClose={dismissToast}
        />
      ) : null}
      {open ? (
        <WhaleStatusPopover
          ref={popoverRef}
          style={popoverStyle}
          companionName={companionName}
          userCallName={userCallName}
          affection={affection}
          status={status}
          lastError={lastError}
          onReply={onReply ? handleReply : undefined}
          onClose={() => {
            setOpen(false);
            onClose?.();
          }}
        />
      ) : null}
    </div>
  );
}
