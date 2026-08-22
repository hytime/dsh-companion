export const WHALE_HIDDEN_STORAGE_KEY = 'dsh-companion.whale.hidden';
const WHALE_VISIBILITY_EVENT = 'dsh-companion.whale.visibility';

function canUseWindow(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function isWhaleHidden(): boolean {
  if (!canUseWindow()) return false;
  return window.localStorage.getItem(WHALE_HIDDEN_STORAGE_KEY) === 'true';
}

export function setWhaleHidden(hidden: boolean): void {
  if (!canUseWindow()) return;
  if (hidden) window.localStorage.setItem(WHALE_HIDDEN_STORAGE_KEY, 'true');
  else window.localStorage.removeItem(WHALE_HIDDEN_STORAGE_KEY);
  window.dispatchEvent(new Event(WHALE_VISIBILITY_EVENT));
}

export function subscribeWhaleVisibility(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handleStorage = (event: StorageEvent): void => {
    if (event.key === WHALE_HIDDEN_STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener('storage', handleStorage);
  window.addEventListener(WHALE_VISIBILITY_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(WHALE_VISIBILITY_EVENT, onChange);
  };
}
