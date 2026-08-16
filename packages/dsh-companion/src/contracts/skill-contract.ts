/**
 * Travel Note Skill/CLI 纯 JSON 契约。
 *
 * 前端插件与 DSH Host Skill 适配层之间的最小数据对象。这里只包含可
 * 序列化的标量/结构数据，绝不携带 Token、API Key、Session、live Cordis
 * 对象或 CLI 内部堆栈。
 */

/** 思考强度：缺省由 Host/后端归一化为 medium。 */
export type ReasoningEffort = 'low' | 'medium' | 'high';

/** Skill 输入：来自当前 DSH 对话框的用户意图，附加可选会话标识与强度。 */
export interface TravelNoteSkillInput {
  query: string;
  conversationId?: string;
  reasoningEffort?: ReasoningEffort;
}

/** CLI 结构化结果：ok 为失败时必须有 errorCode。 */
export interface TravelNoteCLIResult {
  ok: boolean;
  text?: string;
  conversationId?: string;
  emotion?: CompanionEmotion;
  errorCode?: string;
  errorMessage?: string;
}

/** 鲸鱼窗口状态机的全部合法状态。 */
export type SkillStatus =
  | 'idle'
  | 'connecting'
  | 'thinking'
  | 'replying'
  | 'success'
  | 'error'
  | 'cancelled';

/**
 * 旅伴表情，与 apps/web Phaser CompanionEmotion 完全对齐
 * （COMPANION_EMOTIONS 元组：idle/thinking/talking/happy/shy/surprised）。
 */
export type CompanionEmotion = 'idle' | 'thinking' | 'talking' | 'happy' | 'shy' | 'surprised';

/** 好感度/亲密度全量参数（hyc affection 的结构化投影）。 */
export interface AffectionStats {
  /** 好感度（主指标，鲸鱼旁进度条）。 */
  affectionScore: number;
  /** 亲密度。 */
  intimacyScore: number;
  /** 信任感。 */
  trustScore: number;
  /** 活跃度。 */
  engagementScore: number;
  /** 话痨系数。 */
  talkativenessFactor: number;
  /** 主动系数。 */
  proactiveProbabilityFactor: number;
  /** 冷却系数。 */
  cooldownFactor: number;
  /** 最近评价日（YYYY-MM-DD，可能为空）。 */
  lastEvaluatedDate?: string;
  /** 最近宣布日（YYYY-MM-DD，可能为空）。 */
  lastAnnouncedDate?: string;
}

/**
 * 角色活动阶段，与 apps/web Phaser CharacterActivity 完全对齐。
 * 由 SkillStatus 归一化而来（见 skillStatusToActivity）。
 */
export type CharacterActivity = 'idle' | 'listening' | 'thinking' | 'speaking';

const REASONING_EFFORTS: readonly ReasoningEffort[] = ['low', 'medium', 'high'];
const SKILL_STATUSES: readonly SkillStatus[] = [
  'idle',
  'connecting',
  'thinking',
  'replying',
  'success',
  'error',
  'cancelled',
];
const COMPANION_EMOTIONS: readonly CompanionEmotion[] = [
  'idle',
  'thinking',
  'talking',
  'happy',
  'shy',
  'surprised',
];
const CHARACTER_ACTIVITIES: readonly CharacterActivity[] = [
  'idle',
  'listening',
  'thinking',
  'speaking',
];

/** 字段名包含以下任意子串即视为敏感，拒绝进入结果。 */
const SENSITIVE_FIELD_MARKERS: readonly string[] = [
  'token',
  'apikey',
  'api_key',
  'authorization',
  'password',
  'secret',
  'stack',
];

/**
 * 归一化思考强度；缺省或非法值回退为 medium。
 */
export function normalizeReasoningEffort(raw: unknown): ReasoningEffort {
  return REASONING_EFFORTS.includes(raw as ReasoningEffort) ? (raw as ReasoningEffort) : 'medium';
}

/**
 * 归一化 Skill 状态；未知状态回退为 idle。
 */
export function normalizeSkillStatus(raw: unknown): SkillStatus {
  return SKILL_STATUSES.includes(raw as SkillStatus) ? (raw as SkillStatus) : 'idle';
}

/**
 * 归一化旅伴表情；非法/缺省值回退为 idle（对齐 Phaser sanitizeEmotion）。
 */
export function normalizeCompanionEmotion(raw: unknown): CompanionEmotion {
  return COMPANION_EMOTIONS.includes(raw as CompanionEmotion) ? (raw as CompanionEmotion) : 'idle';
}

/**
 * Skill 状态 → Phaser 角色活动阶段（对齐 CharacterActivity 语义）：
 * - idle/success → idle
 * - connecting → listening（正在连接/倾听输入）
 * - thinking → thinking（旅伴思考中）
 * - replying → speaking（正在返回当前对话）
 * - error → idle（异常回落到待机）
 * - cancelled → idle（取消回落到待机）
 */
export function skillStatusToActivity(status: SkillStatus): CharacterActivity {
  switch (status) {
    case 'connecting':
      return 'listening';
    case 'thinking':
      return 'thinking';
    case 'replying':
      return 'speaking';
    default:
      return 'idle';
  }
}

/**
 * 校验是否为合法 CompanionEmotion（对齐 Phaser isCompanionEmotion）。
 */
export function isCompanionEmotion(value: unknown): value is CompanionEmotion {
  return COMPANION_EMOTIONS.includes(value as CompanionEmotion);
}

/**
 * 校验是否为合法 CharacterActivity。
 */
export function isCharacterActivity(value: unknown): value is CharacterActivity {
  return CHARACTER_ACTIVITIES.includes(value as CharacterActivity);
}

/**
 * 解析并校验 CLI 结果。未知字段忽略；非法核心字段丢弃；非对象输入或
 * 携带敏感字段的结果转为结构化错误。
 */
export function parseTravelNoteCLIResult(raw: unknown): TravelNoteCLIResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errorCode: 'invalid-result', errorMessage: 'CLI 结果不是对象' };
  }
  const record = raw as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    const normalized = key.toLowerCase().replace(/_/g, '');
    if (SENSITIVE_FIELD_MARKERS.some((marker) => normalized.includes(marker))) {
      return {
        ok: false,
        errorCode: 'sensitive-field',
        errorMessage: `CLI 结果包含敏感字段: ${key}`,
      };
    }
  }

  const ok = record.ok === true;
  const text = typeof record.text === 'string' ? record.text : undefined;
  const conversationId =
    typeof record.conversationId === 'string' ? record.conversationId : undefined;
  const emotion =
    record.emotion === undefined ? undefined : normalizeCompanionEmotion(record.emotion);
  const errorCode = typeof record.errorCode === 'string' ? record.errorCode : undefined;
  const errorMessage = typeof record.errorMessage === 'string' ? record.errorMessage : undefined;

  if (!ok && errorCode === undefined) {
    return { ok: false, errorCode: 'unknown-error', errorMessage: errorMessage ?? 'CLI 执行失败' };
  }

  return { ok, text, conversationId, emotion, errorCode, errorMessage };
}
