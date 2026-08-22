import { useSyncExternalStore } from 'react';
import { isWhaleHidden, subscribeWhaleVisibility } from '../utils/widget-visibility';

export function useWhaleHidden(): boolean {
  return useSyncExternalStore(subscribeWhaleVisibility, isWhaleHidden, () => false);
}
