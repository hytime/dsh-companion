import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTypewriter } from './use-typewriter';

describe('useTypewriter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('空文本立即返回空串', () => {
    const { result } = renderHook(() => useTypewriter(''));
    expect(result.current).toBe('');
  });

  it('文本逐字符出现，完成后停在全文', () => {
    const { result } = renderHook(() => useTypewriter('你好世界', 50));
    expect(result.current).toBe('');
    act(() => vi.advanceTimersByTime(50));
    expect(result.current).toBe('你');
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe('你好世');
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('你好世界');
  });

  it('文本变化时从头开始', () => {
    const { result, rerender } = renderHook(({ text }) => useTypewriter(text), {
      initialProps: { text: '一二三' },
    });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('一二三');
    rerender({ text: '甲乙' });
    expect(result.current).toBe('');
    act(() => vi.advanceTimersByTime(50));
    expect(result.current).toBe('甲');
  });
});
