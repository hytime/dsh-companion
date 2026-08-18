import { EVENTS_URL } from '../contracts/remote-descriptors';
import type { CompanionRemoteFace } from './companion-types';
import { travelNoteCompanionRemote } from './remote-contract';
import { registerOverlaySlot, injectCompanionReplyCommand } from './slots/overlay';
import { registerSettingsSection } from './slots/settings-section';
import type { SlotsService } from './slots/slot-types';
import '../styles/companion.module.css';

interface PluginCtx {
  remote: RemoteFace;
  get<T>(name: string): T | undefined;
  plugin(plugin: unknown): PromiseLike<void> & { dispose(): Promise<void> };
}

interface RemoteFace {
  $mount(contribution: typeof travelNoteCompanionRemote): Promise<() => Promise<void>>;
  travelNoteCompanion: CompanionRemoteFace;
}

interface TimerService {
  interval(callback: () => void, milliseconds: number): () => void;
}

/** Client-side lifecycle assembly. UI and event-stream details live in slot modules. */
export async function applyClientRuntime(ctx: PluginCtx): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(travelNoteCompanionRemote);
  const widgetFiber = ctx.plugin({
    inject: ['slots', 'remote', 'remote.travelNoteCompanion'],
    apply(widgetCtx: PluginCtx) {
      const slots = widgetCtx.get<SlotsService>('slots');
      if (slots === undefined) return;
      const timer = widgetCtx.get<TimerService>('timer');
      const remote = widgetCtx.remote;
      const disposeOverlay = registerOverlaySlot(slots, remote, timer, injectCompanionReplyCommand);
      const disposeSettings = registerSettingsSection(slots, remote);
      return () => {
        disposeSettings();
        disposeOverlay();
      };
    },
  });
  await widgetFiber;
  return async () => {
    await widgetFiber.dispose();
    await disposeRemote();
  };
}

export { EVENTS_URL };
export type { PluginCtx, RemoteFace, TimerService };
