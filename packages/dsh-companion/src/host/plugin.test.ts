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
import {
  apply,
  applySettingsToBuddy,
  buddyPollIntervalMs,
  CompanionRemote,
  createBuddyTimer,
  createCredentialPtyRunner,
  registerAlternateProtocolMarkers,
  scheduleInitialPushes,
  selectPushChannels,
} from './plugin';
import { REMOTE_SERVICE } from '../contracts/remote-descriptors';
import { DEFAULT_SETTINGS, readSettings, type CompanionSettings } from './settings-store';
import type { SettingsRpcDeps } from './settings-rpc';

// apply 级测试的模块级替身:
// - readSettings:可控 resolve 时机(启动路径断言 restart 在持久化读回之后发生)
// - runSelfHeal:不触发真实 hyc 探测 / npm 全局安装
vi.mock('./settings-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./settings-store')>();
  return { ...actual, readSettings: vi.fn() };
});
vi.mock('./prereq-self-heal', () => ({
  runSelfHeal: vi.fn().mockResolvedValue(undefined),
}));

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
      scheduleUnderstand: vi.fn().mockResolvedValue({ ok: true }),
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

it('credential PTY runner 用真实终端写入输入并收集输出后清理', async () => {
  let input = '';
  const terminate = vi.fn(async () => {});
  const spawnTerminal = vi.fn(async (spec: { argv: readonly string[]; cwd: string; rows: number; cols: number; graceMs: number }) => {
    expect(spec.argv).toEqual(['hyc', 'login']);
    expect(spec.rows).toBeGreaterThan(0);
    expect(spec.cols).toBeGreaterThan(0);
    return {
      output: (async function* () { yield '{"ok":true}'; })(),
      done: Promise.resolve({ exitCode: 0, signal: null }),
      write: async (value: string) => { input = value; },
      terminate,
    };
  });
  const ctx = {
    get: (name: string): unknown => name === 'subprocess' ? { spawnTerminal } : undefined,
  } as unknown as Context;
  const run = createCredentialPtyRunner(ctx);
  await expect(run('login', 'hytime\nsecret\n')).resolves.toEqual({ status: 0, stdout: '{"ok":true}' });
  expect(input).toBe('hytime\nsecret\n');
  expect(terminate).toHaveBeenCalledTimes(1);
});

function makeRemote(options: {
  shell?: { resolve: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn> };
  deps?: SettingsRpcDeps;
} = {}): CompanionRemote {
  return new CompanionRemote(makeCtx(options.shell), options.deps ?? makeFakeDeps());
}

/** 假 ctx(apply 级):effect 同步执行(启动 buddy 定时器),plugin 挂载钩子预建 remote(get 返回)。 */
function makeApplyCtx(deps?: SettingsRpcDeps): Context {
  const ctx = {
    reflect: { provide: vi.fn() },
    get: (name: string): unknown => (name === REMOTE_SERVICE ? remote : undefined),
    effect: (callback: () => void | (() => void)): (() => void) => {
      const disposer = callback();
      return typeof disposer === 'function' ? disposer : () => {};
    },
    on: vi.fn(),
    emit: vi.fn(),
    plugin: vi.fn(() => ({})),
  } as unknown as Context;
  const remote = new CompanionRemote(ctx, deps ?? makeFakeDeps());
  return ctx;
}

function makeAsyncApplyCtx(deps?: SettingsRpcDeps): Context {
  let remote: CompanionRemote | undefined;
  const ctx = {
    reflect: { provide: vi.fn() },
    get: (name: string): unknown => (name === REMOTE_SERVICE ? remote : undefined),
    effect: (callback: () => void | (() => void)): (() => void) => {
      const disposer = callback();
      return typeof disposer === 'function' ? disposer : () => {};
    },
    on: vi.fn(),
    emit: vi.fn(),
    plugin: vi.fn(async () => {
      await Promise.resolve();
      remote = new CompanionRemote(ctx, deps ?? makeFakeDeps());
    }),
  } as unknown as Context;
  return ctx;
}

describe('apply(异步挂载 CompanionRemote 后再读取服务)', () => {
  it('waits for ctx.plugin before accessing the remote service', async () => {
    vi.mocked(readSettings).mockResolvedValue({ ...DEFAULT_SETTINGS });

    await expect((async () => {
      await apply(makeAsyncApplyCtx());
    })()).resolves.toBeUndefined();

    vi.mocked(readSettings).mockReset();
  });
});

describe('applySettingsToBuddy(名称/称呼/好感度开关消费)', () => {
  it('默认配置的空名称回退线上人格名称和称呼', () => {
    expect(applySettingsToBuddy({ ...ONLINE_BASE, companionName: '小小梦', userCallName: '伟大的造物主' }, DEFAULT_SETTINGS)).toMatchObject({
      companionName: '小小梦',
      userCallName: '伟大的造物主',
    });
  });

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

describe('buddyPollIntervalMs(提醒间隔配置 → 轮询间隔换算)', () => {
  it('reminderIntervalMin=5 → 300_000ms(配置驱动)', () => {
    expect(buddyPollIntervalMs({ ...DEFAULT_SETTINGS, reminderIntervalMin: 5 })).toBe(300_000);
  });

  it('reminderIntervalMin=0 → 30_000ms(下限 30s)', () => {
    expect(buddyPollIntervalMs({ ...DEFAULT_SETTINGS, reminderIntervalMin: 0 })).toBe(30_000);
  });

  it('缺省配置(reminderIntervalMin=1)→ 60_000ms(配置驱动生效,30s 仅作下限)', () => {
    expect(buddyPollIntervalMs({ ...DEFAULT_SETTINGS })).toBe(60_000);
  });

  it('负值/NaN → 30_000ms(兜底下限)', () => {
    expect(buddyPollIntervalMs({ ...DEFAULT_SETTINGS, reminderIntervalMin: -5 })).toBe(30_000);
    expect(buddyPollIntervalMs({ ...DEFAULT_SETTINGS, reminderIntervalMin: Number.NaN })).toBe(30_000);
  });
});

describe('createBuddyTimer(配置驱动间隔 + 配置变更重启)', () => {
  it('start:按当前配置换算间隔创建定时器;reminderEnabled=false 时 tick 不执行', () => {
    vi.useFakeTimers();
    const intervalSpy = vi.spyOn(globalThis, 'setInterval');
    const getSettings = vi.fn(() => ({ ...DEFAULT_SETTINGS, reminderEnabled: false, reminderIntervalMin: 5 }));
    const tick = vi.fn();
    const timer = createBuddyTimer({ getSettings, tick });
    timer.start();
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 300_000);
    vi.advanceTimersByTime(300_000);
    expect(tick).not.toHaveBeenCalled();
    timer.dispose();
    vi.useRealTimers();
  });

  it('reminderEnabled=true:一个间隔后 tick 恰好执行一次', () => {
    vi.useFakeTimers();
    const getSettings = vi.fn(() => ({ ...DEFAULT_SETTINGS, reminderIntervalMin: 1 }));
    const tick = vi.fn();
    const timer = createBuddyTimer({ getSettings, tick });
    timer.start();
    vi.advanceTimersByTime(60_000);
    expect(tick).toHaveBeenCalledTimes(1);
    timer.dispose();
    vi.useRealTimers();
  });

  it('restart:配置变更后以新间隔重建定时器(旧定时器被清理)', () => {
    vi.useFakeTimers();
    const intervalSpy = vi.spyOn(globalThis, 'setInterval');
    const getSettings = vi.fn(() => ({ ...DEFAULT_SETTINGS, reminderIntervalMin: 5 }));
    const tick = vi.fn();
    const timer = createBuddyTimer({ getSettings, tick });
    timer.start();
    expect(intervalSpy).toHaveBeenLastCalledWith(expect.any(Function), 300_000);
    getSettings.mockReturnValue({ ...DEFAULT_SETTINGS, reminderIntervalMin: 0 });
    timer.restart();
    expect(intervalSpy).toHaveBeenLastCalledWith(expect.any(Function), 30_000);
    // 旧 5 分钟定时器已清理:推进 31s 只触发新 30s 定时器一次
    vi.advanceTimersByTime(31_000);
    expect(tick).toHaveBeenCalledTimes(1);
    timer.dispose();
    vi.useRealTimers();
  });

  it('dispose:清理定时器后不再触发', () => {
    vi.useFakeTimers();
    const getSettings = vi.fn(() => ({ ...DEFAULT_SETTINGS, reminderIntervalMin: 1 }));
    const tick = vi.fn();
    const timer = createBuddyTimer({ getSettings, tick });
    timer.start();
    timer.dispose();
    vi.advanceTimersByTime(120_000);
    expect(tick).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('dispose 后 restart 不复活定时器(disposed 守卫,卸载竞态不泄漏)', () => {
    vi.useFakeTimers();
    const intervalSpy = vi.spyOn(globalThis, 'setInterval');
    const getSettings = vi.fn(() => ({ ...DEFAULT_SETTINGS, reminderIntervalMin: 1 }));
    const tick = vi.fn();
    const timer = createBuddyTimer({ getSettings, tick });
    timer.start();
    expect(intervalSpy).toHaveBeenCalledTimes(1);
    // 模拟 setConfig RPC 在插件卸载后才 resolve 的竞态:dispose 后 restart 直接返回
    timer.dispose();
    timer.restart();
    expect(intervalSpy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(120_000);
    expect(tick).not.toHaveBeenCalled();
    vi.useRealTimers();
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

  it('createSchedule:把自然语言文本透传给 handler', async () => {
    const deps = makeFakeDeps();
    deps.commands.scheduleUnderstand = vi.fn().mockResolvedValue({ ok: true });
    const remote = makeRemote({ deps });
    await expect(remote.createSchedule('明天早上九点提醒我喝水')).resolves.toEqual({ ok: true });
    expect(deps.commands.scheduleUnderstand).toHaveBeenCalledWith('明天早上九点提醒我喝水');
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

describe('apply(启动路径:初始 readSettings 完成后 restart 重建定时器)', () => {
  it('持久化 reminderIntervalMin 在启动读回后经 restart 生效(不等下一次 setConfig)', async () => {
    vi.useFakeTimers();
    const intervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    let resolveRead!: (settings: CompanionSettings) => void;
    const readPromise = new Promise<CompanionSettings>((resolve) => {
      resolveRead = resolve;
    });
    vi.mocked(readSettings).mockImplementation(() => readPromise);

    await apply(makeApplyCtx());

    // 读回完成前:只按缺省快照建 buddy 定时器(60s)与回复定时器(5s),
    // 尚无 restart(旧实现此处就漏掉了持久化间隔)
    expect(intervalSpy).toHaveBeenCalledTimes(2);
    expect(intervalSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 60_000);
    expect(intervalSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 5_000);

    // 初始 readSettings 延迟 resolve:持久化间隔(5 分钟)注入后 restart 重建
    resolveRead({ ...DEFAULT_SETTINGS, reminderIntervalMin: 5 });
    await readPromise;
    await Promise.resolve();

    expect(intervalSpy).toHaveBeenCalledTimes(3);
    expect(intervalSpy).toHaveBeenNthCalledWith(3, expect.any(Function), 300_000);
    expect(clearSpy).toHaveBeenCalledTimes(1);

    vi.mocked(readSettings).mockReset();
    vi.useRealTimers();
  });
});

describe('registerAlternateProtocolMarkers(双表注册:备选实例镜像标记)', () => {
  it('把 15 个 @Remote 标记镜像写入另一协议实例的私有标记表', async () => {
    // 备选实例:同一协议库经带 query 的 file URL 再加载一次,得到与主导入
    // 不同的模块实例(私有标记表独立)——等价于开发模式 src/lib 双实例分裂。
    const { createRequire } = await import('node:module');
    const { pathToFileURL } = await import('node:url');
    const require2 = createRequire(import.meta.url);
    const libPath = require2.resolve('@deepseek-ai/dsh-typert-protocol');
    type ProtocolModule = typeof import('@deepseek-ai/dsh-typert-protocol');
    const alternateModule: unknown = await import(/* @vite-ignore */ `${pathToFileURL(libPath).href}?alternate=1`);
    const alternate = alternateModule as ProtocolModule;

    const probe = Object.create(CompanionRemote.prototype);
    // 镜像前:备选实例的标记表中没有本类任何标记(双实例分裂的源头)
    expect(alternate.remoteMethods(probe)).toHaveLength(0);
    await registerAlternateProtocolMarkers(alternate);
    const methods = alternate.remoteMethods(probe).map((m) => m.method);
    expect(methods).toEqual([
      'status', 'buddy', 'latestReply', 'asset', 'authStatus', 'login', 'register', 'logout',
      'getConfig', 'setConfig', 'listSchedules', 'createSchedule', 'enableSchedule', 'disableSchedule', 'deleteSchedule',
    ]);
  });
});
