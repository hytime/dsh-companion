import * as React from 'react';
import styles from '../styles/companion.module.css';

export interface WhaleContextMenuProps {
  companionName: string;
  left: number;
  top: number;
  onChat: () => void;
  onHide: () => void;
}

export function WhaleContextMenu({ companionName, left, top, onChat, onHide }: WhaleContextMenuProps): React.ReactElement {
  return (
    <div
      role="menu"
      className={styles['dsh-companion-context-menu']}
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={onChat}>
        和{companionName}聊聊
      </button>
      <button type="button" role="menuitem" onClick={onHide}>
        隐藏鲸鱼娘
      </button>
    </div>
  );
}
