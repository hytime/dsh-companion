import * as React from 'react';
import styles from '../styles/companion.module.css';

export interface WhaleContextMenuProps {
  left: number;
  top: number;
  onChat: () => void;
}

export function WhaleContextMenu({ left, top, onChat }: WhaleContextMenuProps): React.ReactElement {
  return (
    <div
      role="menu"
      className={styles['dsh-companion-context-menu']}
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={onChat}>
        和旅伴聊聊
      </button>
    </div>
  );
}
