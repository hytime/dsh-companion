/* eslint-disable @next/next/no-img-element -- 本插件不是 Next.js 项目，使用原生 img 加载鲸鱼娘帧 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { WhaleStatusPopover } from './whale-status-popover';
import { DeepSeekLogo } from './deepseek-logo';
import { frameUrl, resolveWhaleFrame } from './expression-map';
import { useTypewriter } from './use-typewriter';
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

// 帧图源为 512×512 方形，按 1:4 显示为 130×130（保持比例）。
const FIGURE_W = 130;
const FIGURE_H = 130;
const EDGE_MARGIN = 16;
const POPOVER_GAP = 2;
const POPOVER_EDGE = 8;
const POSITION_STORAGE_KEY = 'dsh-companion.whale.pos';
const PEEK_W = 44;
const PEEK_H = 44;
const DOCK_PX = 24;
const TOAST_MS = 6000;

type PeekEdge = 'right' | 'left' | 'top' | 'bottom';

interface ToastState {
  title: string;
  message: string;
}

interface DragState {
  startX: number;
  startY: number;
  left: number;
  top: number;
  moved: boolean;
}

/** 初始位置：优先 localStorage 记忆，缺省右下角（始终 left/top 定位）。 */
function initialPosition(): { left: number; top: number } {
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 768;
  const fallback = {
    left: Math.max(0, viewportW - FIGURE_W - EDGE_MARGIN),
    top: Math.max(0, viewportH - FIGURE_H - EDGE_MARGIN),
  };
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        typeof (parsed as Record<string, unknown>).left === 'number' &&
        typeof (parsed as Record<string, unknown>).top === 'number'
      ) {
        const left = (parsed as { left: number; top: number }).left;
        const top = (parsed as { left: number; top: number }).top;
        return {
          left: Math.min(Math.max(0, left), Math.max(0, viewportW - EDGE_MARGIN)),
          top: Math.min(Math.max(0, top), Math.max(0, viewportH - EDGE_MARGIN)),
        };
      }
    }
  } catch {
    // 存储不可用时回退默认位置
  }
  return fallback;
}

function savePosition(position: { left: number; top: number }): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // 存储失败不影响交互
  }
}

/** 离哪个视口边缘最近（距离 ≤ DOCK_PX 时返回该边缘，否则 null）。 */
function nearestEdge(left: number, top: number): PeekEdge | null {
  if (typeof window === 'undefined') return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const candidates: Array<{ edge: PeekEdge; d: number }> = [
    { edge: 'right', d: vw - (left + FIGURE_W) },
    { edge: 'left', d: left },
    { edge: 'bottom', d: vh - (top + FIGURE_H) },
    { edge: 'top', d: top },
  ];
  candidates.sort((a, b) => a.d - b.d);
  const nearest = candidates[0];
  return nearest === undefined ? null : nearest.d <= DOCK_PX ? nearest.edge : null;
}

/** 隐藏成鲸鱼头时，吸附到指定边缘的定位。 */
function peekPosition(edge: PeekEdge, position: { left: number; top: number }): { left: number; top: number } {
  if (typeof window === 'undefined') return position;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  switch (edge) {
    case 'right':
      return { left: Math.max(0, vw - PEEK_W), top: position.top };
    case 'left':
      return { left: 0, top: position.top };
    case 'bottom':
      return { left: position.left, top: Math.max(0, vh - PEEK_H) };
    case 'top':
      return { left: position.left, top: 0 };
  }
}

/**
 * 鲸鱼娘悬浮人物：完整立绘悬浮（可拖动、位置记忆、表情帧切换）。
 * 对话窗在人物上方展开（边界自适应），控件使用 DSH ui-primitives（Tooltip/Button）。
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
  const [toast, setToast] = useState<ToastState | null>(null);
  const [replyToast, setReplyToast] = useState<string | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>(() => ({
    left: 0,
    bottom: FIGURE_H + POPOVER_GAP,
  }));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const posRef = useRef(position);
  const skipClickRef = useRef(false);
  const lastBuddyRef = useRef('');
  const lastReplyRef = useRef('');
  const frame = resolveWhaleFrame(status, emotion);

  // 新 buddy 提醒 → 直接弹窗（toast），6s 自动消失；与回复气泡互斥（弹提醒时关回复）。
  // 回复对话中（connecting/thinking/replying）不弹提醒，回到 idle 后再弹（不标记已读）。
  useEffect(() => {
    if (buddyMessage === undefined || buddyMessage === '') return;
    if (buddyMessage === lastBuddyRef.current) return;
    if (status === 'connecting' || status === 'thinking' || status === 'replying') return;
    lastBuddyRef.current = buddyMessage;
    if (buddyTitle !== undefined && buddyTitle !== '') {
      setReplyToast(null);
      setToast({ title: buddyTitle, message: buddyMessage });
    }
  }, [buddyMessage, buddyTitle, status]);

  // 新对话回复 → 单独的人物对话气泡，8s 自动消失；与提醒互斥（弹回复时关提醒）。
  useEffect(() => {
    if (latestReply === undefined || latestReply === '') return;
    if (latestReply === lastReplyRef.current) return;
    lastReplyRef.current = latestReply;
    setToast(null);
    setReplyToast(latestReply);
  }, [latestReply]);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (replyToast === null) return;
    const timer = setTimeout(() => setReplyToast(null), TOAST_MS + 2000);
    return () => clearTimeout(timer);
  }, [replyToast]);

  const togglePeek = (): void => {
    if (peek !== null) {
      setPeek(null);
      return;
    }
    const edge = nearestEdge(posRef.current.left, posRef.current.top);
    if (edge !== null) setPeek(edge);
  };

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

  const startDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (peek !== null) return;
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const current = { left: rect.left, top: rect.top };
    posRef.current = current;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      left: current.left,
      top: current.top,
      moved: false,
    };
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // 忽略捕获失败，window 监听仍可工作
      }
    }
    const move = (ev: PointerEvent): void => {
      const drag = dragRef.current;
      if (drag === null) return;
      const dx = ev.clientX - drag.startX;
      const dy = ev.clientY - drag.startY;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) {
        const next = { left: Math.max(0, drag.left + dx), top: Math.max(0, drag.top + dy) };
        posRef.current = next;
        setPosition(next);
      }
    };
    const up = (): void => {
      const drag = dragRef.current;
      dragRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (drag !== null) {
        // pointerup 已处理本次交互（拖动保存 / 点击切换），后续 click 一律跳过。
        skipClickRef.current = true;
        if (drag.moved) {
          savePosition(posRef.current);
          // 贴边自动隐藏成鲸鱼头
          const edge = nearestEdge(posRef.current.left, posRef.current.top);
          setPeek(edge);
        } else {
          setOpen((current) => !current);
        }
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const handleClick = (): void => {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    setOpen((current) => !current);
  };

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
      {typeof affection?.affectionScore === 'number' && affection.affectionScore > 0 ? (
        <div
          className={styles['dsh-companion-whale__affection']}
          role="meter"
          aria-label={`好感度 ${Math.round(affection.affectionScore)}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(affection.affectionScore)}
        >
          <span className={styles['dsh-companion-whale__affection-heart']} aria-hidden="true">
            ♥
          </span>
          <div className={styles['dsh-companion-whale__affection-track']}>
            <div
              className={styles['dsh-companion-whale__affection-fill']}
              style={{ width: `${Math.min(100, Math.max(0, affection.affectionScore))}%` }}
            />
          </div>
          <span className={styles['dsh-companion-whale__affection-value']}>
            {Math.round(affection.affectionScore)}
          </span>
        </div>
      ) : null}
      {replyToast !== null ? (
        <div
          className={styles['dsh-companion-whale__speech']}
          style={{ bottom: toastBottom }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className={styles['dsh-companion-whale__speech-name']}>{companionName}</div>
          <div className={styles['dsh-companion-whale__speech-text']}>{typedReplyToast}</div>
          <button
            type="button"
            className={styles['dsh-companion-whale__speech-close']}
            aria-label="关闭回复"
            onClick={(event) => {
              event.stopPropagation();
              setReplyToast(null);
            }}
          >
            ×
          </button>
        </div>
      ) : null}
      {toast !== null ? (
        <div
          className={styles['dsh-companion-whale__toast']}
          style={{ bottom: FIGURE_H + POPOVER_GAP + 4 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className={styles['dsh-companion-whale__toast-title']}>{toast.title}</div>
          <div className={styles['dsh-companion-whale__toast-text']}>{typedToast}</div>
          <button
            type="button"
            className={styles['dsh-companion-whale__toast-close']}
            aria-label="关闭提醒"
            onClick={(event) => {
              event.stopPropagation();
              setToast(null);
            }}
          >
            ×
          </button>
        </div>
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
