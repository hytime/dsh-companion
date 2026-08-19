import {
  isCompanionEmotion,
  normalizeSkillStatus,
  statusFallbackEmotion,
  type CompanionEmotion,
  type SkillStatus,
} from '../contracts/companion-status';

export interface StatusUpdate {
  status: SkillStatus;
  statusMessage?: string;
  emotion?: CompanionEmotion;
  lastError?: string;
}

const MAX_TOOL_SUMMARY = 160;
const SENSITIVE_KEY = /(password|token|secret|apikey|authorization|credential|cookie)/i;

export function normalizeStatusUpdate(raw: unknown): StatusUpdate {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { status: 'idle' };
  const record = raw as Record<string, unknown>;
  const status = normalizeSkillStatus(record.status);
  const update: StatusUpdate = { status };
  if (typeof record.statusMessage === 'string' && record.statusMessage !== '') update.statusMessage = record.statusMessage;
  if (record.emotion !== undefined) {
    update.emotion = isKnownEmotion(record.emotion) ? record.emotion : statusFallbackEmotion(status);
  }
  if (typeof record.lastError === 'string' && record.lastError !== '') update.lastError = record.lastError;
  return update;
}

export function isMainAgent(agent: unknown): boolean {
  if (agent === null || typeof agent !== 'object') return false;
  const session = (agent as { session?: unknown }).session;
  if (session === null || typeof session !== 'object') return false;
  const header = (session as { header?: unknown }).header;
  if (header === null || typeof header !== 'object') return false;
  return (header as { parentSession?: unknown }).parentSession === undefined;
}

export function summarizeToolContext(name: string, args: unknown): string {
  const safe = redact(args);
  let serialized = '';
  try { serialized = JSON.stringify(safe) ?? ''; } catch { serialized = ''; }
  const raw = serialized === '' || serialized === '{}' ? name : `${name} ${serialized}`;
  return raw.length <= MAX_TOOL_SUMMARY ? raw : `${raw.slice(0, MAX_TOOL_SUMMARY - 1)}…`;
}

export function mergeStatusUpdate(base: StatusUpdate, patch: Partial<StatusUpdate>): StatusUpdate {
  const result: StatusUpdate = { ...base };
  if (patch.status !== undefined) result.status = normalizeSkillStatus(patch.status);
  if (typeof patch.statusMessage === 'string' && patch.statusMessage !== '') result.statusMessage = patch.statusMessage;
  if (patch.emotion !== undefined) {
    result.emotion = isKnownEmotion(patch.emotion) ? patch.emotion : statusFallbackEmotion(result.status);
  }
  if (typeof patch.lastError === 'string' && patch.lastError !== '') result.lastError = patch.lastError;
  return result;
}

function isKnownEmotion(value: unknown): value is CompanionEmotion {
  return isCompanionEmotion(value);
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redact(child);
    }
    return result;
  }
  return value;
}
