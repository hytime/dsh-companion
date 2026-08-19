import type {
  InvocationDescriptor,
  TypertCodec,
  TypertRemoteContribution,
  TypertSchema,
} from '@deepseek-ai/dsh-typert-protocol';
import {
  ASSET_ENDPOINT_ID,
  ASSET_FRAME_SYMBOL,
  ASSET_METHOD,
  ASSET_RESULT_SYMBOL,
  AUTH_STATUS_ENDPOINT_ID,
  AUTH_STATUS_METHOD,
  AUTH_STATUS_RESULT_SYMBOL,
  BUDDY_ENDPOINT_ID,
  BUDDY_METHOD,
  BUDDY_RESULT_SYMBOL,
  CREATE_SCHEDULE_ENDPOINT_ID,
  CREATE_SCHEDULE_METHOD,
  CREATE_SCHEDULE_RESULT_SYMBOL,
  CREATE_SCHEDULE_TEXT_SYMBOL,
  DELETE_SCHEDULE_ENDPOINT_ID,
  DELETE_SCHEDULE_ID_SYMBOL,
  DELETE_SCHEDULE_METHOD,
  DELETE_SCHEDULE_RESULT_SYMBOL,
  DISABLE_SCHEDULE_ENDPOINT_ID,
  DISABLE_SCHEDULE_ID_SYMBOL,
  DISABLE_SCHEDULE_METHOD,
  DISABLE_SCHEDULE_RESULT_SYMBOL,
  ENABLE_SCHEDULE_ENDPOINT_ID,
  ENABLE_SCHEDULE_ID_SYMBOL,
  ENABLE_SCHEDULE_METHOD,
  ENABLE_SCHEDULE_RESULT_SYMBOL,
  GET_CONFIG_ENDPOINT_ID,
  GET_CONFIG_METHOD,
  GET_CONFIG_RESULT_SYMBOL,
  LATEST_REPLY_ENDPOINT_ID,
  LATEST_REPLY_METHOD,
  LATEST_REPLY_RESULT_SYMBOL,
  LIST_SCHEDULES_ENDPOINT_ID,
  LIST_SCHEDULES_METHOD,
  LIST_SCHEDULES_PAGE_SIZE_SYMBOL,
  LIST_SCHEDULES_PAGE_SYMBOL,
  LIST_SCHEDULES_RESULT_SYMBOL,
  LOGIN_ENDPOINT_ID,
  LOGIN_METHOD,
  LOGIN_PASSWORD_SYMBOL,
  LOGIN_RESULT_SYMBOL,
  LOGIN_USERNAME_SYMBOL,
  LOGOUT_ENDPOINT_ID,
  LOGOUT_METHOD,
  LOGOUT_RESULT_SYMBOL,
  REGISTER_ENDPOINT_ID,
  REGISTER_METHOD,
  REGISTER_PASSWORD_SYMBOL,
  REGISTER_RESULT_SYMBOL,
  REGISTER_USERNAME_SYMBOL,
  REMOTE_NAMESPACE,
  REMOTE_PACKAGE,
  REMOTE_SERVICE,
  SET_CONFIG_ENDPOINT_ID,
  SET_CONFIG_METHOD,
  SET_CONFIG_PARTIAL_SYMBOL,
  SET_CONFIG_RESULT_SYMBOL,
  SELECT_AGENT_ENDPOINT_ID,
  SELECT_AGENT_METHOD,
  SELECT_AGENT_RESULT_SYMBOL,
  SELECT_AGENT_SESSION_SYMBOL,
  STATUS_ENDPOINT_ID,
  STATUS_METHOD,
  STATUS_RESULT_SYMBOL,
} from '../contracts/remote-descriptors';
import type {
  AuthStatusResult,
  CommandResult,
  CompanionSettings,
  GetConfigResult,
  ScheduleItem,
  ScheduleListResult,
  WriteResult,
} from './companion-types';

function schema<T>(parse: (value: unknown) => T): TypertSchema<T> {
  return { parse };
}

const stringSchema = schema<string>((value) => {
  if (typeof value !== 'string') throw new TypeError('expected string');
  return value;
});

const buddyResult = schema<{
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
}>((value) => {
  if (typeof value !== 'object' || value === null) throw new TypeError('expected buddy object');
  const record = value as Record<string, unknown>;
  for (const key of ['message', 'title', 'dueAt', 'companionName', 'userCallName']) {
    if (typeof record[key] !== 'string') throw new TypeError(`expected ${key}`);
  }
  for (const key of [
    'affectionScore',
    'intimacyScore',
    'trustScore',
    'engagementScore',
    'talkativenessFactor',
    'proactiveProbabilityFactor',
    'cooldownFactor',
  ]) {
    if (typeof record[key] !== 'number') throw new TypeError(`expected ${key}`);
  }
  for (const key of ['lastEvaluatedDate', 'lastAnnouncedDate']) {
    if (typeof record[key] !== 'string') throw new TypeError(`expected ${key}`);
  }
  return record as {
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
  };
});

const assetResult = schema<{ url: string } | null>((value) => {
  if (value === null) return null;
  if (typeof value !== 'object' || typeof (value as Record<string, unknown>).url !== 'string') {
    throw new TypeError('expected asset result');
  }
  return value as { url: string };
});

const buddyDescriptor: InvocationDescriptor = {
  id: BUDDY_ENDPOINT_ID,
  service: REMOTE_SERVICE,
  namespace: REMOTE_NAMESPACE,
  method: BUDDY_METHOD,
  invocation: { kind: 'direct' },
  parameters: [],
  result: { mode: 'strict', typeSymbol: BUDDY_RESULT_SYMBOL, schema: buddyResult } as TypertCodec,
};

const assetDescriptor: InvocationDescriptor = {
  id: ASSET_ENDPOINT_ID,
  service: REMOTE_SERVICE,
  namespace: REMOTE_NAMESPACE,
  method: ASSET_METHOD,
  invocation: { kind: 'direct' },
  parameters: [
    {
      name: 'frame',
      wire: 'frame',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: ASSET_FRAME_SYMBOL, schema: stringSchema } as TypertCodec,
    },
  ],
  result: { mode: 'strict', typeSymbol: ASSET_RESULT_SYMBOL, schema: assetResult } as TypertCodec,
};

const statusResult = schema<{ status: string; statusMessage?: string; emotion?: string; lastError?: string }>((value) => {
  if (typeof value !== 'object' || value === null) throw new TypeError('expected status object');
  const record = value as Record<string, unknown>;
  if (typeof record.status !== 'string') throw new TypeError('expected status');
  return {
    status: record.status,
    ...(typeof record.statusMessage === 'string' ? { statusMessage: record.statusMessage } : {}),
    ...(typeof record.emotion === 'string' ? { emotion: record.emotion } : {}),
    ...(typeof record.lastError === 'string' ? { lastError: record.lastError } : {}),
  };
});

const statusDescriptor: InvocationDescriptor = {
  id: STATUS_ENDPOINT_ID,
  service: REMOTE_SERVICE,
  namespace: REMOTE_NAMESPACE,
  method: STATUS_METHOD,
  invocation: { kind: 'direct' },
  parameters: [],
  result: { mode: 'strict', typeSymbol: STATUS_RESULT_SYMBOL, schema: statusResult } as TypertCodec,
};

const selectAgentSessionSchema = schema<string | null>((value) => {
  if (value !== null && typeof value !== 'string') throw new TypeError('expected sessionId or null');
  return value;
});

const selectAgentResult = schema<{ ok: true }>((value) => {
  if (typeof value !== 'object' || value === null || (value as Record<string, unknown>).ok !== true) {
    throw new TypeError('expected selectAgent result');
  }
  return { ok: true as const };
});

const selectAgentDescriptor: InvocationDescriptor = {
  id: SELECT_AGENT_ENDPOINT_ID,
  service: REMOTE_SERVICE,
  namespace: REMOTE_NAMESPACE,
  method: SELECT_AGENT_METHOD,
  invocation: { kind: 'direct' },
  parameters: [
    { name: 'sessionId', wire: 'sessionId', source: 'json', codec: { mode: 'strict', typeSymbol: SELECT_AGENT_SESSION_SYMBOL, schema: selectAgentSessionSchema } as TypertCodec },
  ],
  result: { mode: 'strict', typeSymbol: SELECT_AGENT_RESULT_SYMBOL, schema: selectAgentResult } as TypertCodec,
};

const latestReplyResult = schema<{ reply: string; emotion: string } | null>((value) => {
  if (value === null) return null;
  if (typeof value !== 'object' || value === null) throw new TypeError('expected latestReply object');
  const record = value as Record<string, unknown>;
  if (typeof record.reply !== 'string') throw new TypeError('expected reply');
  return {
    reply: record.reply,
    emotion: typeof record.emotion === 'string' ? record.emotion : 'idle',
  };
});

const latestReplyDescriptor: InvocationDescriptor = {
  id: LATEST_REPLY_ENDPOINT_ID,
  service: REMOTE_SERVICE,
  namespace: REMOTE_NAMESPACE,
  method: LATEST_REPLY_METHOD,
  invocation: { kind: 'direct' },
  parameters: [],
  result: { mode: 'strict', typeSymbol: LATEST_REPLY_RESULT_SYMBOL, schema: latestReplyResult } as TypertCodec,
};

// ---- 配置页 RPC 描述符（task 3 Host @Remote 方法，strict 模式镜像） ----
// wire 参数名与 Host @Remote 方法参数名一致（username/password/id/partial），
// gateway 按 wire 名从 args 取参后按位传入 Host 方法。

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new TypeError(`expected ${field}`);
  return value;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`expected ${field}`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number') throw new TypeError(`expected ${field}`);
  return value;
}

/** CommandResult / WriteResult 共用形状（两者结构相同）。 */
const okResultSchema = schema<CommandResult>((value) => {
  if (typeof value !== 'object' || value === null) throw new TypeError('expected result object');
  const record = value as Record<string, unknown>;
  return {
    ok: requireBoolean(record.ok, 'ok'),
    ...(typeof record.error === 'string' ? { error: record.error } : {}),
  };
});

const authStatusResult = schema<AuthStatusResult>((value) => {
  if (typeof value !== 'object' || value === null) throw new TypeError('expected authStatus result');
  const record = value as Record<string, unknown>;
  if (record.ok === true) {
    const status = record.status;
    if (status !== 'authenticated' && status !== 'unauthenticated') {
      throw new TypeError('expected status');
    }
    return { ok: true as const, status };
  }
  return { ok: false as const, error: requireString(record.error, 'error') };
});

const getConfigResult = schema<GetConfigResult>((value) => {
  if (typeof value !== 'object' || value === null) throw new TypeError('expected getConfig result');
  const record = value as Record<string, unknown>;
  if (record.ok === false) {
    return { ok: false as const, error: requireString(record.error, 'error') };
  }
  return {
    ok: true as const,
    companionName: requireString(record.companionName, 'companionName'),
    userCallName: requireString(record.userCallName, 'userCallName'),
    showAffection: requireBoolean(record.showAffection, 'showAffection'),
    showBubble: requireBoolean(record.showBubble, 'showBubble'),
    reminderEnabled: requireBoolean(record.reminderEnabled, 'reminderEnabled'),
    reminderIntervalMin: requireNumber(record.reminderIntervalMin, 'reminderIntervalMin'),
  };
});

const settingsPartial = schema<Partial<CompanionSettings>>((value) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('expected settings object');
  }
  const record = value as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  const checks: Record<string, (candidate: unknown) => boolean> = {
    companionName: (candidate) => typeof candidate === 'string',
    userCallName: (candidate) => typeof candidate === 'string',
    showAffection: (candidate) => typeof candidate === 'boolean',
    showBubble: (candidate) => typeof candidate === 'boolean',
    reminderEnabled: (candidate) => typeof candidate === 'boolean',
    reminderIntervalMin: (candidate) => typeof candidate === 'number',
  };
  for (const [key, check] of Object.entries(checks)) {
    if (record[key] === undefined) continue;
    if (!check(record[key])) throw new TypeError(`expected ${key}`);
    picked[key] = record[key];
  }
  return picked;
});

const scheduleItem = schema<ScheduleItem>((value) => {
  if (typeof value !== 'object' || value === null) throw new TypeError('expected schedule item');
  const record = value as Record<string, unknown>;
  return {
    id: requireString(record.id, 'id'),
    title: requireString(record.title, 'title'),
    message: requireString(record.message, 'message'),
    enabled: requireBoolean(record.enabled, 'enabled'),
    repeatRule: requireString(record.repeatRule, 'repeatRule'),
    slot: requireString(record.slot, 'slot'),
    timeOfDay: requireString(record.timeOfDay, 'timeOfDay'),
    createdAt: requireString(record.createdAt, 'createdAt'),
    updatedAt: requireString(record.updatedAt, 'updatedAt'),
    confidence: requireNumber(record.confidence, 'confidence'),
    sourceQuery: record.sourceQuery === null ? null : requireString(record.sourceQuery, 'sourceQuery'),
    userId: requireString(record.userId, 'userId'),
  };
});

const scheduleListResult = schema<ScheduleListResult>((value) => {
  if (typeof value !== 'object' || value === null) throw new TypeError('expected schedule list result');
  const record = value as Record<string, unknown>;
  const ok = requireBoolean(record.ok, 'ok');
  if (ok === false) {
    return { ok: false as const, ...(typeof record.error === 'string' ? { error: record.error } : {}) };
  }
  if (!Array.isArray(record.items)) throw new TypeError('expected items');
  return {
    ok: true as const,
    items: record.items.map((item) => scheduleItem.parse(item)),
    ...(typeof record.page === 'number' ? { page: record.page } : {}),
    ...(typeof record.pageSize === 'number' ? { pageSize: record.pageSize } : {}),
    ...(typeof record.total === 'number' ? { total: record.total } : {}),
    ...(typeof record.totalPages === 'number' ? { totalPages: record.totalPages } : {}),
  };
});

const authStatusDescriptor: InvocationDescriptor = {
  id: AUTH_STATUS_ENDPOINT_ID,
  service: REMOTE_SERVICE,
  namespace: REMOTE_NAMESPACE,
  method: AUTH_STATUS_METHOD,
  invocation: { kind: 'direct' },
  parameters: [],
  result: { mode: 'strict', typeSymbol: AUTH_STATUS_RESULT_SYMBOL, schema: authStatusResult } as TypertCodec,
};

const loginDescriptor: InvocationDescriptor = {
  id: LOGIN_ENDPOINT_ID,
  service: REMOTE_SERVICE,
  namespace: REMOTE_NAMESPACE,
  method: LOGIN_METHOD,
  invocation: { kind: 'direct' },
  parameters: [
    { name: 'username', wire: 'username', source: 'json', codec: { mode: 'strict', typeSymbol: LOGIN_USERNAME_SYMBOL, schema: stringSchema } as TypertCodec },
    { name: 'password', wire: 'password', source: 'json', codec: { mode: 'strict', typeSymbol: LOGIN_PASSWORD_SYMBOL, schema: stringSchema } as TypertCodec },
  ],
  result: { mode: 'strict', typeSymbol: LOGIN_RESULT_SYMBOL, schema: okResultSchema } as TypertCodec,
};

const registerDescriptor: InvocationDescriptor = {
  id: REGISTER_ENDPOINT_ID,
  service: REMOTE_SERVICE,
  namespace: REMOTE_NAMESPACE,
  method: REGISTER_METHOD,
  invocation: { kind: 'direct' },
  parameters: [
    { name: 'username', wire: 'username', source: 'json', codec: { mode: 'strict', typeSymbol: REGISTER_USERNAME_SYMBOL, schema: stringSchema } as TypertCodec },
    { name: 'password', wire: 'password', source: 'json', codec: { mode: 'strict', typeSymbol: REGISTER_PASSWORD_SYMBOL, schema: stringSchema } as TypertCodec },
  ],
  result: { mode: 'strict', typeSymbol: REGISTER_RESULT_SYMBOL, schema: okResultSchema } as TypertCodec,
};

const logoutDescriptor: InvocationDescriptor = {
  id: LOGOUT_ENDPOINT_ID,
  service: REMOTE_SERVICE,
  namespace: REMOTE_NAMESPACE,
  method: LOGOUT_METHOD,
  invocation: { kind: 'direct' },
  parameters: [],
  result: { mode: 'strict', typeSymbol: LOGOUT_RESULT_SYMBOL, schema: okResultSchema } as TypertCodec,
};

const getConfigDescriptor: InvocationDescriptor = {
  id: GET_CONFIG_ENDPOINT_ID,
  service: REMOTE_SERVICE,
  namespace: REMOTE_NAMESPACE,
  method: GET_CONFIG_METHOD,
  invocation: { kind: 'direct' },
  parameters: [],
  result: { mode: 'strict', typeSymbol: GET_CONFIG_RESULT_SYMBOL, schema: getConfigResult } as TypertCodec,
};

const setConfigDescriptor: InvocationDescriptor = {
  id: SET_CONFIG_ENDPOINT_ID,
  service: REMOTE_SERVICE,
  namespace: REMOTE_NAMESPACE,
  method: SET_CONFIG_METHOD,
  invocation: { kind: 'direct' },
  parameters: [
    { name: 'partial', wire: 'partial', source: 'json', codec: { mode: 'strict', typeSymbol: SET_CONFIG_PARTIAL_SYMBOL, schema: settingsPartial } as TypertCodec },
  ],
  result: { mode: 'strict', typeSymbol: SET_CONFIG_RESULT_SYMBOL, schema: okResultSchema as TypertSchema<WriteResult> } as TypertCodec,
};

const listSchedulesDescriptor: InvocationDescriptor = {
  id: LIST_SCHEDULES_ENDPOINT_ID,
  service: REMOTE_SERVICE,
  namespace: REMOTE_NAMESPACE,
  method: LIST_SCHEDULES_METHOD,
  invocation: { kind: 'direct' },
  parameters: [
    { name: 'page', wire: 'page', source: 'json', acceptsUndefined: true, codec: { mode: 'strict', typeSymbol: LIST_SCHEDULES_PAGE_SYMBOL, schema: schema<number>((value) => requireNumber(value, 'page')) } as TypertCodec },
    { name: 'pageSize', wire: 'pageSize', source: 'json', acceptsUndefined: true, codec: { mode: 'strict', typeSymbol: LIST_SCHEDULES_PAGE_SIZE_SYMBOL, schema: schema<number>((value) => requireNumber(value, 'pageSize')) } as TypertCodec },
  ],
  result: { mode: 'strict', typeSymbol: LIST_SCHEDULES_RESULT_SYMBOL, schema: scheduleListResult } as TypertCodec,
};

const createScheduleDescriptor: InvocationDescriptor = {
  id: CREATE_SCHEDULE_ENDPOINT_ID,
  service: REMOTE_SERVICE,
  namespace: REMOTE_NAMESPACE,
  method: CREATE_SCHEDULE_METHOD,
  invocation: { kind: 'direct' },
  parameters: [
    { name: 'text', wire: 'text', source: 'json', codec: { mode: 'strict', typeSymbol: CREATE_SCHEDULE_TEXT_SYMBOL, schema: stringSchema } as TypertCodec },
  ],
  result: { mode: 'strict', typeSymbol: CREATE_SCHEDULE_RESULT_SYMBOL, schema: okResultSchema } as TypertCodec,
};

function scheduleActionDescriptor(
  endpointId: string,
  method: string,
  resultSymbol: string,
  idSymbol: string,
): InvocationDescriptor {
  return {
    id: endpointId,
    service: REMOTE_SERVICE,
    namespace: REMOTE_NAMESPACE,
    method,
    invocation: { kind: 'direct' },
    parameters: [
      { name: 'id', wire: 'id', source: 'json', codec: { mode: 'strict', typeSymbol: idSymbol, schema: stringSchema } as TypertCodec },
    ],
    result: { mode: 'strict', typeSymbol: resultSymbol, schema: okResultSchema } as TypertCodec,
  };
}

const enableScheduleDescriptor = scheduleActionDescriptor(
  ENABLE_SCHEDULE_ENDPOINT_ID,
  ENABLE_SCHEDULE_METHOD,
  ENABLE_SCHEDULE_RESULT_SYMBOL,
  ENABLE_SCHEDULE_ID_SYMBOL,
);

const disableScheduleDescriptor = scheduleActionDescriptor(
  DISABLE_SCHEDULE_ENDPOINT_ID,
  DISABLE_SCHEDULE_METHOD,
  DISABLE_SCHEDULE_RESULT_SYMBOL,
  DISABLE_SCHEDULE_ID_SYMBOL,
);

const deleteScheduleDescriptor = scheduleActionDescriptor(
  DELETE_SCHEDULE_ENDPOINT_ID,
  DELETE_SCHEDULE_METHOD,
  DELETE_SCHEDULE_RESULT_SYMBOL,
  DELETE_SCHEDULE_ID_SYMBOL,
);

export const travelNoteCompanionRemote: TypertRemoteContribution = {
  package: REMOTE_PACKAGE,
  descriptors: [
    buddyDescriptor,
    assetDescriptor,
    statusDescriptor,
    selectAgentDescriptor,
    latestReplyDescriptor,
    authStatusDescriptor,
    loginDescriptor,
    registerDescriptor,
    logoutDescriptor,
    getConfigDescriptor,
    setConfigDescriptor,
    listSchedulesDescriptor,
    createScheduleDescriptor,
    enableScheduleDescriptor,
    disableScheduleDescriptor,
    deleteScheduleDescriptor,
  ],
};
