export const FIGURE_W = 130;
export const FIGURE_H = 130;
export const EDGE_MARGIN = 16;
export const POPOVER_GAP = 2;
export const POPOVER_EDGE = 8;
export const POSITION_STORAGE_KEY = 'dsh-companion.whale.pos';
export const PEEK_W = 44;
export const PEEK_H = 44;
export const DOCK_PX = 24;

export type Position = { left: number; top: number };
export type PeekEdge = 'right' | 'left' | 'top' | 'bottom';

export function initialPosition(): Position {
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 768;
  const fallback = {
    left: Math.max(0, viewportW - FIGURE_W - EDGE_MARGIN),
    top: Math.max(0, viewportH - FIGURE_H - EDGE_MARGIN),
  };
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed !== null && typeof parsed === 'object'
        && typeof (parsed as Record<string, unknown>).left === 'number'
        && typeof (parsed as Record<string, unknown>).top === 'number'
      ) {
        const { left, top } = parsed as Position;
        return {
          left: Math.min(Math.max(0, left), Math.max(0, viewportW - EDGE_MARGIN)),
          top: Math.min(Math.max(0, top), Math.max(0, viewportH - EDGE_MARGIN)),
        };
      }
    }
  } catch {
    // Invalid or unavailable storage falls back to the viewport default.
  }
  return fallback;
}

export function savePosition(position: Position): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try { window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position)); } catch { /* ignore storage failures */ }
}

export function nearestEdge(left: number, top: number): PeekEdge | null {
  if (typeof window === 'undefined') return null;
  const candidates: Array<{ edge: PeekEdge; distance: number }> = [
    { edge: 'right', distance: window.innerWidth - (left + FIGURE_W) },
    { edge: 'left', distance: left },
    { edge: 'bottom', distance: window.innerHeight - (top + FIGURE_H) },
    { edge: 'top', distance: top },
  ];
  candidates.sort((a, b) => a.distance - b.distance);
  const nearest = candidates[0];
  return nearest !== undefined && nearest.distance <= DOCK_PX ? nearest.edge : null;
}

export function peekPosition(edge: PeekEdge, position: Position): Position {
  if (typeof window === 'undefined') return position;
  switch (edge) {
    case 'right': return { left: Math.max(0, window.innerWidth - PEEK_W), top: position.top };
    case 'left': return { left: 0, top: position.top };
    case 'bottom': return { left: position.left, top: Math.max(0, window.innerHeight - PEEK_H) };
    case 'top': return { left: position.left, top: 0 };
  }
}
