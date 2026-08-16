/**
 * buddy-gate 单测:断连轮询的 buddy 通道按配置过滤。
 * 注入假 remote(最小面 getConfig/buddy),断言 reminderEnabled=false 时
 * 不采集也不回调;配置读取失败 fail-open 照常推送;buddy 失败不抛。
 */
import { describe, expect, it, vi } from 'vitest';
import { fetchBuddyIfRemindersEnabled, type BuddyGateRemote } from './buddy-gate';
import type { BuddyResult, CompanionSettings } from './companion-types';

const DEFAULT_SETTINGS: CompanionSettings = {
  companionName: '旅伴',
  userCallName: '造物主',
  showAffection: true,
  showBubble: true,
  reminderEnabled: true,
  reminderIntervalMin: 60,
};

const BUDDY: BuddyResult = {
  message: '记得喝水',
  title: '喝水提醒',
  dueAt: '2026-08-16T10:00:00+08:00',
  companionName: '小鲸',
  userCallName: '主人',
  affectionScore: 42,
  intimacyScore: 30,
  trustScore: 20,
  engagementScore: 10,
  talkativenessFactor: 1.5,
  proactiveProbabilityFactor: 0.4,
  cooldownFactor: 0.2,
  lastEvaluatedDate: '2026-08-16',
  lastAnnouncedDate: '2026-08-15',
};

/** 假 remote:只提供 getConfig/buddy 两个方法,可覆写。 */
function makeRemote(overrides: Partial<BuddyGateRemote> = {}): BuddyGateRemote {
  return {
    getConfig: vi.fn<BuddyGateRemote['getConfig']>(async () => ({
      ok: true as const,
      value: { ok: true as const, ...DEFAULT_SETTINGS },
    })),
    buddy: vi.fn<BuddyGateRemote['buddy']>(async () => ({ ok: true as const, value: BUDDY })),
    ...overrides,
  };
}

describe('fetchBuddyIfRemindersEnabled(断连轮询 buddy 通道守卫)', () => {
  it('reminderEnabled=true:采集 buddy 并回调 onBuddy(setBuddy)', async () => {
    const remote = makeRemote();
    const onBuddy = vi.fn();
    await fetchBuddyIfRemindersEnabled(remote, onBuddy);
    expect(remote.buddy).toHaveBeenCalledTimes(1);
    expect(onBuddy).toHaveBeenCalledWith(BUDDY);
  });

  it('reminderEnabled=false:不采集 buddy 也不 setBuddy', async () => {
    const remote = makeRemote({
      getConfig: vi.fn<BuddyGateRemote['getConfig']>(async () => ({
        ok: true as const,
        value: { ok: true as const, ...DEFAULT_SETTINGS, reminderEnabled: false },
      })),
    });
    const onBuddy = vi.fn();
    await fetchBuddyIfRemindersEnabled(remote, onBuddy);
    expect(remote.buddy).not.toHaveBeenCalled();
    expect(onBuddy).not.toHaveBeenCalled();
  });

  it('配置读取失败(传输层/业务层):fail-open,照常采集并推送', async () => {
    const transportError = makeRemote({
      getConfig: vi.fn<BuddyGateRemote['getConfig']>(async () => ({
        ok: false as const,
        error: { code: 'offline', message: '网络中断' },
      })),
    });
    const businessError = makeRemote({
      getConfig: vi.fn<BuddyGateRemote['getConfig']>(async () => ({
        ok: true as const,
        value: { ok: false as const, error: 'EACCES: permission denied' },
      })),
    });
    const onBuddy = vi.fn();
    await fetchBuddyIfRemindersEnabled(transportError, onBuddy);
    await fetchBuddyIfRemindersEnabled(businessError, onBuddy);
    expect(transportError.buddy).toHaveBeenCalledTimes(1);
    expect(businessError.buddy).toHaveBeenCalledTimes(1);
    expect(onBuddy).toHaveBeenCalledTimes(2);
  });

  it('buddy RPC 失败:不回调、不抛出(下个 tick 重试)', async () => {
    const remote = makeRemote({
      buddy: vi.fn<BuddyGateRemote['buddy']>(async () => ({
        ok: false as const,
        error: { code: 'offline', message: '网络中断' },
      })),
    });
    const onBuddy = vi.fn();
    await expect(fetchBuddyIfRemindersEnabled(remote, onBuddy)).resolves.toBeUndefined();
    expect(onBuddy).not.toHaveBeenCalled();
  });
});
