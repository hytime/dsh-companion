import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCompanionEventStream } from './event-stream';
import type { CompanionRemoteFace } from '../companion-types';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly close = vi.fn();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();
  constructor(readonly url: string) { FakeEventSource.instances.push(this); }
  addEventListener(name: string, listener: (event: MessageEvent<string>) => void): void { this.listeners.set(name, listener); }
  emit(name: string, value: unknown): void { this.listeners.get(name)?.({ data: JSON.stringify(value) } as MessageEvent<string>); }
}

afterEach(() => {
  FakeEventSource.instances = [];
  vi.restoreAllMocks();
});

function makeRemote(): CompanionRemoteFace {
  return {
    status: vi.fn().mockResolvedValue({ ok: true, value: { status: 'idle' } }),
    buddy: vi.fn().mockResolvedValue({ ok: true, value: { message: '', title: '', dueAt: '', companionName: '旅伴', userCallName: '', affectionScore: 0, intimacyScore: 0, trustScore: 0, engagementScore: 0, talkativenessFactor: 0, proactiveProbabilityFactor: 0, cooldownFactor: 0, lastEvaluatedDate: '', lastAnnouncedDate: '' } }),
    latestReply: vi.fn().mockResolvedValue({ ok: true, value: null }),
    getConfig: vi.fn().mockResolvedValue({ ok: true, value: { ok: true, reminderEnabled: true } }),
  } as unknown as CompanionRemoteFace;
}

describe('useCompanionEventStream', () => {
  it('updates from SSE and starts one fallback timer on error', async () => {
    Object.defineProperty(window, 'EventSource', { configurable: true, value: FakeEventSource });
    const remote = makeRemote();
    const streamRemote = { travelNoteCompanion: remote };
    const disposeInterval = vi.fn();
    const interval = vi.fn(() => disposeInterval);
    const streamTimer = { interval };
    const { result, unmount } = renderHook(() => useCompanionEventStream(streamRemote, streamTimer));
    const source = FakeEventSource.instances.at(-1);
    if (source === undefined) throw new Error('missing fake EventSource');

    act(() => source.emit('status', { status: 'thinking' }));
    expect(result.current.state.status).toBe('thinking');
    act(() => source.onerror?.());
    act(() => source.onerror?.());
    expect(interval).toHaveBeenCalledTimes(1);

    act(() => source.onopen?.());
    expect(disposeInterval).toHaveBeenCalledTimes(1);
    unmount();
    expect(source.close).toHaveBeenCalledTimes(1);
  });
});
