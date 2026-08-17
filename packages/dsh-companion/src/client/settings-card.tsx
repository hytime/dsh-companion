/**
 * settings.section 设置页 —— 设置面板左侧导航的「我的鲸鱼娘」独立页。
 *
 * 三区块（travel-note-agent 分组表单风格，全部内聚于本文件）：
 * - 账号与密码：登录/注册切换 + 前端校验（空账号密码 / 密码长度 / 两次一致），
 *   成功后刷新认证状态显示「已登录」，可退出登录。
 * - 基本配置：旅伴名称 / 对你的称呼 + 两个开关，保存走 setConfig。
 * - 事件提醒：定时提醒开关 / 间隔分钟 + 定时事件列表（启用/停用/删除）。
 *
 * 数据加载：mount 时并行 getConfig / authStatus / listSchedules，loading/error
 * 状态由 loadState 表达；各区块保存均有独立的 error 与「已保存」提示。
 *
 * 远程调用走注入的 remote（travelNoteCompanion 命名空间）：gateway 传输信封
 * RemoteResult（result.ok）与业务信封（result.value.ok）需要解两层。
 */
import * as React from 'react';
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { CompanionRemoteFace, CompanionSettings, ScheduleItem } from './companion-types';
import { DeepSeekLogo } from '../components/deepseek-logo';
import type {} from './slot-contract';
import styles from '../styles/companion.module.css';

/** 注册时经 slots.register 的 inject 注入的业务面：本页面的 remote 调用面。 */
export interface SettingsCardFace {
  remote: CompanionRemoteFace;
}

/** 组合 props：section 提供 owner props（close），另注入 remote。 */
export type SettingsCardProps = PropsRuntime<'settings.section'> & InjectFace<SettingsCardFace>;

type AuthMode = 'login' | 'register';
type AuthStatus = 'authenticated' | 'unauthenticated';
type LoadState = 'loading' | 'ready' | 'error';

export function SettingsCard(props: SettingsCardProps): React.ReactElement {
  const { remote } = props;

  // ---- 初始数据（并行加载，任何一路失败不阻塞其余区块） ----
  const [loadState, setLoadState] = React.useState<LoadState>('loading');
  const [loadError, setLoadError] = React.useState('');
  const [authStatus, setAuthStatus] = React.useState<AuthStatus>('unauthenticated');
  const [config, setConfig] = React.useState<CompanionSettings | null>(null);
  const [schedules, setSchedules] = React.useState<ScheduleItem[]>([]);

  // ---- 账号区块 ----
  const [authMode, setAuthMode] = React.useState<AuthMode>('login');
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [authError, setAuthError] = React.useState('');
  const [authPending, setAuthPending] = React.useState(false);
  /** 退出登录请求进行中(防止双击并发两次 hyc logout)。 */
  const [logoutPending, setLogoutPending] = React.useState(false);

  // ---- 基本配置 ----
  const [companionName, setCompanionName] = React.useState('');
  const [userCallName, setUserCallName] = React.useState('');
  const [showAffection, setShowAffection] = React.useState(true);
  const [showBubble, setShowBubble] = React.useState(true);
  const [configError, setConfigError] = React.useState('');
  const [configSaved, setConfigSaved] = React.useState(false);
  const [configPending, setConfigPending] = React.useState(false);

  // ---- 事件提醒 ----
  const [reminderEnabled, setReminderEnabled] = React.useState(true);
  const [reminderIntervalMin, setReminderIntervalMin] = React.useState(1);
  const [reminderError, setReminderError] = React.useState('');
  const [reminderSaved, setReminderSaved] = React.useState(false);
  const [reminderPending, setReminderPending] = React.useState(false);
  /** 正在执行动作的事件 id(null 表示无动作进行中),pending 期间该行按钮禁用。 */
  const [scheduleActionId, setScheduleActionId] = React.useState<string | null>(null);

  const refreshAuthStatus = React.useCallback(async (): Promise<void> => {
    const result = await remote.authStatus();
    if (result.ok && result.value.ok) setAuthStatus(result.value.status);
  }, [remote]);

  const refreshSchedules = React.useCallback(async (): Promise<void> => {
    const result = await remote.listSchedules();
    if (result.ok && result.value.ok) setSchedules(result.value.items ?? []);
  }, [remote]);

  React.useEffect(() => {
    let active = true;
    Promise.all([remote.getConfig(), remote.authStatus(), remote.listSchedules()])
      .then(([cfg, auth, list]) => {
        if (!active) return;
        const errors: string[] = [];
        if (!cfg.ok) {
          errors.push('读取配置失败');
        } else if (cfg.value.ok) {
          setConfig(cfg.value);
          setCompanionName(cfg.value.companionName);
          setUserCallName(cfg.value.userCallName);
          setShowAffection(cfg.value.showAffection);
          setShowBubble(cfg.value.showBubble);
          setReminderEnabled(cfg.value.reminderEnabled);
          setReminderIntervalMin(cfg.value.reminderIntervalMin);
        } else {
          errors.push(cfg.value.error || '读取配置失败');
        }
        if (auth.ok && auth.value.ok) setAuthStatus(auth.value.status);
        else errors.push('读取认证状态失败');
        if (list.ok && list.value.ok) setSchedules(list.value.items ?? []);
        else errors.push('读取事件列表失败');
        setLoadState(errors.length === 0 ? 'ready' : 'error');
        setLoadError(errors.join('；'));
      })
      .catch(() => {
        if (!active) return;
        setLoadState('error');
        setLoadError('加载失败');
      });
    return () => {
      active = false;
    };
  }, [remote]);

  // ---- 账号：前端校验 + 提交 ----
  const onSubmitAuth = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (authPending) return;
    if (username.trim() === '' || password === '') {
      setAuthError('请输入账号和密码');
      return;
    }
    if (authMode === 'register') {
      if (password.length < 8) {
        setAuthError('密码至少 8 位');
        return;
      }
      if (password !== confirmPassword) {
        setAuthError('两次输入的密码不一致');
        return;
      }
    }
    setAuthError('');
    setAuthPending(true);
    try {
      const result =
        authMode === 'login'
          ? await remote.login(username.trim(), password)
          : await remote.register(username.trim(), password);
      if (result.ok && result.value.ok) {
        setUsername('');
        setPassword('');
        setConfirmPassword('');
        await refreshAuthStatus();
      } else {
        setAuthError(result.ok ? result.value.error ?? '操作失败' : result.error.message);
      }
    } finally {
      setAuthPending(false);
    }
  };

  const onLogout = async (): Promise<void> => {
    if (logoutPending) return;
    setLogoutPending(true);
    try {
      const result = await remote.logout();
      if (result.ok && result.value.ok) {
        setAuthStatus('unauthenticated');
      } else {
        setAuthError(result.ok ? result.value.error ?? '退出失败' : result.error.message);
      }
    } finally {
      setLogoutPending(false);
    }
  };

  // ---- 基本配置：保存 ----
  const onSaveConfig = async (): Promise<void> => {
    if (configPending) return;
    setConfigSaved(false);
    setConfigError('');
    setConfigPending(true);
    try {
      const result = await remote.setConfig({
        companionName: companionName.trim(),
        userCallName: userCallName.trim(),
        showAffection,
        showBubble,
      });
      if (result.ok && result.value.ok) setConfigSaved(true);
      else setConfigError(result.ok ? result.value.error ?? '保存失败' : result.error.message);
    } finally {
      setConfigPending(false);
    }
  };

  // ---- 事件提醒：保存 + 事件动作 ----
  const onSaveReminder = async (): Promise<void> => {
    if (reminderPending) return;
    setReminderSaved(false);
    setReminderError('');
    setReminderPending(true);
    try {
      const interval = Number(reminderIntervalMin);
      const result = await remote.setConfig({
        reminderEnabled,
        reminderIntervalMin:
          Number.isFinite(interval) && interval > 0 ? interval : config?.reminderIntervalMin ?? 1,
      });
      if (result.ok && result.value.ok) setReminderSaved(true);
      else setReminderError(result.ok ? result.value.error ?? '保存失败' : result.error.message);
    } finally {
      setReminderPending(false);
    }
  };

  const onScheduleAction = async (item: ScheduleItem, action: 'enable' | 'disable' | 'delete'): Promise<void> => {
    if (scheduleActionId !== null) return;
    setReminderError('');
    setScheduleActionId(item.id);
    try {
      const result =
        action === 'enable'
          ? await remote.enableSchedule(item.id)
          : action === 'disable'
            ? await remote.disableSchedule(item.id)
            : await remote.deleteSchedule(item.id);
      if (result.ok && result.value.ok) {
        await refreshSchedules();
      } else {
        setReminderError(result.ok ? result.value.error ?? '操作失败' : result.error.message);
      }
    } finally {
      setScheduleActionId(null);
    }
  };

  return (
    <div className={styles['dsh-companion-settings-card']}>
      <header className={styles['dsh-companion-settings-card__header']}>
        <DeepSeekLogo className={styles['dsh-companion-settings-card__header-logo']} />
        <h3 className={styles['dsh-companion-settings-card__header-title']}>我的鲸鱼娘</h3>
      </header>
      {loadState === 'loading' && (
        <p className={styles['dsh-companion-settings-card__notice']}>加载中…</p>
      )}
      {loadState === 'error' && (
        <p role="alert" className={styles['dsh-companion-settings-card__error']}>
          {loadError}
        </p>
      )}

      <section className={styles['dsh-companion-settings-card__section']}>
        <h4 className={styles['dsh-companion-settings-card__title']}>账号与密码</h4>
        {authStatus === 'authenticated' ? (
          <div className={styles['dsh-companion-settings-card__row']}>
            <span className={styles['dsh-companion-settings-card__hint']}>已登录</span>
            <button type="button" disabled={logoutPending} onClick={() => void onLogout()}>
              {logoutPending ? '退出中…' : '退出登录'}
            </button>
          </div>
        ) : (
          <form onSubmit={(event) => void onSubmitAuth(event)}>
            <div className={styles['dsh-companion-settings-card__tabs']} role="group" aria-label="登录方式">
              <button
                type="button"
                aria-pressed={authMode === 'login'}
                className={styles['dsh-companion-settings-card__tab']}
                onClick={() => {
                  setAuthMode('login');
                  setAuthError('');
                }}
              >
                账号登录
              </button>
              <button
                type="button"
                aria-pressed={authMode === 'register'}
                className={styles['dsh-companion-settings-card__tab']}
                onClick={() => {
                  setAuthMode('register');
                  setAuthError('');
                }}
              >
                账号注册
              </button>
            </div>
            <label className={styles['dsh-companion-settings-card__field']}>
              <span className={styles['dsh-companion-settings-card__label']}>账号</span>
              <input
                value={username}
                autoComplete="username"
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label className={styles['dsh-companion-settings-card__field']}>
              <span className={styles['dsh-companion-settings-card__label']}>密码</span>
              <input
                type="password"
                value={password}
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {authMode === 'register' && (
              <label className={styles['dsh-companion-settings-card__field']}>
                <span className={styles['dsh-companion-settings-card__label']}>确认密码</span>
                <input
                  type="password"
                  value={confirmPassword}
                  autoComplete="new-password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>
            )}
            <div className={styles['dsh-companion-settings-card__actions']}>
              <button
                type="submit"
                className={styles['dsh-companion-settings-card__submit']}
                disabled={authPending}
              >
                {authPending ? '提交中…' : authMode === 'login' ? '登录' : '注册'}
              </button>
            </div>
            {authError !== '' && (
              <p role="alert" className={styles['dsh-companion-settings-card__error']}>
                {authError}
              </p>
            )}
          </form>
        )}
      </section>

      <section className={styles['dsh-companion-settings-card__section']}>
        <h4 className={styles['dsh-companion-settings-card__title']}>基本配置</h4>
        <label className={styles['dsh-companion-settings-card__field']}>
          <span className={styles['dsh-companion-settings-card__label']}>旅伴名称</span>
          <input value={companionName} onChange={(event) => setCompanionName(event.target.value)} />
        </label>
        <label className={styles['dsh-companion-settings-card__field']}>
          <span className={styles['dsh-companion-settings-card__label']}>对你的称呼</span>
          <input value={userCallName} onChange={(event) => setUserCallName(event.target.value)} />
        </label>
        <label className={styles['dsh-companion-settings-card__field']}>
          <input
            type="checkbox"
            role="switch"
            checked={showAffection}
            aria-label="显示好感度"
            onChange={(event) => setShowAffection(event.target.checked)}
          />
          <span className={styles['dsh-companion-settings-card__label']}>显示好感度</span>
        </label>
        <label className={styles['dsh-companion-settings-card__field']}>
          <input
            type="checkbox"
            role="switch"
            checked={showBubble}
            aria-label="显示气泡"
            onChange={(event) => setShowBubble(event.target.checked)}
          />
          <span className={styles['dsh-companion-settings-card__label']}>显示气泡</span>
        </label>
        <div className={styles['dsh-companion-settings-card__actions']}>
          <button
            type="button"
            className={styles['dsh-companion-settings-card__submit']}
            disabled={configPending}
            onClick={() => void onSaveConfig()}
          >
            {configPending ? '提交中…' : '保存配置'}
          </button>
        </div>
        {configError !== '' && (
          <p role="alert" className={styles['dsh-companion-settings-card__error']}>
            {configError}
          </p>
        )}
        {configSaved && (
          <p role="status" className={styles['dsh-companion-settings-card__hint']}>
            已保存
          </p>
        )}
      </section>

      <section className={styles['dsh-companion-settings-card__section']}>
        <h4 className={styles['dsh-companion-settings-card__title']}>事件提醒</h4>
        <label className={styles['dsh-companion-settings-card__field']}>
          <input
            type="checkbox"
            role="switch"
            checked={reminderEnabled}
            aria-label="定时提醒"
            onChange={(event) => setReminderEnabled(event.target.checked)}
          />
          <span className={styles['dsh-companion-settings-card__label']}>定时提醒</span>
        </label>
        <label className={styles['dsh-companion-settings-card__field']}>
          <span className={styles['dsh-companion-settings-card__label']}>提醒间隔(分钟)</span>
          <input
            type="number"
            min={1}
            value={reminderIntervalMin}
            onChange={(event) => setReminderIntervalMin(Number(event.target.value))}
          />
        </label>
        <div className={styles['dsh-companion-settings-card__actions']}>
          <button
            type="button"
            className={styles['dsh-companion-settings-card__submit']}
            disabled={reminderPending}
            onClick={() => void onSaveReminder()}
          >
            {reminderPending ? '提交中…' : '保存提醒'}
          </button>
        </div>
        {reminderError !== '' && (
          <p role="alert" className={styles['dsh-companion-settings-card__error']}>
            {reminderError}
          </p>
        )}
        {reminderSaved && (
          <p role="status" className={styles['dsh-companion-settings-card__hint']}>
            已保存
          </p>
        )}
        {schedules.length > 0 && (
          <ul className={styles['dsh-companion-settings-card__list']}>
            {schedules.map((item) => (
              <li key={item.id} className={styles['dsh-companion-settings-card__item']} data-testid={`schedule-item-${item.id}`}>
                <span className={styles['dsh-companion-settings-card__item-title']}>{item.title}</span>
                <span className={styles['dsh-companion-settings-card__hint']}>
                  {item.enabled ? '已启用' : '已停用'}
                </span>
                <div className={styles['dsh-companion-settings-card__item-actions']}>
                  <button
                    type="button"
                    disabled={scheduleActionId === item.id}
                    onClick={() => void onScheduleAction(item, item.enabled ? 'disable' : 'enable')}
                  >
                    {item.enabled ? '停用' : '启用'}
                  </button>
                  <button
                    type="button"
                    disabled={scheduleActionId === item.id}
                    onClick={() => void onScheduleAction(item, 'delete')}
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
