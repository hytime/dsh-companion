import type { CompanionRemoteFace } from './companion-types';
import { applyClientRuntime } from './runtime';

export const name = 'dsh-companion';
export const inject = ['remote'];
export function apply(ctx: Parameters<typeof applyClientRuntime>[0]): Promise<void | (() => void)> {
  return applyClientRuntime(ctx);
}

export type { CompanionRemoteFace };
