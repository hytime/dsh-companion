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
  BUDDY_ENDPOINT_ID,
  BUDDY_METHOD,
  BUDDY_RESULT_SYMBOL,
  LATEST_REPLY_ENDPOINT_ID,
  LATEST_REPLY_METHOD,
  LATEST_REPLY_RESULT_SYMBOL,
  REMOTE_NAMESPACE,
  REMOTE_PACKAGE,
  REMOTE_SERVICE,
  STATUS_ENDPOINT_ID,
  STATUS_METHOD,
  STATUS_RESULT_SYMBOL,
} from '../contracts/remote-descriptors';

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

const statusResult = schema<{ status: string; lastError?: string }>((value) => {
  if (typeof value !== 'object' || value === null) throw new TypeError('expected status object');
  const record = value as Record<string, unknown>;
  if (typeof record.status !== 'string') throw new TypeError('expected status');
  return {
    status: record.status,
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

export const travelNoteCompanionRemote: TypertRemoteContribution = {
  package: REMOTE_PACKAGE,
  descriptors: [buddyDescriptor, assetDescriptor, statusDescriptor, latestReplyDescriptor],
};
