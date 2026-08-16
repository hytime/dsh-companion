import { describe, expect, it } from 'vitest';
import {
  checkAuthStatus,
  COMMAND_TIMEOUT_MS,
  listSchedules,
  loginWithCredentials,
  logout,
  registerWithCredentials,
  scheduleAction,
  type ScheduleItem,
} from './companion-commands';

/** 构造 ENOENT 错误（spawnSync 找不到可执行文件时的 result.error 形态）。 */
function enoentError(): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error('spawnSync script ENOENT');
  err.code = 'ENOENT';
  return err;
}

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

describe('checkAuthStatus', () => {
  it('hyc personality get 退出 0 → authenticated', async () => {
    const run = () => ({ status: 0 });
    await expect(checkAuthStatus({ run })).resolves.toBe('authenticated');
  });

  it('hyc personality get 退出非 0 → unauthenticated', async () => {
    const run = () => ({ status: 4, stdout: '{"error":"登录已过期，请重新执行 hyc login: 请先登录"}' });
    await expect(checkAuthStatus({ run })).resolves.toBe('unauthenticated');
  });

  it('退出 0 但输出 {"error":...} 信封(实测契约 2026-08-16:server 错误以退出码 0 + stdout 错误信封返回)→ unauthenticated', async () => {
    const run = () => ({ status: 0, stdout: '{"error":"登录已过期，请重新执行 hyc login: 请先登录"}' });
    await expect(checkAuthStatus({ run })).resolves.toBe('unauthenticated');
  });

  it('hyc 不存在(ENOENT)→ unauthenticated', async () => {
    const run = () => ({ error: enoentError() });
    await expect(checkAuthStatus({ run })).resolves.toBe('unauthenticated');
  });
});

describe('loginWithCredentials', () => {
  it('经 script 伪终端调用 hyc login,input 喂入 账号\\n密码\\n,退出 0 → ok:true', async () => {
    const calls: Array<[string, string[], unknown]> = [];
    const run = (cmd: string, args: string[], options?: { input?: string }) => {
      calls.push([cmd, args, options]);
      return { status: 0, stdout: '{"ok":true,"profile":"production"}' };
    };
    const result = await loginWithCredentials('hytime', 'secret', { run });
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([['script', ['-q', '/dev/null', 'hyc', 'login'], { input: 'hytime\nsecret\n' }]]);
  });

  it('script 不可用(ENOENT)→ 平台不支持错误,提示终端运行 hyc login', async () => {
    const run = () => ({ error: enoentError() });
    const result = await loginWithCredentials('hytime', 'secret', { run });
    expect(result).toEqual({ ok: false, error: '当前平台不支持页面内登录,请在终端运行 hyc login' });
  });

  it('hyc 登录失败(退出非 0,输出含 error 字段)→ 原样透传错误', async () => {
    const run = () => ({ status: 4, stdout: '{"error":"账号或密码错误"}' });
    const result = await loginWithCredentials('hytime', 'wrong', { run });
    expect(result).toEqual({ ok: false, error: '账号或密码错误' });
  });

  it('hyc 登录失败且无 JSON error → 透传 stderr', async () => {
    const run = () => ({ status: 1, stderr: '无法连接服务器' });
    const result = await loginWithCredentials('hytime', 'secret', { run });
    expect(result).toEqual({ ok: false, error: '无法连接服务器' });
  });
});

describe('registerWithCredentials', () => {
  it('经 script 调用 hyc register,input 喂入 账号/密码/确认密码 三行,退出 0 → ok:true', async () => {
    const calls: Array<[string, string[], unknown]> = [];
    const run = (cmd: string, args: string[], options?: { input?: string }) => {
      calls.push([cmd, args, options]);
      return { status: 0, stdout: '{"ok":true,"profile":"production"}' };
    };
    const result = await registerWithCredentials('hytime', 'secret', { run });
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      ['script', ['-q', '/dev/null', 'hyc', 'register'], { input: 'hytime\nsecret\nsecret\n' }],
    ]);
  });

  it('script 不可用(ENOENT)→ 平台不支持错误', async () => {
    const run = () => ({ error: enoentError() });
    const result = await registerWithCredentials('hytime', 'secret', { run });
    expect(result).toEqual({ ok: false, error: '当前平台不支持页面内登录,请在终端运行 hyc login' });
  });

  it('hyc 注册失败(退出非 0)→ 原样透传错误', async () => {
    const run = () => ({ status: 3, stdout: '{"error":"两次输入的密码不一致"}' });
    const result = await registerWithCredentials('hytime', 'secret', { run });
    expect(result).toEqual({ ok: false, error: '两次输入的密码不一致' });
  });
});

describe('logout', () => {
  it('调用 hyc logout,退出 0 → ok:true', async () => {
    const calls: Array<[string, string[]]> = [];
    const run = (cmd: string, args: string[]) => {
      calls.push([cmd, args]);
      return { status: 0, stdout: '{"ok":true,"profile":"production"}' };
    };
    const result = await logout({ run });
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([['hyc', ['logout']]]);
  });

  it('退出非 0 → ok:false 且原样透传错误', async () => {
    const run = () => ({ status: 4, stdout: '{"error":"无法清除登录凭据"}' });
    const result = await logout({ run });
    expect(result).toEqual({ ok: false, error: '无法清除登录凭据' });
  });
});

describe('hyc 挂起超时保护(spawnSync timeout 的 ETIMEDOUT 形态)', () => {
  it('defaultRun 配置 30s 同步执行超时(挂起时以 ETIMEDOUT 返回,不无限阻塞 DSH host 事件循环)', () => {
    expect(COMMAND_TIMEOUT_MS).toBe(30_000);
  });

  it('logout:注入超时形态(status:null + error ETIMEDOUT)→ ok:false 且错误原样透传,不抛出', async () => {
    const timedOut: NodeJS.ErrnoException = new Error('spawnSync hyc ETIMEDOUT');
    timedOut.code = 'ETIMEDOUT';
    const result = await logout({ run: () => ({ status: null, error: timedOut }) });
    expect(result).toEqual({ ok: false, error: 'spawnSync hyc ETIMEDOUT' });
  });

  it('login:ETIMEDOUT 不等于 ENOENT → 不走「平台不支持」分支,错误原样透传', async () => {
    const timedOut: NodeJS.ErrnoException = new Error('spawnSync script ETIMEDOUT');
    timedOut.code = 'ETIMEDOUT';
    const result = await loginWithCredentials('hytime', 'secret', { run: () => ({ error: timedOut }) });
    expect(result).toEqual({ ok: false, error: 'spawnSync script ETIMEDOUT' });
  });

  it('scheduleAction:超时形态 → ok:false 且错误原样透传', async () => {
    const timedOut: NodeJS.ErrnoException = new Error('spawnSync hyc ETIMEDOUT');
    timedOut.code = 'ETIMEDOUT';
    const result = await scheduleAction('enable', 'id-1', { run: () => ({ status: null, error: timedOut }) });
    expect(result).toEqual({ ok: false, error: 'spawnSync hyc ETIMEDOUT' });
  });
});

describe('listSchedules', () => {
  it('调用 hyc schedule list,输出 {items:[...]} 分页信封 → 解析出 items 数组', async () => {
    const calls: Array<[string, string[]]> = [];
    const run = (cmd: string, args: string[]) => {
      calls.push([cmd, args]);
      return {
        status: 0,
        stdout: JSON.stringify({ items: [item], page: 1, page_size: 10, total: 1, total_pages: 1 }),
      };
    };
    await expect(listSchedules({ run })).resolves.toEqual({ ok: true, items: [item] });
    expect(calls).toEqual([['hyc', ['schedule', 'list']]]);
  });

  it('输出为裸数组 → 同样解析为数组', async () => {
    const run = () => ({ status: 0, stdout: JSON.stringify([item]) });
    await expect(listSchedules({ run })).resolves.toEqual({ ok: true, items: [item] });
  });

  it('输出非 JSON → ok:false,错误说明不是合法 JSON', async () => {
    const run = () => ({ status: 0, stdout: 'Trace: boom\nat main.go:1' });
    const result = await listSchedules({ run });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('不是合法 JSON');
  });

  it('输出 {"error":...} 信封(实测契约:退出 0 + stdout 错误信封,不能只看退出码)→ ok:false 且原样透传', async () => {
    const run = () => ({ status: 0, stdout: '{"error":"登录已过期，请重新执行 hyc login: 请先登录"}' });
    const result = await listSchedules({ run });
    expect(result).toEqual({ ok: false, error: '登录已过期，请重新执行 hyc login: 请先登录' });
  });

  it('退出非 0 → ok:false 且透传错误', async () => {
    const run = () => ({ status: 4, stdout: '{"error":"请先登录"}' });
    const result = await listSchedules({ run });
    expect(result).toEqual({ ok: false, error: '请先登录' });
  });

  it('hyc 不存在(ENOENT)→ ok:false 且透传错误', async () => {
    const run = () => ({ error: enoentError() });
    const result = await listSchedules({ run });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ENOENT');
  });
});

describe('scheduleAction', () => {
  it.each(['enable', 'disable', 'delete'] as const)(
    '%s → 调用 hyc schedule %s --id <id>,退出 0 且无 error 信封 → ok:true',
    async (action) => {
      const calls: Array<[string, string[]]> = [];
      const run = (cmd: string, args: string[]) => {
        calls.push([cmd, args]);
        return { status: 0, stdout: '{"ok":true}' };
      };
      const result = await scheduleAction(action, 'id-1', { run });
      expect(result).toEqual({ ok: true });
      expect(calls).toEqual([['hyc', ['schedule', action, '--id', 'id-1']]]);
    },
  );

  it('退出 0 + {"error":...} 信封(实测契约 2026-08-16:server 错误以退出码 0 返回)→ ok:false 且原样透传', async () => {
    const run = () => ({ status: 0, stdout: '{"error":"PATCH /api/companion/schedule/events/x/enabled: 事件未找到"}' });
    const result = await scheduleAction('enable', 'id-1', { run });
    expect(result).toEqual({ ok: false, error: 'PATCH /api/companion/schedule/events/x/enabled: 事件未找到' });
  });

  it('退出非 0 → ok:false 且透传错误', async () => {
    const run = () => ({ status: 4, stderr: '登录已过期' });
    const result = await scheduleAction('disable', 'id-1', { run });
    expect(result).toEqual({ ok: false, error: '登录已过期' });
  });
});
