import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useReplyBubbles, type ReplyBubbleOptions } from './use-reply-bubbles';

describe('useReplyBubbles', () => {
  it('suppresses buddy messages while busy and replays them after idle', () => {
    const { result, rerender } = renderHook<ReturnType<typeof useReplyBubbles>, ReplyBubbleOptions>((props) => useReplyBubbles(props), {
      initialProps: { status: 'thinking' as const, buddyTitle: '提醒', buddyMessage: '喝水' },
    });
    expect(result.current.toast).toBeNull();

    rerender({ status: 'success' as const, buddyTitle: '提醒', buddyMessage: '喝水' });
    expect(result.current.toast).toEqual({ title: '提醒', message: '喝水' });
  });

  it('gives a new chat reply priority over an existing buddy toast', () => {
    const { result, rerender } = renderHook<ReturnType<typeof useReplyBubbles>, ReplyBubbleOptions>((props) => useReplyBubbles(props), {
      initialProps: { status: 'idle' as const, buddyMessage: '喝水' },
    });
    expect(result.current.toast?.message).toBe('喝水');

    rerender({ status: 'idle' as const, buddyMessage: '喝水', latestReply: '我已经处理好了' });
    expect(result.current.toast).toBeNull();
    expect(result.current.replyToast).toBe('我已经处理好了');
  });

  it('clears a reply after the configured display lifetime', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useReplyBubbles({ status: 'idle', latestReply: '稍等一下' }));
    expect(result.current.replyToast).toBe('稍等一下');
    act(() => vi.advanceTimersByTime(8000));
    expect(result.current.replyToast).toBeNull();
    vi.useRealTimers();
  });
});
