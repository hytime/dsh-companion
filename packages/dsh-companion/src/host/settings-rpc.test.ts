import { describe, expect, it, vi } from 'vitest';
import { createSettingsHandlers, type SettingsRpcDeps } from './settings-rpc';
import { DEFAULT_SETTINGS, type CompanionSettings } from './settings-store';
import type { ScheduleItem } from './companion-commands';

/** 与真实 hyc schedule list 单条记录同构的最小样本。 */
const item: ScheduleItem = {
  id: '1b134041-359d-476b-a70b-4165a2b396f9',
  title: '遛狗喂猫提醒',
  message: '记得遛狗喂猫',
  enabled: true,
  repeatRule: 'daily',
  slot: 'evening',
  timeOfDay: '21:00',
  createdAt: '2026-08-10T21:40:48+08:00',
  updatedAt: '2026-08-10T21:40:48+08:00',
  confidence: 0.95,
  sourceQuery: null,
  userId: 'user_hytime_1',
};

/** 构造注入式假依赖:store/commands 全部为记录调用的 vi.fn,可按用例覆写。 */
function makeDeps(overrides: {
  store?: Partial<SettingsRpcDeps['store']>;
  commands?: Partial<SettingsRpcDeps['commands']>;
} = {}): SettingsRpcDeps {
  return {
    store: {
      readSettings: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS }),
      writeSettings: vi.fn().mockResolvedValue({ ok: true }),
      ...overrides.store,
    },
    commands: {
      checkAuthStatus: vi.fn().mockResolvedValue('authenticated' as const),
      loginWithCredentials: vi.fn().mockResolvedValue({ ok: true }),
      registerWithCredentials: vi.fn().mockResolvedValue({ ok: true }),
      logout: vi.fn().mockResolvedValue({ ok: true }),
      listSchedules: vi.fn().mockResolvedValue({ ok: true, items: [] }),
      scheduleAction: vi.fn().mockResolvedValue({ ok: true }),
      ...overrides.commands,
    },
  };
}

describe('createSettingsHandlers', () => {
  it('返回的 handler 表包含全部 10 个方法名,每个都是函数', () => {
    const handlers = createSettingsHandlers(makeDeps());
    const expected = [
      'authStatus',
      'login',
      'register',
      'logout',
      'getConfig',
      'setConfig',
      'listSchedules',
      'enableSchedule',
      'disableSchedule',
      'deleteSchedule',
    ];
    expect(Object.keys(handlers).sort()).toEqual([...expected].sort());
    for (const name of expected) {
      expect(typeof handlers[name as keyof typeof handlers]).toBe('function');
    }
  });

  it('authStatus 透传 commands.checkAuthStatus 的结果为 { ok:true, status }', async () => {
    const deps = makeDeps({
      commands: { checkAuthStatus: vi.fn().mockResolvedValue('authenticated' as const) },
    });
    const handlers = createSettingsHandlers(deps);
    await expect(handlers.authStatus()).resolves.toEqual({ ok: true, status: 'authenticated' });
    expect(deps.commands.checkAuthStatus).toHaveBeenCalledTimes(1);
  });

  it('authStatus 未认证时返回 { ok:true, status:"unauthenticated" }(探测本身不失败)', async () => {
    const deps = makeDeps({
      commands: { checkAuthStatus: vi.fn().mockResolvedValue('unauthenticated' as const) },
    });
    const handlers = createSettingsHandlers(deps);
    await expect(handlers.authStatus()).resolves.toEqual({ ok: true, status: 'unauthenticated' });
  });

  it('login 把 { username, password } 透传给 commands.loginWithCredentials 并返回结果', async () => {
    const deps = makeDeps({
      commands: {
        loginWithCredentials: vi.fn().mockResolvedValue({ ok: true }),
      },
    });
    const handlers = createSettingsHandlers(deps);
    await expect(handlers.login({ username: 'hytime', password: 'secret' })).resolves.toEqual({ ok: true });
    expect(deps.commands.loginWithCredentials).toHaveBeenCalledWith('hytime', 'secret');
  });

  it('login 失败:commands 返回 { ok:false, error } → 原样透传', async () => {
    const deps = makeDeps({
      commands: {
        loginWithCredentials: vi.fn().mockResolvedValue({ ok: false, error: '账号或密码错误' }),
      },
    });
    const handlers = createSettingsHandlers(deps);
    await expect(handlers.login({ username: 'hytime', password: 'wrong' })).resolves.toEqual({
      ok: false,
      error: '账号或密码错误',
    });
  });

  it('register 透传给 commands.registerWithCredentials', async () => {
    const deps = makeDeps({
      commands: {
        registerWithCredentials: vi.fn().mockResolvedValue({ ok: false, error: '两次输入的密码不一致' }),
      },
    });
    const handlers = createSettingsHandlers(deps);
    await expect(handlers.register({ username: 'hytime', password: 'a' })).resolves.toEqual({
      ok: false,
      error: '两次输入的密码不一致',
    });
    expect(deps.commands.registerWithCredentials).toHaveBeenCalledWith('hytime', 'a');
  });

  it('logout 透传给 commands.logout', async () => {
    const deps = makeDeps({
      commands: { logout: vi.fn().mockResolvedValue({ ok: true }) },
    });
    const handlers = createSettingsHandlers(deps);
    await expect(handlers.logout()).resolves.toEqual({ ok: true });
    expect(deps.commands.logout).toHaveBeenCalledTimes(1);
  });

  it('getConfig 透传 store.readSettings 为 { ok:true, ...settings }', async () => {
    const settings: CompanionSettings = { ...DEFAULT_SETTINGS, companionName: '小鲸' };
    const deps = makeDeps({ store: { readSettings: vi.fn().mockResolvedValue(settings) } });
    const handlers = createSettingsHandlers(deps);
    await expect(handlers.getConfig()).resolves.toEqual({ ok: true, ...settings });
    expect(deps.store.readSettings).toHaveBeenCalledTimes(1);
  });

  it('setConfig 透传 store.writeSettings(partial) 并返回其结果', async () => {
    const deps = makeDeps({
      store: { writeSettings: vi.fn().mockResolvedValue({ ok: true }) },
    });
    const handlers = createSettingsHandlers(deps);
    const partial = { companionName: '小鲸', reminderIntervalMin: 30 };
    await expect(handlers.setConfig(partial)).resolves.toEqual({ ok: true });
    expect(deps.store.writeSettings).toHaveBeenCalledWith(partial);
  });

  it('setConfig 失败:writeSettings 返回 { ok:false, error } → 原样透传', async () => {
    const deps = makeDeps({
      store: { writeSettings: vi.fn().mockResolvedValue({ ok: false, error: 'EACCES: permission denied' }) },
    });
    const handlers = createSettingsHandlers(deps);
    const result = await handlers.setConfig({ companionName: '小鲸' });
    expect(result).toEqual({ ok: false, error: 'EACCES: permission denied' });
  });

  it('listSchedules 透传 commands.listSchedules 的 { ok:true, items }', async () => {
    const deps = makeDeps({
      commands: { listSchedules: vi.fn().mockResolvedValue({ ok: true, items: [item] }) },
    });
    const handlers = createSettingsHandlers(deps);
    await expect(handlers.listSchedules()).resolves.toEqual({ ok: true, items: [item] });
    expect(deps.commands.listSchedules).toHaveBeenCalledTimes(1);
  });

  it.each(['enable', 'disable', 'delete'] as const)(
    '%sSchedule 把 { id } 透传给 commands.scheduleAction("%s", id)',
    async (action) => {
      const deps = makeDeps({
        commands: { scheduleAction: vi.fn().mockResolvedValue({ ok: true }) },
      });
      const handlers = createSettingsHandlers(deps);
      const result = await handlers[`${action}Schedule`]({ id: 'id-1' });
      expect(result).toEqual({ ok: true });
      expect(deps.commands.scheduleAction).toHaveBeenCalledWith(action, 'id-1');
    },
  );

  it('handler 不抛出:store.writeSettings 抛异常 → 返回 { ok:false, error }', async () => {
    const deps = makeDeps({
      store: { writeSettings: vi.fn().mockRejectedValue(new Error('EACCES: permission denied, open')) },
    });
    const handlers = createSettingsHandlers(deps);
    const result = await handlers.setConfig({ companionName: '小鲸' });
    expect(result).toEqual({ ok: false, error: 'EACCES: permission denied, open' });
  });

  it('handler 不抛出:commands.checkAuthStatus 抛异常 → 返回 { ok:false, error }', async () => {
    const deps = makeDeps({
      commands: { checkAuthStatus: vi.fn().mockRejectedValue(new Error('spawn ENOENT')) },
    });
    const handlers = createSettingsHandlers(deps);
    const result = await handlers.authStatus();
    expect(result).toEqual({ ok: false, error: 'spawn ENOENT' });
  });
});
