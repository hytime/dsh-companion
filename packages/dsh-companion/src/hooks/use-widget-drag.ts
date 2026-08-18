import { useEffect, useRef } from 'react';
import type * as React from 'react';
import { nearestEdge, savePosition, type PeekEdge, type Position } from '../utils/widget-position';

interface DragState {
  startX: number;
  startY: number;
  left: number;
  top: number;
  moved: boolean;
}

export interface WidgetDragOptions {
  peek: PeekEdge | null;
  position: Position;
  setPosition: React.Dispatch<React.SetStateAction<Position>>;
  setPeek: React.Dispatch<React.SetStateAction<PeekEdge | null>>;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useWidgetDrag({ peek, position, setPosition, setPeek, setOpen }: WidgetDragOptions) {
  const positionRef = useRef(position);
  const dragRef = useRef<DragState | null>(null);
  const skipClickRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  positionRef.current = position;

  const startDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (peek !== null) return;
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    cleanupRef.current?.();
    const rect = event.currentTarget.getBoundingClientRect();
    const current = { left: rect.left, top: rect.top };
    positionRef.current = current;
    dragRef.current = { startX: event.clientX, startY: event.clientY, ...current, moved: false };
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* window listeners remain available */ }
    }
    const move = (nextEvent: PointerEvent): void => {
      const drag = dragRef.current;
      if (drag === null) return;
      const dx = nextEvent.clientX - drag.startX;
      const dy = nextEvent.clientY - drag.startY;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) {
        const next = { left: Math.max(0, drag.left + dx), top: Math.max(0, drag.top + dy) };
        positionRef.current = next;
        setPosition(next);
      }
    };
    const cleanup = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (cleanupRef.current === cleanup) cleanupRef.current = null;
    };
    const up = (): void => {
      const drag = dragRef.current;
      dragRef.current = null;
      cleanup();
      if (drag === null) return;
      skipClickRef.current = true;
      if (drag.moved) {
        savePosition(positionRef.current);
        setPeek(nearestEdge(positionRef.current.left, positionRef.current.top));
      } else {
        setOpen((currentOpen) => !currentOpen);
      }
    };
    cleanupRef.current = cleanup;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  useEffect(() => () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    dragRef.current = null;
  }, []);

  const handleClick = (): void => {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    setOpen((currentOpen) => !currentOpen);
  };

  const togglePeek = (): void => {
    if (peek !== null) {
      setPeek(null);
      return;
    }
    const edge = nearestEdge(positionRef.current.left, positionRef.current.top);
    if (edge !== null) setPeek(edge);
  };

  return { positionRef, startDrag, handleClick, togglePeek };
}
