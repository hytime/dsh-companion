import type { Context } from '@deepseek-ai/cordis';
import { applyHostRuntime } from './runtime';
import type { TravelNoteCompanionHostOptions } from './remote/service';

/** Host DSH plugin entry; lifecycle and business modules live in ./runtime. */
export const name = 'dsh-companion';
export const inject = ['subprocess'];
export function apply(ctx: Context, options?: TravelNoteCompanionHostOptions): Promise<void> {
  return applyHostRuntime(ctx, options);
}

export * from './runtime';
