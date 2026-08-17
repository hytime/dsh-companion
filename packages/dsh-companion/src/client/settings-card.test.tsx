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
  reminderIntervalMin: 1,
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
    createSchedule: vi.fn(async () => ({ ok: true as const, value: { ok: true as const } })),
    enableSchedule: vi.fn(async () => ({ ok: true as const, value: { ok: true as const } })),
    disableSchedule: vi.fn(async () => ({ ok: true as const, value: { ok: true as const } })),
    deleteSchedule: vi.fn(async () => ({ ok: true as const, value: { ok: true as const } })),
    ...overrides,
  };
}

function renderCard(remote: CompanionRemoteFace) {
  return render(<SettingsCard remote={remote} close={(): void => {}} />);
}

describe('SettingsCard', () => {
  it('渲染页面头部(deepseek logo + 我的鲸鱼娘)与三区块标题', async () => {
    renderCard(createRemote());
    expect(screen.getByText('我的鲸鱼娘')).toBeInTheDocument();
    expect(screen.getByText('账号与密码')).toBeInTheDocument();
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

  it('提醒列表初始加载第一页、显示分页总数并使用固定 page size', async () => {
    const remote = createRemote({
      listSchedules: vi.fn(async () => ({
        ok: true as const,
        value: { ok: true as const, items: SCHEDULES, page: 1, pageSize: 5, total: 11, totalPages: 3 },
      })),
    });
    renderCard(remote);
    await screen.findByTestId('schedule-item-s1');
    expect(remote.listSchedules).toHaveBeenCalledWith(1, 5);
    expect(screen.getByText('第 1 / 3 页')).toBeInTheDocument();
    expect(screen.getByText('共 11 条')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一页' })).toBeEnabled();
  });

  it('下一页加载 page 2，首尾页按钮边界正确', async () => {
    const remote = createRemote({
      listSchedules: vi.fn(async (page = 1) => ({
        ok: true as const,
        value: {
          ok: true as const,
          items: page === 1 ? SCHEDULES : [SCHEDULES[1]!],
          page,
          pageSize: 5,
          total: 6,
          totalPages: 2,
        },
      })),
    });
    const user = userEvent.setup();
    renderCard(remote);
    await screen.findByTestId('schedule-item-s1');
    await user.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(remote.listSchedules).toHaveBeenLastCalledWith(2, 5));
    expect(screen.getByText('第 2 / 2 页')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上一页' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
  });

  it('翻页失败时保留原列表并显示错误', async () => {
    const listSchedules = vi
      .fn<CompanionRemoteFace['listSchedules']>()
      .mockResolvedValueOnce({ ok: true as const, value: { ok: true as const, items: SCHEDULES, page: 1, total: 6, totalPages: 2 } })
      .mockResolvedValueOnce({ ok: true as const, value: { ok: false as const, error: '分页失败' } });
    const remote = createRemote({ listSchedules });
    const user = userEvent.setup();
    renderCard(remote);
    await screen.findByTestId('schedule-item-s1');
    await user.click(screen.getByRole('button', { name: '下一页' }));
    expect(await screen.findByText('分页失败')).toBeInTheDocument();
    expect(screen.getByTestId('schedule-item-s1')).toBeInTheDocument();
    expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument();
  });

  it('新增提醒输入为空时按钮禁用，提交非空文本调用 createSchedule', async () => {
    const remote = createRemote();
    const user = userEvent.setup();
    renderCard(remote);
    await screen.findByText('事件提醒');
    const input = screen.getByLabelText('新的提醒');
    expect(screen.getByRole('button', { name: '新增' })).toBeDisabled();
    await user.type(input, '明天早上九点提醒我喝水');
    expect(screen.getByRole('button', { name: '新增' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '新增' }));
    await waitFor(() => expect(remote.createSchedule).toHaveBeenCalledWith('明天早上九点提醒我喝水'));
  });

  it('创建成功后清空输入、回到第一页并刷新 listSchedules(1,5)', async () => {
    const listSchedules = vi.fn<CompanionRemoteFace['listSchedules']>()
      .mockResolvedValue({ ok: true as const, value: { ok: true as const, items: SCHEDULES, page: 1, total: 2, totalPages: 1 } });
    const remote = createRemote({ listSchedules });
    const user = userEvent.setup();
    renderCard(remote);
    await screen.findByText('事件提醒');
    const input = screen.getByLabelText('新的提醒');
    await user.type(input, '提醒我喝水');
    await user.click(screen.getByRole('button', { name: '新增' }));
    await waitFor(() => expect(remote.createSchedule).toHaveBeenCalledWith('提醒我喝水'));
    expect(input).toHaveValue('');
    expect(remote.listSchedules).toHaveBeenLastCalledWith(1, 5);
  });

  it('创建失败时保留输入并显示错误', async () => {
    const remote = createRemote({
      createSchedule: vi.fn(async () => ({ ok: true as const, value: { ok: false as const, error: '无法理解提醒' } })),
    });
    const user = userEvent.setup();
    renderCard(remote);
    await screen.findByText('事件提醒');
    const input = screen.getByLabelText('新的提醒');
    await user.type(input, '一条无法理解的提醒');
    await user.click(screen.getByRole('button', { name: '新增' }));
    expect(await screen.findByText('无法理解提醒')).toBeInTheDocument();
    expect(input).toHaveValue('一条无法理解的提醒');
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

  it('基本配置保存成功的「已保存」提示带 role=status(无障碍通知)', async () => {
    const remote = createRemote();
    const user = userEvent.setup();
    renderCard(remote);
    await screen.findByText('基本配置');
    await user.click(screen.getByRole('button', { name: '保存配置' }));
    expect(await screen.findByRole('status')).toHaveTextContent('已保存');
  });

  it('提醒保存成功的「已保存」提示带 role=status(无障碍通知)', async () => {
    const remote = createRemote();
    const user = userEvent.setup();
    renderCard(remote);
    await screen.findByText('事件提醒');
    await user.click(screen.getByRole('button', { name: '保存提醒' }));
    expect(await screen.findByRole('status')).toHaveTextContent('已保存');
  });

  it('退出登录:logoutPending 期间按钮禁用并显示「退出中…」,重复点击不并发 logout,完成后恢复', async () => {
    const logoutDeferred = createDeferred<Awaited<ReturnType<CompanionRemoteFace['logout']>>>();
    const remote = createRemote({
      authStatus: vi.fn<CompanionRemoteFace['authStatus']>(async () => ({
        ok: true as const,
        value: { ok: true as const, status: 'authenticated' as const },
      })),
      logout: vi.fn<CompanionRemoteFace['logout']>(() => logoutDeferred.promise),
    });
    const user = userEvent.setup();
    renderCard(remote);
    await screen.findByText('退出登录');
    await user.click(screen.getByRole('button', { name: '退出登录' }));
    // pending:按钮禁用 + 文案「退出中…」
    const pendingBtn = screen.getByRole('button', { name: '退出中…' });
    expect(pendingBtn).toBeDisabled();
    // 重复点击不触发第二次 logout
    await user.click(pendingBtn);
    expect(remote.logout).toHaveBeenCalledTimes(1);
    // 完成后:认证状态切回未登录,「退出登录」消失、登录表单恢复
    logoutDeferred.resolve({ ok: true as const, value: { ok: true as const } });
    await waitFor(() => expect(screen.queryByRole('button', { name: '退出登录' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '登录' })).toBeEnabled();
  });

  it('提交中:登录提交 pending 期间按钮禁用并显示「提交中…」,双击不重复提交,完成后恢复', async () => {
    const loginDeferred = createDeferred<Awaited<ReturnType<CompanionRemoteFace['login']>>>();
    const remote = createRemote({
      login: vi.fn<CompanionRemoteFace['login']>(() => loginDeferred.promise),
    });
    const user = userEvent.setup();
    renderCard(remote);
    await screen.findByText('账号与密码');
    await user.type(screen.getByLabelText('账号'), 'alice');
    await user.type(screen.getByLabelText('密码'), 'correct-password');
    const submit = screen.getByRole('button', { name: '登录' });
    await user.click(submit);
    // pending:按钮禁用 + 文案「提交中…」
    const pendingBtn = screen.getByRole('button', { name: '提交中…' });
    expect(pendingBtn).toBeDisabled();
    // 双击(或重复点击)不触发第二次提交
    await user.click(pendingBtn);
    expect(remote.login).toHaveBeenCalledTimes(1);
    // 提交完成后恢复可点
    loginDeferred.resolve({ ok: true as const, value: { ok: true as const } });
    await waitFor(() => expect(screen.getByRole('button', { name: '登录' })).toBeEnabled());
  });

  it('提交中:保存配置 pending 期间按钮禁用并显示「提交中…」,完成后恢复', async () => {
    const setConfigDeferred = createDeferred<Awaited<ReturnType<CompanionRemoteFace['setConfig']>>>();
    const remote = createRemote({
      setConfig: vi.fn<CompanionRemoteFace['setConfig']>(() => setConfigDeferred.promise),
    });
    const user = userEvent.setup();
    renderCard(remote);
    await screen.findByText('基本配置');
    const saveBtn = screen.getByRole('button', { name: '保存配置' });
    await user.click(saveBtn);
    const pendingBtn = screen.getByRole('button', { name: '提交中…' });
    expect(pendingBtn).toBeDisabled();
    setConfigDeferred.resolve({ ok: true as const, value: { ok: true as const } });
    await waitFor(() => expect(screen.getByRole('button', { name: '保存配置' })).toBeEnabled());
  });

  it('提交中:保存提醒与事件动作 pending 期间对应按钮禁用,其它事件行不受影响', async () => {
    const setConfigDeferred = createDeferred<Awaited<ReturnType<CompanionRemoteFace['setConfig']>>>();
    const disableDeferred = createDeferred<Awaited<ReturnType<CompanionRemoteFace['disableSchedule']>>>();
    const remote = createRemote({
      setConfig: vi.fn<CompanionRemoteFace['setConfig']>(() => setConfigDeferred.promise),
      disableSchedule: vi.fn<CompanionRemoteFace['disableSchedule']>(() => disableDeferred.promise),
      listSchedules: vi.fn(async () => ({ ok: true as const, value: { ok: true as const, items: SCHEDULES } })),
    });
    const user = userEvent.setup();
    renderCard(remote);
    const item1 = await screen.findByTestId('schedule-item-s1');
    // 保存提醒 pending
    await user.click(screen.getByRole('button', { name: '保存提醒' }));
    expect(screen.getByRole('button', { name: '提交中…' })).toBeDisabled();
    setConfigDeferred.resolve({ ok: true as const, value: { ok: true as const } });
    await waitFor(() => expect(screen.getByRole('button', { name: '保存提醒' })).toBeEnabled());
    // 事件动作 pending:该行两个按钮都禁用,其它行保持可用
    await user.click(within(item1).getByRole('button', { name: '停用' }));
    expect(within(item1).getByRole('button', { name: '停用' })).toBeDisabled();
    expect(within(item1).getByRole('button', { name: '删除' })).toBeDisabled();
    expect(within(screen.getByTestId('schedule-item-s2')).getByRole('button', { name: '启用' })).toBeEnabled();
    // 完成后恢复
    disableDeferred.resolve({ ok: true as const, value: { ok: true as const } });
    await waitFor(() =>
      expect(within(screen.getByTestId('schedule-item-s1')).getByRole('button', { name: '停用' })).toBeEnabled(),
    );
  });
});

/** 手动控制的延迟 Promise:resolve 前一直处于 pending,用于模拟慢提交。 */
function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
