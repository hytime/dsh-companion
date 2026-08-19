import * as React from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useWidgetDrag } from './use-widget-drag';

function pointerEvent(type: string, values: Record<string, number>): Event {
  const event = new Event(type);
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(event, key, { configurable: true, value });
  }
  return event;
}

describe('useWidgetDrag', () => {
  it('persists a real drag without opening a status window', () => {
    const { result } = renderHook(() => {
      const [position, setPosition] = React.useState({ left: 10, top: 10 });
      const [peek, setPeek] = React.useState<import('../utils/widget-position').PeekEdge | null>(null);
      return { ...useWidgetDrag({ peek, position, setPosition, setPeek }), position };
    });
    const target = document.createElement('div');
    target.getBoundingClientRect = () => ({
      left: 10, top: 10, width: 130, height: 130, right: 140, bottom: 140,
      x: 10, y: 10, toJSON: () => ({}),
    } as DOMRect);

    act(() => {
      result.current.startDrag({
        button: 0, pointerType: 'mouse', pointerId: 1, clientX: 10, clientY: 10,
        currentTarget: target,
      } as unknown as React.PointerEvent<HTMLDivElement>);
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 30, clientY: 40 }));
      window.dispatchEvent(pointerEvent('pointerup', { clientX: 30, clientY: 40 }));
    });

    expect(result.current.position).toEqual({ left: 30, top: 40 });
    expect(window.localStorage.getItem('dsh-companion.whale.pos')).toContain('30');
  });
});
