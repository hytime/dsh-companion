import type { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';
import type { CompanionEventStreamRemote, CompanionEventStreamTimer } from '../stream/event-stream';

export interface SlotsService {
  inject(key: string, callback: () => void | (() => void) | Iterable<() => void>): () => void;
  register: SlotCore['register'];
}

export interface SessionListSnapshot {
  current: string | undefined;
}

export type UseSessions = <T>(selector: (snapshot: SessionListSnapshot) => T) => T;
export interface OverlaySlotProps { useSessions: UseSessions }

export type ClientRemote = CompanionEventStreamRemote;
export type ClientTimer = CompanionEventStreamTimer;
