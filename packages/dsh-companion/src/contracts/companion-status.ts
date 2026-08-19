export type SkillStatus =
  | 'idle'
  | 'connecting'
  | 'thinking'
  | 'replying'
  | 'success'
  | 'error'
  | 'cancelled';

export type CompanionEmotion = 'idle' | 'thinking' | 'talking' | 'happy' | 'shy' | 'surprised';
export type FrameName = 'idle' | 'happy' | 'smile' | 'laugh' | 'shy' | 'surprised';

export const SKILL_STATUSES = ['idle', 'connecting', 'thinking', 'replying', 'success', 'error', 'cancelled'] as const satisfies readonly SkillStatus[];
export const COMPANION_EMOTIONS = ['idle', 'thinking', 'talking', 'happy', 'shy', 'surprised'] as const satisfies readonly CompanionEmotion[];
export const FRAME_NAMES = ['idle', 'happy', 'smile', 'laugh', 'shy', 'surprised'] as const satisfies readonly FrameName[];

export const EMOTION_TO_FRAME: Record<CompanionEmotion, FrameName> = {
  idle: 'idle',
  thinking: 'smile',
  talking: 'laugh',
  happy: 'happy',
  shy: 'shy',
  surprised: 'surprised',
};

export const STATUS_FALLBACK_EMOTION: Record<SkillStatus, CompanionEmotion> = {
  idle: 'idle',
  connecting: 'idle',
  thinking: 'thinking',
  replying: 'talking',
  success: 'happy',
  error: 'surprised',
  cancelled: 'idle',
};

export function normalizeSkillStatus(raw: unknown): SkillStatus {
  return isSkillStatus(raw) ? raw : 'idle';
}

export function normalizeCompanionEmotion(raw: unknown): CompanionEmotion {
  return isCompanionEmotion(raw) ? raw : 'idle';
}

export function isSkillStatus(value: unknown): value is SkillStatus {
  return (SKILL_STATUSES as readonly unknown[]).includes(value);
}

export function isCompanionEmotion(value: unknown): value is CompanionEmotion {
  return (COMPANION_EMOTIONS as readonly unknown[]).includes(value);
}

export function statusFallbackEmotion(status: SkillStatus): CompanionEmotion {
  return STATUS_FALLBACK_EMOTION[status];
}
