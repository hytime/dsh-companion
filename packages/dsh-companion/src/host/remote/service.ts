import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { Context } from '@deepseek-ai/cordis';
import { FRAME_NAMES, type FrameName } from '../../contracts/companion-status';
import { REMOTE_PACKAGE, REMOTE_SERVICE } from '../../contracts/remote-descriptors';
import { normalizeStatusUpdate, type StatusUpdate } from '../../utils/status-utils';
import {
  DEFAULT_SETTINGS,
  type CompanionSettings,
  type WriteResult,
} from '../settings-store';
import {
  type AuthStatusResult,
  type GetConfigResult,
  type SettingsRpcDeps,
  type SettingsRpcHandlers,
  createSettingsHandlers,
} from '../settings-rpc';
import {
  type CommandResult,
  type ScheduleListResult,
} from '../companion-commands';
import { createDefaultRpcDeps } from './handlers';

export interface TravelNoteCompanionHostOptions {
  assetRoot?: string;
}

export interface BuddyBase {
  companionName: string;
  userCallName: string;
  affectionScore: number;
  intimacyScore: number;
  trustScore: number;
  engagementScore: number;
  talkativenessFactor: number;
  proactiveProbabilityFactor: number;
  cooldownFactor: number;
  lastEvaluatedDate: string;
  lastAnnouncedDate: string;
}

export interface BuddyResult extends BuddyBase {
  message: string;
  title: string;
  dueAt: string;
}

export function applySettingsToBuddy(base: BuddyBase, settings: CompanionSettings): BuddyBase {
  const showAffection = settings.showAffection;
  return {
    companionName: settings.companionName !== '' ? settings.companionName : base.companionName,
    userCallName: settings.userCallName !== '' ? settings.userCallName : base.userCallName,
    affectionScore: showAffection ? base.affectionScore : 0,
    intimacyScore: showAffection ? base.intimacyScore : 0,
    trustScore: showAffection ? base.trustScore : 0,
    engagementScore: showAffection ? base.engagementScore : 0,
    talkativenessFactor: showAffection ? base.talkativenessFactor : 0,
    proactiveProbabilityFactor: showAffection ? base.proactiveProbabilityFactor : 0,
    cooldownFactor: showAffection ? base.cooldownFactor : 0,
    lastEvaluatedDate: showAffection ? base.lastEvaluatedDate : '',
    lastAnnouncedDate: showAffection ? base.lastAnnouncedDate : '',
  };
}

export class CompanionRemote extends TypertRemoteService {
  private currentStatus: StatusUpdate = { status: 'idle' };
  private settings: CompanionSettings = { ...DEFAULT_SETTINGS };
  private onConfigApplied?: () => void;
  private readonly settingsHandlers: SettingsRpcHandlers;

  constructor(ctx: Context, deps?: SettingsRpcDeps) {
    super(ctx, REMOTE_SERVICE);
    this.settingsHandlers = createSettingsHandlers(deps ?? createDefaultRpcDeps(ctx));
  }

  applySettings(settings: CompanionSettings): void {
    this.settings = settings;
  }

  getSettings(): CompanionSettings {
    return this.settings;
  }

  setOnConfigApplied(callback: () => void): void {
    this.onConfigApplied = callback;
  }

  setStatus(update: StatusUpdate): void {
    this.currentStatus = { ...normalizeStatusUpdate(update) };
  }

  getStatus(): StatusUpdate {
    return { ...this.currentStatus };
  }

  @Remote
  async status(): Promise<StatusUpdate> {
    return this.getStatus();
  }

  @Remote
  async buddy(): Promise<BuddyResult> {
    const shell = this.ctx.get('shell') as unknown as ShellService | undefined;
    const emptyBase: BuddyBase = {
      companionName: '',
      userCallName: '',
      affectionScore: 0,
      intimacyScore: 0,
      trustScore: 0,
      engagementScore: 0,
      talkativenessFactor: 0,
      proactiveProbabilityFactor: 0,
      cooldownFactor: 0,
      lastEvaluatedDate: '',
      lastAnnouncedDate: '',
    };
    if (shell === undefined) {
      return { message: '', title: '', dueAt: '', ...applySettingsToBuddy(emptyBase, this.settings) };
    }
    let companionName = '';
    let userCallName = '';
    let affectionScore = 0;
    let intimacyScore = 0;
    let trustScore = 0;
    let engagementScore = 0;
    let talkativenessFactor = 0;
    let proactiveProbabilityFactor = 0;
    let cooldownFactor = 0;
    let lastEvaluatedDate = '';
    let lastAnnouncedDate = '';
    try {
      const pResult = await shell.run(shell.resolve({
        command: 'hyc personality get',
        timeoutMs: 10_000,
        stdoutMaxBytes: 256 * 1024,
      }));
      if (pResult.exitCode === 0) {
        const p = JSON.parse(pResult.stdout.text) as Record<string, unknown>;
        if (typeof p.companionName === 'string') companionName = p.companionName;
        if (typeof p.userCallName === 'string') userCallName = p.userCallName;
      }
    } catch {
      // Missing personality data falls back to configured/default values.
    }
    try {
      const aResult = await shell.run(shell.resolve({
        command: 'hyc affection',
        timeoutMs: 10_000,
        stdoutMaxBytes: 256 * 1024,
      }));
      if (aResult.exitCode === 0) {
        const a = JSON.parse(aResult.stdout.text) as Record<string, unknown>;
        if (typeof a.affectionScore === 'number') affectionScore = a.affectionScore;
        if (typeof a.intimacyScore === 'number') intimacyScore = a.intimacyScore;
        if (typeof a.trustScore === 'number') trustScore = a.trustScore;
        if (typeof a.engagementScore === 'number') engagementScore = a.engagementScore;
        if (typeof a.talkativenessFactor === 'number') talkativenessFactor = a.talkativenessFactor;
        if (typeof a.proactiveProbabilityFactor === 'number') proactiveProbabilityFactor = a.proactiveProbabilityFactor;
        if (typeof a.cooldownFactor === 'number') cooldownFactor = a.cooldownFactor;
        if (typeof a.lastEvaluatedDate === 'string') lastEvaluatedDate = a.lastEvaluatedDate;
        if (typeof a.lastAnnouncedDate === 'string') lastAnnouncedDate = a.lastAnnouncedDate;
      }
    } catch {
      // Missing affection data falls back to zero values.
    }
    const base = applySettingsToBuddy({
      companionName,
      userCallName,
      affectionScore,
      intimacyScore,
      trustScore,
      engagementScore,
      talkativenessFactor,
      proactiveProbabilityFactor,
      cooldownFactor,
      lastEvaluatedDate,
      lastAnnouncedDate,
    }, this.settings);
    try {
      const result = await shell.run(shell.resolve({
        command: 'hyc buddy list --page-size 1',
        timeoutMs: 15_000,
        stdoutMaxBytes: 512 * 1024,
      }));
      if (result.exitCode !== 0) return { message: '', title: '', dueAt: '', ...base };
      const parsed = JSON.parse(result.stdout.text) as Record<string, unknown>;
      if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
        return { message: '', title: '', dueAt: '', ...base };
      }
      const item = parsed.items[0] as Record<string, unknown>;
      return {
        message: typeof item.message === 'string' ? item.message : '',
        title: typeof item.title === 'string' ? item.title : '',
        dueAt: typeof item.dueAt === 'string' ? item.dueAt : '',
        ...base,
      };
    } catch {
      return { message: '', title: '', dueAt: '', ...base };
    }
  }

  @Remote
  async latestReply(): Promise<{ reply: string; emotion: string } | null> {
    if (!this.settings.showBubble) return null;
    try {
      const raw = await readFile(join(homedir(), '.hy-companion', 'state', 'last-reply.json'), 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.reply !== 'string' || parsed.reply === '') return null;
      return { reply: parsed.reply, emotion: typeof parsed.emotion === 'string' ? parsed.emotion : 'idle' };
    } catch {
      return null;
    }
  }

  @Remote
  async asset(frame: string): Promise<{ url: string } | null> {
    const name = FRAME_NAMES.includes(frame as FrameName) ? frame : 'idle';
    return { url: `/plugins/${REMOTE_PACKAGE}/deepseek-girl-phaser/frames/${name}.png` };
  }

  @Remote async authStatus(): Promise<AuthStatusResult> { return this.settingsHandlers.authStatus(); }
  @Remote async login(username: string, password: string): Promise<CommandResult> {
    return this.settingsHandlers.login({ username, password });
  }
  @Remote async register(username: string, password: string): Promise<CommandResult> {
    return this.settingsHandlers.register({ username, password });
  }
  @Remote async logout(): Promise<CommandResult> { return this.settingsHandlers.logout(); }
  @Remote async getConfig(): Promise<GetConfigResult> { return this.settingsHandlers.getConfig(); }
  @Remote async setConfig(partial: Partial<CompanionSettings>): Promise<WriteResult> {
    const result = await this.settingsHandlers.setConfig(partial);
    if (result.ok) this.onConfigApplied?.();
    return result;
  }
  @Remote async listSchedules(page?: number, pageSize?: number): Promise<ScheduleListResult> {
    return this.settingsHandlers.listSchedules({ page, pageSize });
  }
  @Remote async createSchedule(text: string): Promise<CommandResult> {
    return this.settingsHandlers.createSchedule({ text });
  }
  @Remote async enableSchedule(id: string): Promise<CommandResult> {
    return this.settingsHandlers.enableSchedule({ id });
  }
  @Remote async disableSchedule(id: string): Promise<CommandResult> {
    return this.settingsHandlers.disableSchedule({ id });
  }
  @Remote async deleteSchedule(id: string): Promise<CommandResult> {
    return this.settingsHandlers.deleteSchedule({ id });
  }
}

interface ShellService {
  resolve(request: { command: string; timeoutMs?: number; stdoutMaxBytes?: number }): unknown;
  run(spec: unknown): Promise<{ exitCode: number | null; stdout: { text: string }; stderr: { text: string } }>;
}

const REMOTE_METHOD_NAMES = [
  'status', 'buddy', 'latestReply', 'asset', 'authStatus', 'login', 'register', 'logout',
  'getConfig', 'setConfig', 'listSchedules', 'createSchedule', 'enableSchedule', 'disableSchedule', 'deleteSchedule',
] as const;
const SRC_PROTOCOL_SPECIFIER = '@deepseek-ai/dsh-typert-protocol/src/index.ts';
let alternateMarkersRegistered = false;

/** Mirror @Remote markers when development loads two protocol module instances. */
export async function registerAlternateProtocolMarkers(
  alternate?: { Remote: typeof Remote },
): Promise<void> {
  if (alternate === undefined) {
    if (alternateMarkersRegistered) return;
    alternateMarkersRegistered = true;
  }
  let srcProtocol: { Remote: typeof Remote } | undefined = alternate;
  if (srcProtocol === undefined) {
    const imported: unknown = await import(SRC_PROTOCOL_SPECIFIER).catch(() => undefined);
    srcProtocol = imported as { Remote: typeof Remote } | undefined;
  }
  if (srcProtocol === undefined) return;
  const initializers: Array<() => void> = [];
  for (const methodName of REMOTE_METHOD_NAMES) {
    const method = Reflect.get(CompanionRemote.prototype, methodName) as ((...args: never[]) => unknown) | undefined;
    if (typeof method !== 'function') continue;
    srcProtocol.Remote(method, {
      kind: 'method', name: methodName, static: false, private: false,
      addInitializer: (initializer: () => void) => initializers.push(initializer),
    } as unknown as ClassMethodDecoratorContext);
  }
  const probe = Object.create(CompanionRemote.prototype);
  for (const initializer of initializers) initializer.call(probe);
}
