import * as React from 'react';
import { EVENTS_URL } from '../../contracts/remote-descriptors';
import { normalizeSkillStatusUpdate, type SkillStatusUpdate } from '../../state/skill-status-source';
import { fetchBuddyIfRemindersEnabled } from './buddy-gate';
import type { BuddyResult, CompanionRemoteFace } from '../companion-types';

export interface CompanionEventStreamRemote {
  travelNoteCompanion: CompanionRemoteFace;
}

export interface CompanionEventStreamTimer {
  interval(callback: () => void, milliseconds: number): () => void;
}

export interface EventStreamState extends SkillStatusUpdate {}

export interface CompanionEventStreamResult {
  state: EventStreamState;
  buddy: BuddyResult | null;
  latestReply: string | undefined;
}

export function useCompanionEventStream(
  remote: CompanionEventStreamRemote | undefined,
  timer: CompanionEventStreamTimer | undefined,
): CompanionEventStreamResult {
  const [state, setState] = React.useState<EventStreamState>({ status: 'idle' });
  const [buddy, setBuddy] = React.useState<BuddyResult | null>(null);
  const [latestReply, setLatestReply] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (remote === undefined) return;
    let active = true;
    let eventSource: EventSource | null = null;
    let disposeFallback: (() => void) | undefined;
    const applyBuddy = (value: BuddyResult): void => {
      if (active) setBuddy(value);
    };
    const applyReply = (value: { reply: string } | null): void => {
      if (active) setLatestReply(value?.reply);
    };
    const applyStatus = (value: unknown): void => {
      if (active) setState(normalizeSkillStatusUpdate(value));
    };
    const stopFallback = (): void => {
      disposeFallback?.();
      disposeFallback = undefined;
    };
    const tick = (): void => {
      void remote.travelNoteCompanion.status().then((result) => {
        if (result.ok) applyStatus(result.value);
      }).catch(() => {});
      void fetchBuddyIfRemindersEnabled(remote.travelNoteCompanion, applyBuddy);
      void remote.travelNoteCompanion.latestReply().then((result) => {
        if (result.ok) applyReply(result.value);
      }).catch(() => {});
    };
    const startFallback = (): void => {
      if (!active || disposeFallback !== undefined) return;
      tick();
      disposeFallback = timer?.interval(tick, 30_000);
    };

    if (typeof window !== 'undefined' && typeof window.EventSource === 'function') {
      eventSource = new EventSource(EVENTS_URL);
      eventSource.onopen = stopFallback;
      eventSource.addEventListener('status', (event) => {
        try { applyStatus(JSON.parse((event as MessageEvent<string>).data)); } catch { /* ignore malformed frame */ }
      });
      eventSource.addEventListener('buddy', (event) => {
        try { applyBuddy(JSON.parse((event as MessageEvent<string>).data) as BuddyResult); } catch { /* ignore malformed frame */ }
      });
      eventSource.addEventListener('reply', (event) => {
        try { applyReply(JSON.parse((event as MessageEvent<string>).data) as { reply: string }); } catch { /* ignore malformed frame */ }
      });
      eventSource.onerror = startFallback;
    } else {
      startFallback();
    }
    return () => {
      active = false;
      stopFallback();
      eventSource?.close();
    };
  }, [remote, timer]);

  return { state, buddy, latestReply };
}
