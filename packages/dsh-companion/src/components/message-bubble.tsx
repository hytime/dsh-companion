import * as React from 'react';
import styles from '../styles/companion.module.css';

type BubbleKind = 'reply' | 'toast';

export interface MessageBubbleProps {
  kind: BubbleKind;
  companionName: string;
  title?: string;
  text: string;
  typedText: string | undefined;
  style: React.CSSProperties;
  closeLabel: string;
  onClose: () => void;
}

export const WhaleMessageBubble = React.forwardRef<HTMLDivElement, MessageBubbleProps>(
  function WhaleMessageBubble({ kind, companionName, title, text, typedText, style, closeLabel, onClose }, ref) {
    const isReply = kind === 'reply';
    return (
      <div
        ref={ref}
        className={styles[isReply ? 'dsh-companion-whale__speech' : 'dsh-companion-whale__toast']}
        style={style}
        onClick={(event) => event.stopPropagation()}
      >
        {isReply ? (
          <div className={styles['dsh-companion-whale__speech-name']}>{companionName}</div>
        ) : (
          <div className={styles['dsh-companion-whale__toast-title']}>{title ?? '提醒'}</div>
        )}
        <div className={styles[isReply ? 'dsh-companion-whale__speech-text' : 'dsh-companion-whale__toast-text']}>
          {typedText ?? text}
        </div>
        <button
          type="button"
          className={styles[isReply ? 'dsh-companion-whale__speech-close' : 'dsh-companion-whale__toast-close']}
          aria-label={closeLabel}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          ×
        </button>
      </div>
    );
  },
);
