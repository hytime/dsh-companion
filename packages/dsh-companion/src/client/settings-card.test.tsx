import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsCard } from './settings-card';
import type { CompanionRemoteFace, CompanionSettings, ScheduleItem } from './companion-types';

const DEFAULT_SETTINGS: CompanionSettings = {
  companionName: '旅伴',
  userCallName: '造物主',
  showAffection: true,
  showBubble: true,
  reminderEnabled: true,
  reminderIntervalMin: 60,
};

const SCHEDULES: ScheduleItem[] = [
  {
    id: 's1',
    title: '早晨问候',
    message: '早安',
    enabled: true,
    repeatRule: 'daily',
    slot: 'morning',
    timeOfDay: '08:00',
    createdAt: '2026-08-01T08:00:00Z',
    updatedAt: '2026-08-01T08:00:00Z',
    confidence: 0.9,
    sourceQuery: null,
    userId: 'u1',
  },
  {
    id: 's2',
    title: '午后陪伴',
    message: '下午茶',
    enabled: false,
    repeatRule: 'daily',
    slot: 'afternoon',
    timeOfDay: '15:00',
    createdAt: '2026-08-02T08:00:00Z',
    updatedAt: '2026-08-02T08:00:00Z',
    confidence: 0.8,
    sourceQuery: '午休',
    userId: 'u1',
  },
];

/** 构造假 remote:默认返回成功信封,可逐方法覆写。 */
function createRemote(overrides: Partial<CompanionRemoteFace> = {}): CompanionRemoteFace {
  return {
    buddy: vi.fn(),
    asset: vi.fn(),
    status: vi.fn(),
    latestReply: vi.fn(),
    authStatus: vi.fn(async () => ({ ok: true as const, value: { ok: true as const, status: 'unauthenticated' as const } })),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getConfig: vi.fn(async () => ({ ok: true as const, value: { ok: true as const, ...DEFAULT_SETTINGS } })),
    setConfig: vi.fn(async () => ({ ok: true as const, value: { ok: true as const } })),
    listSchedules: vi.fn(async () => ({ ok: true as const, value: { ok: true as const, items: [] } })),
    enableSchedule: vi.fn(async () => ({ ok: true as const, value: { ok: true as const } })),
    disableSchedule: vi.fn(async () => ({ ok: true as const, value: { ok: true as const } })),
    deleteSchedule: vi.fn(async () => ({ ok: true as const, value: { ok: true as const } })),
    ...overrides,
  };
}

function renderCard(remote: CompanionRemoteFace) {
  return render(<SettingsCard remote={remote} />);
}

describe('SettingsCard', () => {
  it('渲染三区块标题(账号与密码 / 基本配置 / 事件提醒)', async () => {
    renderCard(createRemote());
    expect(await screen.findByText('账号与密码')).toBeInTheDocument();
    expect(screen.getByText('基本配置')).toBeInTheDocument();
    expect(screen.getByText('事件提醒')).toBeInTheDocument();
  });

  it('登录模式:账号密码为空点提交 → 错误「请输入账号和密码」,不调用 remote.login', async () => {
    const remote = createRemote();
    const user = userEvent.setup();
    renderCard(remote);
    await screen.findByText('账号与密码');
    await user.click(screen.getByRole('button', { name: '登录' }));
    expect(screen.getByText('请输入账号和密码')).toBeInTheDocument();
    expect(remote.login).not.toHaveBeenCalled();
  });

  it('注册模式:密码 < 8 位 → 错误;两次密码不一致 → 错误;不调用 remote.register', async () => {
    const remote = createRemote();
    const user = userEvent.setup();
    renderCard(remote);
    await screen.findByText('账号与密码');
    await user.click(screen.getByRole('button', { name: '账号注册' }));
    // 密码不足 8 位
    await user.type(screen.getByLabelText('账号'), 'alice');
    await user.type(screen.getByLabelText('密码'), 'short');
    await user.type(screen.getByLabelText('确认密码'), 'short');
    await user.click(screen.getByRole('button', { name: '注册' }));
    expect(screen.getByText('密码至少 8 位')).toBeInTheDocument();
    expect(remote.register).not.toHaveBeenCalled();
    // 两次密码不一致
    await user.clear(screen.getByLabelText('密码'));
    await user.type(screen.getByLabelText('密码'), 'longenough1');
    await user.click(screen.getByRole('button', { name: '注册' }));
    expect(screen.getByText('两次输入的密码不一致')).toBeInTheDocument();
    expect(remote.register).not.toHaveBeenCalled();
  });

  it('提交成功(注入 remote 返回 ok)→ 状态刷新为已登录', async () => {
    let authenticated = false;
    const remote = createRemote({
      authStatus: vi.fn<CompanionRemoteFace['authStatus']>(async () => ({
        ok: true as const,
        value: { ok: true as const, status: authenticated ? 'authenticated' : 'unauthenticated' },
      })),
      login: vi.fn<CompanionRemoteFace['login']>(async () => {
        authenticated = true;
        return { ok: true as const, value: { ok: true as const } };
      }),
    });
    const user = userEvent.setup();
    renderCard(remote);
    await screen.findByText('账号与密码');
    await user.type(screen.getByLabelText('账号'), 'alice');
    await user.type(screen.getByLabelText('密码'), 'correct-password');
    await user.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByText('已登录')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '退出登录' })).toBeInTheDocument();
    expect(remote.login).toHaveBeenCalledWith('alice', 'correct-password');
  });

  it('基本配置:渲染名称/称呼输入框与两个开关,保存调用 remote.setConfig({...})', async () => {
    const remote = createRemote();
    const user = userEvent.setup();
    renderCard(remote);
    await screen.findByText('基本配置');
    // 加载完成后回填配置
    await waitFor(() => expect(screen.getByLabelText('旅伴名称')).toHaveValue('旅伴'));
    await user.clear(screen.getByLabelText('旅伴名称'));
    await user.type(screen.getByLabelText('旅伴名称'), '小小梦');
    await user.clear(screen.getByLabelText('对你的称呼'));
    await user.type(screen.getByLabelText('对你的称呼'), '主人');
    await user.click(screen.getByRole('switch', { name: '显示好感度' }));
    await user.click(screen.getByRole('button', { name: '保存配置' }));
    await waitFor(() =>
      expect(remote.setConfig).toHaveBeenCalledWith({
        companionName: '小小梦',
        userCallName: '主人',
        showAffection: false,
        showBubble: true,
      }),
    );
  });

  it('事件提醒:渲染开关/间隔输入/事件列表(2 项),启停/删除按钮调用对应方法', async () => {
    const remote = createRemote({
      listSchedules: vi.fn(async () => ({ ok: true as const, value: { ok: true as const, items: SCHEDULES } })),
    });
    const user = userEvent.setup();
    renderCard(remote);
    const item1 = await screen.findByTestId('schedule-item-s1');
    expect(within(item1).getByText('早晨问候')).toBeInTheDocument();
    expect(screen.getByTestId('schedule-item-s2')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '定时提醒' })).toBeInTheDocument();
    expect(screen.getByLabelText(/提醒间隔/)).toBeInTheDocument();
    // 启用的事件显示「停用」,停用的事件显示「启用」
    await user.click(within(item1).getByRole('button', { name: '停用' }));
    await waitFor(() => expect(remote.disableSchedule).toHaveBeenCalledWith('s1'));
    await user.click(within(screen.getByTestId('schedule-item-s2')).getByRole('button', { name: '启用' }));
    await waitFor(() => expect(remote.enableSchedule).toHaveBeenCalledWith('s2'));
    await user.click(within(screen.getByTestId('schedule-item-s2')).getByRole('button', { name: '删除' }));
    await waitFor(() => expect(remote.deleteSchedule).toHaveBeenCalledWith('s2'));
  });

  it('保存成功提示「已保存」;错误展示 error 文本', async () => {
    const remote = createRemote({
      setConfig: vi.fn(async () => ({ ok: false as const, error: { code: 'offline', message: '网络中断' } })),
    });
    const user = userEvent.setup();
    renderCard(remote);
    await screen.findByText('基本配置');
    await user.click(screen.getByRole('button', { name: '保存配置' }));
    expect(await screen.findByText('网络中断')).toBeInTheDocument();
    expect(screen.queryByText('已保存')).not.toBeInTheDocument();
    // 再次保存成功 → 显示「已保存」
    remote.setConfig = vi.fn(async () => ({ ok: true as const, value: { ok: true as const } }));
    await user.click(screen.getByRole('button', { name: '保存配置' }));
    expect(await screen.findByText('已保存')).toBeInTheDocument();
  });
});
