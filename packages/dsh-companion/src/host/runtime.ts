import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { REMOTE_SERVICE } from '../contracts/remote-descriptors';
import type { StatusUpdate } from '../utils/status-utils';
import { createStatusStateMachine } from './status/state-machine';
import { createStatusNarrator, type NarratorLlm } from './status/narrator';
import { registerStatusEventBridge } from './status/event-bridge';
import { readSettings } from './settings-store';
import { runSelfHeal } from './prerequisites/self-heal';
import { CompanionRemote, registerAlternateProtocolMarkers, type BuddyBase, type BuddyResult, type TravelNoteCompanionHostOptions } from './remote/service';
import { createBuddyTimer, selectPushChannels, type BuddyTimerDeps } from './schedules/timer';
import { createSsePublisher } from './transport/sse-publisher';
import { registerCompanionRoutes } from './transport/routes';

export type { StatusUpdate, BuddyBase, BuddyResult, TravelNoteCompanionHostOptions, BuddyTimerDeps };
export {
  CompanionRemote,
  registerAlternateProtocolMarkers,
};
export {
  applySettingsToBuddy,
} from './remote/service';
export {
  createCredentialPtyRunner,
} from './remote/credentials';
export {
  createBuddyTimer,
  scheduleInitialPushes,
  selectPushChannels,
  buddyPollIntervalMs,
} from './schedules/timer';

export const name = 'dsh-companion';
export const inject = ['subprocess'];

export async function applyHostRuntime(ctx: Context, options: TravelNoteCompanionHostOptions = {}): Promise<void> {
  void runSelfHeal({});
  await registerAlternateProtocolMarkers();
  await ctx.plugin(CompanionRemote);
  const remote = ctx.get(REMOTE_SERVICE) as CompanionRemote;
  ctx.emit('internal/service', REMOTE_SERVICE, remote);

  const publisher = createSsePublisher();
  const llm = ctx.get('llm') as NarratorLlm | undefined;
  const narrator = llm === undefined ? undefined : createStatusNarrator(llm);
  const machine = createStatusStateMachine({
    narrate: narrator,
    onChange: (snapshot) => {
      const update: StatusUpdate = {
        status: snapshot.status,
        ...snapshot.statusMessage === undefined ? {} : { statusMessage: snapshot.statusMessage },
        ...snapshot.emotion === undefined ? {} : { emotion: snapshot.emotion },
        ...snapshot.lastError === undefined ? {} : { lastError: snapshot.lastError },
      };
      remote.setStatus(update);
      publisher.broadcast('status', update);
    },
  });
  const statusBridge = registerStatusEventBridge(ctx, machine);
  remote.setAgentSelectionHandler(statusBridge.selectAgent);
  const pushBuddy = async (): Promise<void> => {
    try { publisher.broadcast('buddy', await remote.buddy()); } catch { /* retry next cycle */ }
  };
  let lastReplyRaw = '';
  const pushReply = async (): Promise<void> => {
    if (!remote.getSettings().showBubble) return;
    try {
      const raw = await readFile(join(homedir(), '.hy-companion', 'state', 'last-reply.json'), 'utf8');
      if (raw === lastReplyRaw) return;
      lastReplyRaw = raw;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.reply === 'string' && parsed.reply !== '') {
        publisher.broadcast('reply', {
          reply: parsed.reply,
          emotion: typeof parsed.emotion === 'string' ? parsed.emotion : 'idle',
        });
      }
    } catch { /* missing reply file is normal */ }
  };

  const buddyTimer = createBuddyTimer({
    getSettings: () => remote.getSettings(),
    tick: () => void pushBuddy(),
  });
  void readSettings({}).then((settings) => {
    remote.applySettings(settings);
    buddyTimer.restart();
  });
  remote.setOnConfigApplied(() => {
    void readSettings({}).then((settings) => {
      remote.applySettings(settings);
      buddyTimer.restart();
      void pushBuddy();
    });
  });

  ctx.effect(() => {
    buddyTimer.start();
    const replyTimer = setInterval(() => {
      if (selectPushChannels(remote.getSettings()).reply) void pushReply();
    }, 5_000);
    return () => {
      buddyTimer.dispose();
      clearInterval(replyTimer);
    };
  });
  ctx.effect(() => registerCompanionRoutes({
    ctx,
    remote,
    options,
    publisher,
    pushBuddy: () => void pushBuddy(),
    pushReply: () => void pushReply(),
  }));
  console.log('[dsh-companion] host plugin loaded');
}
