/**
 * travelNoteCompanion Remote 命名空间的 Client 侧类型契约。
 *
 * 这些结构类型是 Host 侧（settings-rpc / settings-store / companion-commands）
 * 返回类型的 Client 镜像：client 半不能 import host 模块（host 半 import
 * node:fs 等 Node 内置，会污染浏览器 bundle），故在此按形状声明一遍，
 * 字段与 Host @Remote 方法签名一一对应。
 *
 * RemoteResult<T> 是 gateway 的传输信封：{ ok:true, value } | { ok:false, error }。
 * 业务信封（AuthStatusResult / GetConfigResult 等）是 value 的载荷，调用方
 * 需要解两层：先 result.ok，再 result.value.ok。
 */

/** gateway 传输信封：调用面返回值的统一包装。 */
export type RemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

/** 插件配置 Schema（~/.hy-companion/config.json，与 settings-store 一致）。 */
export interface CompanionSettings {
  companionName: string;
  userCallName: string;
  showAffection: boolean;
  showBubble: boolean;
  reminderEnabled: boolean;
  reminderIntervalMin: number;
}

/** authStatus 业务信封。 */
export type AuthStatusResult =
  | { ok: true; status: 'authenticated' | 'unauthenticated' }
  | { ok: false; error: string };

/** getConfig 业务信封：ok 时携带完整配置。 */
export type GetConfigResult = ({ ok: true } & CompanionSettings) | { ok: false; error: string };

/** login/register/logout 与 schedule 动作的通用业务信封。 */
export interface CommandResult {
  ok: boolean;
  error?: string;
}

/** setConfig 业务信封。 */
export interface WriteResult {
  ok: boolean;
  error?: string;
}

/** 一条定时陪伴事件（hyc schedule list 的条目形状）。 */
export interface ScheduleItem {
  id: string;
  title: string;
  message: string;
  enabled: boolean;
  repeatRule: string;
  slot: string;
  timeOfDay: string;
  createdAt: string;
  updatedAt: string;
  confidence: number;
  sourceQuery: string | null;
  userId: string;
}

/** listSchedules 业务信封。 */
export interface ScheduleListResult {
  ok: boolean;
  items?: ScheduleItem[];
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  error?: string;
}

/** buddy RPC 的载荷（鲸鱼窗轮询用）。 */
export interface BuddyResult {
  message: string;
  title: string;
  dueAt: string;
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

/**
 * ctx.remote.travelNoteCompanion 的完整调用面：4 个鲸鱼窗既有方法 +
 * 10 个配置页方法（task 3 新增 @Remote，task 4 在 remote-contract 补齐描述符）。
 */
export interface CompanionRemoteFace {
  buddy(): Promise<RemoteResult<BuddyResult>>;
  asset(frame: string): Promise<RemoteResult<{ url: string } | null>>;
  status(): Promise<RemoteResult<{ status: string; lastError?: string }>>;
  latestReply(): Promise<RemoteResult<{ reply: string; emotion: string } | null>>;
  authStatus(): Promise<RemoteResult<AuthStatusResult>>;
  login(username: string, password: string): Promise<RemoteResult<CommandResult>>;
  register(username: string, password: string): Promise<RemoteResult<CommandResult>>;
  logout(): Promise<RemoteResult<CommandResult>>;
  getConfig(): Promise<RemoteResult<GetConfigResult>>;
  setConfig(partial: Partial<CompanionSettings>): Promise<RemoteResult<WriteResult>>;
  listSchedules(page?: number, pageSize?: number): Promise<RemoteResult<ScheduleListResult>>;
  createSchedule(text: string): Promise<RemoteResult<CommandResult>>;
  enableSchedule(id: string): Promise<RemoteResult<CommandResult>>;
  disableSchedule(id: string): Promise<RemoteResult<CommandResult>>;
  deleteSchedule(id: string): Promise<RemoteResult<CommandResult>>;
}
