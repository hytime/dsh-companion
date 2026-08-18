import type { AffectionStats } from '../contracts/skill-contract';
import type { ReactElement } from 'react';
import styles from '../styles/companion.module.css';

export function WhaleAffectionMeter({ affection }: { affection?: AffectionStats }): ReactElement | null {
  if (typeof affection?.affectionScore !== 'number' || affection.affectionScore <= 0) return null;
  return (
    <div
      className={styles['dsh-companion-whale__affection']}
      role="meter"
      aria-label={`好感度 ${Math.round(affection.affectionScore)}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(affection.affectionScore)}
    >
      <span className={styles['dsh-companion-whale__affection-heart']} aria-hidden="true">♥</span>
      <div className={styles['dsh-companion-whale__affection-track']}>
        <div
          className={styles['dsh-companion-whale__affection-fill']}
          style={{ width: `${Math.min(100, Math.max(0, affection.affectionScore))}%` }}
        />
      </div>
      <span className={styles['dsh-companion-whale__affection-value']}>{Math.round(affection.affectionScore)}</span>
    </div>
  );
}
