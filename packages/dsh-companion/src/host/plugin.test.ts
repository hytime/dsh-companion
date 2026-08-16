/**
 * plugin.ts 配置消费的注入式单测:
 * - 纯函数层:applySettingsToBuddy(名称/称呼配置优先 + showAffection 抑制)、
 *   selectPushChannels(reminderEnabled/showBubble 决定周期推送通道)
 * - CompanionRemote 集成层:假 ctx + 假 shell 走完整 buddy() 采集链,
 *   showBubble=false 时 latestReply 置空,setConfig 成功触发 onConfigApplied
 *   (注入假 store,绝不触碰真实 ~/.hy-companion/config.json)
 */
import { describe, expect, it, vi } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import { applySettingsToBuddy, CompanionRemote, scheduleInitialPushes, selectPushChannels } from './plugin';
import { DEFAULT_SETTINGS, type CompanionSettings } from './settings-store';
import type { SettingsRpcDeps } from './settings-rpc';

/** 线上 hyc 采集的完整 buddy 基础载荷(人格 + 好感度)。 */
const ONLINE_BASE = {
  companionName: '线上名',
  userCallName: '线上称呼',
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

/** 假 shell:按命令返回与真实 hyc 同构的 stdout JSON,记录调用。 */
function makeShell(): { resolve: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn> } {
  const okStdout = (payload: unknown) => ({
    exitCode: 0,
    stdout: { text: JSON.stringify(payload) },
    stderr: { text: '' },
  });
  const run = vi.fn(async (spec: { command: string }) => {
    switch (spec.command) {
      case 'hyc personality get':
        return okStdout({ companionName: '线上名', userCallName: '线上称呼' });
      case 'hyc affection':
        return okStdout({
          affectionScore: 42,
          intimacyScore: 30,
          trustScore: 20,
          engagementScore: 10,
          talkativenessFactor: 1.5,
          proactiveProbabilityFactor: 0.4,
          cooldownFactor: 0.2,
          lastEvaluatedDate: '2026-08-16',
          lastAnnouncedDate: '2026-08-15',
        });
      case 'hyc buddy list --page-size 1':
        return okStdout({
          items: [{ message: '记得喝水', title: '喝水提醒', dueAt: '2026-08-16T10:00:00+08:00' }],
        });
      default:
        return okStdout({});
    }
  });
  const resolve = vi.fn((request: { command: string }) => ({ command: request.command }));
  return { resolve, run };
}

/** 假 store/commands:setConfig 等 RPC 不触碰真实磁盘与终端。 */
function makeFakeDeps(): SettingsRpcDeps {
  return {
    store: {
      readSettings: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS }),
      writeSettings: vi.fn().mockResolvedValue({ ok: true }),
    },
    commands: {
      checkAuthStatus: vi.fn().mockResolvedValue('authenticated' as const),
      loginWithCredentials: vi.fn().mockResolvedValue({ ok: true }),
      registerWithCredentials: vi.fn().mockResolvedValue({ ok: true }),
      logout: vi.fn().mockResolvedValue({ ok: true }),
      listSchedules: vi.fn().mockResolvedValue({ ok: true, items: [] }),
      scheduleAction: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
}

/** 假 ctx:仅提供 Service 构造所需的 reflect.provide 与 buddy() 用的 shell 查询。 */
function makeCtx(shell?: { resolve: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn> }): Context {
  return {
    reflect: { provide: vi.fn() },
    get: (name: string): unknown => (name === 'shell' ? shell : undefined),
  } as unknown as Context;
}

function makeRemote(options: {
  shell?: { resolve: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn> };
  deps?: SettingsRpcDeps;
} = {}): CompanionRemote {
  return new CompanionRemote(makeCtx(options.shell), options.deps ?? makeFakeDeps());
}

describe('applySettingsToBuddy(名称/称呼/好感度开关消费)', () => {
  it('配置非空的 companionName/userCallName 优先于线上值', () => {
    const settings: CompanionSettings = { ...DEFAULT_SETTINGS, companionName: '小鲸', userCallName: '主人' };
    const result = applySettingsToBuddy(ONLINE_BASE, settings);
    expect(result.companionName).toBe('小鲸');
    expect(result.userCallName).toBe('主人');
  });

  it('配置为空字符串时回退线上值(配置优先但空值不覆盖)', () => {
    const settings: CompanionSettings = { ...DEFAULT_SETTINGS, companionName: '', userCallName: '' };
    const result = applySettingsToBuddy(ONLINE_BASE, settings);
    expect(result.companionName).toBe('线上名');
    expect(result.userCallName).toBe('线上称呼');
  });

  it('showAffection=false 时 9 个好感度字段全部置空,名称不受影响', () => {
    // 名称留空以便隔离断言:只有好感度抑制生效,名称仍回退线上值
    const settings: CompanionSettings = { ...DEFAULT_SETTINGS, companionName: '', userCallName: '', showAffection: false };
    const result = applySettingsToBuddy(ONLINE_BASE, settings);
    expect(result.affectionScore).toBe(0);
    expect(result.intimacyScore).toBe(0);
    expect(result.trustScore).toBe(0);
    expect(result.engagementScore).toBe(0);
    expect(result.talkativenessFactor).toBe(0);
    expect(result.proactiveProbabilityFactor).toBe(0);
    expect(result.cooldownFactor).toBe(0);
    expect(result.lastEvaluatedDate).toBe('');
    expect(result.lastAnnouncedDate).toBe('');
    expect(result.companionName).toBe('线上名');
  });

  it('showAffection=true 时好感度字段原样保留(名称留空时全载荷等价线上采集)', () => {
    const settings: CompanionSettings = { ...DEFAULT_SETTINGS, companionName: '', userCallName: '', showAffection: true };
    expect(applySettingsToBuddy(ONLINE_BASE, settings)).toEqual(ONLINE_BASE);
  });
});

describe('selectPushChannels(周期推送通道开关)', () => {
  it('reminderEnabled=false → 跳过 buddy 轮询;showBubble=false → 跳过回复轮询', () => {
    expect(selectPushChannels({ ...DEFAULT_SETTINGS, reminderEnabled: false })).toEqual({
      buddy: false,
      reply: true,
    });
    expect(selectPushChannels({ ...DEFAULT_SETTINGS, showBubble: false })).toEqual({
      buddy: true,
      reply: false,
    });
  });

  it('缺省配置两个通道都开启', () => {
    expect(selectPushChannels({ ...DEFAULT_SETTINGS })).toEqual({ buddy: true, reply: true });
  });
});

describe('scheduleInitialPushes(SSE 连接建立时的初次推送)', () => {
  it('reminderEnabled=false:跳过 buddy 初次推送,回复推送照常(页面加载不弹提醒 toast)', () => {
    const pushBuddy = vi.fn();
    const pushReply = vi.fn();
    scheduleInitialPushes({ ...DEFAULT_SETTINGS, reminderEnabled: false }, pushBuddy, pushReply);
    expect(pushBuddy).not.toHaveBeenCalled();
    expect(pushReply).toHaveBeenCalledTimes(1);
  });

  it('缺省配置:buddy 与回复都推送(SSE 快照完整)', () => {
    const pushBuddy = vi.fn();
    const pushReply = vi.fn();
    scheduleInitialPushes({ ...DEFAULT_SETTINGS }, pushBuddy, pushReply);
    expect(pushBuddy).toHaveBeenCalledTimes(1);
    expect(pushReply).toHaveBeenCalledTimes(1);
  });

  it('守卫只作用于初次推送调度:reminderEnabled=false 时 setConfig 成功后的主动推送不被抑制', async () => {
    // 复现 apply 的接线:onConfigApplied → pushBuddy 直接调用(不经 scheduleInitialPushes)
    const deps = makeFakeDeps();
    const remote = makeRemote({ deps });
    remote.applySettings({ ...DEFAULT_SETTINGS, reminderEnabled: false });
    const pushBuddy = vi.fn();
    const pushReply = vi.fn();
    remote.setOnConfigApplied(() => {
      // 与 apply 中 onConfigApplied 回调等价:重读配置后无条件 pushBuddy(规格要求即时生效)
      void pushBuddy();
    });
    // 初次推送被守卫跳过
    scheduleInitialPushes(remote.getSettings(), () => void pushBuddy(), pushReply);
    expect(pushBuddy).not.toHaveBeenCalled();
    // 但 setConfig 成功仍触发主动推送
    await remote.setConfig({ companionName: '小鲸' });
    expect(pushBuddy).toHaveBeenCalledTimes(1);
  });
});

describe('CompanionRemote 配置消费集成', () => {
  it('buddy():配置名覆盖线上名,消息/标题/dueAt 照常透传', async () => {
    const remote = makeRemote({ shell: makeShell() });
    remote.applySettings({ ...DEFAULT_SETTINGS, companionName: '小鲸', userCallName: '主人' });
    const result = await remote.buddy();
    expect(result.companionName).toBe('小鲸');
    expect(result.userCallName).toBe('主人');
    expect(result.message).toBe('记得喝水');
    expect(result.title).toBe('喝水提醒');
    expect(result.dueAt).toBe('2026-08-16T10:00:00+08:00');
    expect(result.affectionScore).toBe(42);
  });

  it('buddy():showAffection=false 时好感度全 0(线上值被抑制)', async () => {
    const remote = makeRemote({ shell: makeShell() });
    remote.applySettings({ ...DEFAULT_SETTINGS, showAffection: false });
    const result = await remote.buddy();
    expect(result.affectionScore).toBe(0);
    expect(result.intimacyScore).toBe(0);
    expect(result.trustScore).toBe(0);
    expect(result.engagementScore).toBe(0);
    expect(result.talkativenessFactor).toBe(0);
    expect(result.proactiveProbabilityFactor).toBe(0);
    expect(result.cooldownFactor).toBe(0);
    expect(result.lastEvaluatedDate).toBe('');
    expect(result.lastAnnouncedDate).toBe('');
  });

  it('latestReply():showBubble=false → 返回 null(回复气泡置空)', async () => {
    const remote = makeRemote();
    remote.applySettings({ ...DEFAULT_SETTINGS, showBubble: false });
    await expect(remote.latestReply()).resolves.toBeNull();
  });

  it('setConfig:写入成功 → 触发 onConfigApplied(host 据此重读配置并推送新状态)', async () => {
    const deps = makeFakeDeps();
    const remote = makeRemote({ deps });
    const onConfigApplied = vi.fn();
    remote.setOnConfigApplied(onConfigApplied);
    const result = await remote.setConfig({ companionName: '小鲸' });
    expect(result).toEqual({ ok: true });
    expect(deps.store.writeSettings).toHaveBeenCalledWith({ companionName: '小鲸' });
    expect(onConfigApplied).toHaveBeenCalledTimes(1);
  });

  it('setConfig:写入失败 → 不触发 onConfigApplied', async () => {
    const deps = makeFakeDeps();
    deps.store.writeSettings = vi.fn().mockResolvedValue({ ok: false, error: 'EACCES: permission denied' });
    const remote = makeRemote({ deps });
    const onConfigApplied = vi.fn();
    remote.setOnConfigApplied(onConfigApplied);
    await remote.setConfig({ companionName: '小鲸' });
    expect(onConfigApplied).not.toHaveBeenCalled();
  });
});
