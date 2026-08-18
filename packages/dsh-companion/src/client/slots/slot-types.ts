import type { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';
import type { CompanionEventStreamRemote, CompanionEventStreamTimer } from '../stream/event-stream';

export interface SlotsService {
  inject(key: string, callback: () => void | (() => void) | Iterable<() => void>): () => void;
  register: SlotCore['register'];
}

export type ClientRemote = CompanionEventStreamRemote;
export type ClientTimer = CompanionEventStreamTimer;
