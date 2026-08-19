import { describe, expect, it } from 'vitest';
import {
  COMPANION_EMOTIONS,
  EMOTION_TO_FRAME,
  FRAME_NAMES,
  SKILL_STATUSES,
  isCompanionEmotion,
  normalizeCompanionEmotion,
  normalizeSkillStatus,
  statusFallbackEmotion,
} from './companion-status';

describe('companion status contract', () => {
  it('owns the existing status and emotion vocabularies', () => {
    expect(SKILL_STATUSES).toEqual(['idle', 'connecting', 'thinking', 'replying', 'success', 'error', 'cancelled']);
    expect(COMPANION_EMOTIONS).toEqual(['idle', 'thinking', 'talking', 'happy', 'shy', 'surprised']);
  });

  it('maps status fallbacks and emotions to the existing frame names', () => {
    expect(statusFallbackEmotion('thinking')).toBe('thinking');
    expect(statusFallbackEmotion('replying')).toBe('talking');
    expect(EMOTION_TO_FRAME.thinking).toBe('smile');
    expect(EMOTION_TO_FRAME.talking).toBe('laugh');
    expect(FRAME_NAMES).toEqual(['idle', 'happy', 'smile', 'laugh', 'shy', 'surprised']);
  });

  it('normalizes invalid status and emotion values safely', () => {
    expect(normalizeSkillStatus('unknown')).toBe('idle');
    expect(normalizeCompanionEmotion('unknown')).toBe('idle');
    expect(isCompanionEmotion('thinking')).toBe(true);
    expect(isCompanionEmotion('unknown')).toBe(false);
  });
});
