import type { CompanionSettings } from '../settings-store';

export function selectPushChannels(settings: CompanionSettings): { buddy: boolean; reply: boolean } {
  return { buddy: settings.reminderEnabled, reply: settings.showBubble };
}

export function buddyPollIntervalMs(settings: CompanionSettings): number {
  const interval = settings.reminderIntervalMin * 60_000;
  return Number.isFinite(interval) && interval >= 30_000 ? interval : 30_000;
}

export interface BuddyTimerDeps {
  getSettings(): CompanionSettings;
  tick(): void;
}

export function createBuddyTimer(deps: BuddyTimerDeps): {
  start(): void;
  restart(): void;
  dispose(): void;
} {
  let timer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;
  const start = (): void => {
    if (disposed) return;
    if (timer !== undefined) clearInterval(timer);
    timer = setInterval(() => {
      if (selectPushChannels(deps.getSettings()).buddy) deps.tick();
    }, buddyPollIntervalMs(deps.getSettings()));
  };
  return {
    start,
    restart: start,
    dispose: (): void => {
      disposed = true;
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    },
  };
}

export function scheduleInitialPushes(
  settings: CompanionSettings,
  pushBuddy: () => void,
  pushReply: () => void,
): void {
  if (selectPushChannels(settings).buddy) pushBuddy();
  pushReply();
}
