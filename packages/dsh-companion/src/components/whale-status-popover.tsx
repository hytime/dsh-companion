import * as React from 'react';
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives';
import type { AffectionStats, SkillStatus } from '../contracts/skill-contract';
import styles from '../styles/companion.module.css';

export interface WhaleStatusPopoverProps {
  companionName: string;
  userCallName?: string;
  affection?: AffectionStats;
  status: SkillStatus;
  lastError?: string;
  /** 根节点定位（相对最近的 positioned 祖先 = 鲸鱼 root）。 */
  style?: React.CSSProperties;
  onReply?: () => void;
  onClose?: () => void;
}

const STATUS_TEXT: Record<SkillStatus, string> = {
  idle: '等待输入当前对话',
  connecting: '正在连接 Travel Note CLI',
  thinking: '旅伴思考中…',
  replying: '正在返回当前对话',
  success: '已返回当前对话',
  error: '调用失败，请重试',
  cancelled: '调用已取消',
};

/** Skill 状态 → ui-primitives StateDot 状态。 */
export function skillStatusToStateDot(status: SkillStatus): StateDotState {
  switch (status) {
    case 'error':
      return 'error';
    case 'connecting':
    case 'thinking':
    case 'replying':
      return 'ongoing';
    case 'success':
      return 'done';
    case 'cancelled':
      return 'done';
    default:
      return 'done';
  }
}

/**
 * 鲸鱼娘对话窗内容：旅伴名称 + 状态（ui-primitives StateDot）+ 最新 buddy 消息 + 回复按钮。
 * 组件来自 DSH ui-primitives；定位由 WhaleFloatingWidget 容器负责。
 */
export const WhaleStatusPopover = React.forwardRef<HTMLDivElement, WhaleStatusPopoverProps>(
  function WhaleStatusPopover(
    {
      companionName,
      userCallName,
      affection,
      status,
      lastError,
      style,
      onReply,
      onClose,
    },
    ref,
  ) {
  // showAffection=false 时 host 把 9 个好感度字段全部置 0，这里与悬浮条
  // （whale-floating-widget 的 affectionScore > 0 meter 隐藏逻辑）保持一致：
  // affection 缺省或 affectionScore <= 0 时不渲染好感度区块（含 4 行指标）。
  const affectionRows: Array<{ label: string; value: number }> =
    affection !== undefined && affection.affectionScore > 0
      ? [
          { label: '好感度', value: affection.affectionScore },
          { label: '亲密度', value: affection.intimacyScore },
          { label: '信任感', value: affection.trustScore },
          { label: '活跃度', value: affection.engagementScore },
        ]
      : [];
  const affectionMeta = affection
    ? [
        affection.talkativenessFactor > 0 ? `话痨 ${affection.talkativenessFactor.toFixed(1)}` : '',
        affection.proactiveProbabilityFactor > 0
          ? `主动 ${affection.proactiveProbabilityFactor.toFixed(1)}`
          : '',
        affection.cooldownFactor > 0 ? `冷却 ${affection.cooldownFactor.toFixed(1)}` : '',
        affection.lastEvaluatedDate ? `评价 ${affection.lastEvaluatedDate}` : '',
        affection.lastAnnouncedDate ? `提醒 ${affection.lastAnnouncedDate}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  return (
    <div
      ref={ref}
      className={styles['dsh-companion-popover']}
      style={style}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className={styles['dsh-companion-popover__head']}>
        <span className={styles['dsh-companion-popover__title']}>
          <StateDot state={skillStatusToStateDot(status)} />
          <span>
            {companionName}：{STATUS_TEXT[status]}
          </span>
        </span>
        {onClose ? (
          <button
            type="button"
            aria-label="关闭"
            className={styles['dsh-companion-popover__close']}
            onClick={onClose}
          >
            ×
          </button>
        ) : null}
      </div>
      {userCallName ? (
        <div className={styles['dsh-companion-popover__greet']}>你好，{userCallName}</div>
      ) : null}
      {affectionRows.length > 0 ? (
        <div className={styles['dsh-companion-popover__affection']}>
          {affectionRows.map((row) => (
            <div key={row.label} className={styles['dsh-companion-popover__affection-row']}>
              <span className={styles['dsh-companion-popover__affection-label']}>{row.label}</span>
              <div className={styles['dsh-companion-popover__affection-track']}>
                <div
                  className={styles['dsh-companion-popover__affection-fill']}
                  style={{ width: `${Math.min(100, Math.max(0, row.value))}%` }}
                />
              </div>
              <span className={styles['dsh-companion-popover__affection-value']}>
                {Math.round(row.value)}
              </span>
            </div>
          ))}
          {affectionMeta !== '' ? (
            <div className={styles['dsh-companion-popover__affection-meta']}>{affectionMeta}</div>
          ) : null}
        </div>
      ) : null}
      {status === 'error' && lastError ? (
        <div className={styles['dsh-companion-popover__error']}>{lastError}</div>
      ) : null}
      {onReply ? (
        <Button
          variant="primary"
          size="sm"
          className={styles['dsh-companion-popover__reply']}
          onClick={onReply}
        >
          和{companionName}聊聊
        </Button>
      ) : null}
    </div>
  );
  },
);
