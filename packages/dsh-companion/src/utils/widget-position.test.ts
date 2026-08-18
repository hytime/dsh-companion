import { afterEach, describe, expect, it } from 'vitest';
import {
  FIGURE_H,
  FIGURE_W,
  initialPosition,
  nearestEdge,
  peekPosition,
  POSITION_STORAGE_KEY,
} from './widget-position';

afterEach(() => {
  window.localStorage.clear();
});

describe('widget position helpers', () => {
  it('uses the viewport default when storage is empty', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    expect(initialPosition()).toEqual({ left: 1024 - FIGURE_W - 16, top: 768 - FIGURE_H - 16 });
  });

  it('clamps stored coordinates to the viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify({ left: 9999, top: -2 }));
    expect(initialPosition()).toEqual({ left: 784, top: 0 });
  });

  it.each([
    ['left', { left: 10, top: 200 }],
    ['right', { left: 880, top: 200 }],
    ['top', { left: 200, top: 10 }],
    ['bottom', { left: 200, top: 624 }],
  ] as const)('detects the nearest %s edge', (edge, position) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    expect(nearestEdge(position.left, position.top)).toBe(edge);
  });

  it('returns the peek position on the requested edge', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    expect(peekPosition('right', { left: 300, top: 200 })).toEqual({ left: 980, top: 200 });
    expect(peekPosition('bottom', { left: 300, top: 200 })).toEqual({ left: 300, top: 724 });
  });
});
