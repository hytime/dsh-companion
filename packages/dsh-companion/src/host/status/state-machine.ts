import type { CompanionEmotion } from '../../contracts/companion-status';
import type { StatusUpdate } from '../../utils/status-utils';
import { fallbackTextForPhase } from './fallback-text';

export type StatusPhase = 'thinking' | 'executing' | 'approval' | 'replying' | 'success' | 'error' | 'cancelled';

export interface StatusNarration {
  message: string;
  emotion: CompanionEmotion;
}

export interface StatusMachineSnapshot extends StatusUpdate {
  phase: StatusPhase | 'idle';
  generation: number;
}

export interface StatusNarrationRequest {
  phase: StatusPhase;
  generation: number;
  signal: AbortSignal;
  provider?: string;
  model?: string;
  context?: string;
}

export interface StatusStateMachineOptions {
  onChange(snapshot: StatusMachineSnapshot): void;
  narrate?(request: StatusNarrationRequest): Promise<StatusNarration | null>;
}

export function createStatusStateMachine(options: StatusStateMachineOptions) {
  let snapshot: StatusMachineSnapshot = { phase: 'idle', status: 'idle', generation: 0 };
  let controller: AbortController | undefined;
  let phaseBeforeApproval: StatusPhase | 'idle' = 'thinking';

  const publishNarration = (generation: number, narration: StatusNarration): boolean => {
    if (snapshot.generation !== generation) return false;
    snapshot = { ...snapshot, statusMessage: narration.message, emotion: narration.emotion };
    options.onChange(snapshot);
    return true;
  };

  const enter = (phase: StatusPhase, narrationContext: Omit<StatusNarrationRequest, 'phase' | 'generation' | 'signal'> = {}): StatusMachineSnapshot => {
    if (snapshot.phase === phase) return snapshot;
    if (phase === 'approval' && snapshot.phase !== 'approval') phaseBeforeApproval = snapshot.phase;
    controller?.abort();
    controller = new AbortController();
    const generation = snapshot.generation + 1;
    snapshot = { phase, generation, ...fallbackTextForPhase(phase) };
    options.onChange(snapshot);
    if (options.narrate !== undefined) {
      void options.narrate({ phase, generation, signal: controller.signal, ...narrationContext })
        .then((narration) => {
          if (narration !== null && narration.message !== '') publishNarration(generation, narration);
        })
        .catch(() => {});
    }
    return snapshot;
  };

  return {
    get: (): StatusMachineSnapshot => snapshot,
    enter,
    reset: (): StatusMachineSnapshot => {
      controller?.abort();
      controller = new AbortController();
      snapshot = { phase: 'idle', status: 'idle', generation: snapshot.generation + 1 };
      options.onChange(snapshot);
      return snapshot;
    },
    publishNarration,
    restoreAfterApproval: (): StatusMachineSnapshot => {
      const restored = phaseBeforeApproval === 'idle' || phaseBeforeApproval === 'approval'
        ? 'thinking'
        : phaseBeforeApproval;
      return enter(restored);
    },
  };
}
