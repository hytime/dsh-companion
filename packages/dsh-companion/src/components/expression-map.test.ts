import { describe, expect, it } from 'vitest';
import {
  EMOTION_TO_FRAME,
  FRAME_NAMES,
  resolveWhaleFrame,
  statusFallbackEmotion,
} from './expression-map';

describe('EMOTION_TO_FRAME（对齐 Phaser expression-map）', () => {
  it('映射与 Phaser EXPRESSION_TO_FRAME / CHARACTER_EMOTION_MAP 逐项一致', () => {
    expect(EMOTION_TO_FRAME).toEqual({
      idle: 'idle',
      thinking: 'smile',
      talking: 'laugh',
      happy: 'happy',
      shy: 'shy',
      surprised: 'surprised',
    });
  });

  it('所有帧名都在鲸鱼娘 atlas 帧集合内', () => {
    for (const frame of Object.values(EMOTION_TO_FRAME)) {
      expect(FRAME_NAMES).toContain(frame);
    }
  });
});

describe('statusFallbackEmotion（Skill 状态缺省表情，对齐 Phaser 活动阶段）', () => {
  it('thinking → thinking', () => {
    expect(statusFallbackEmotion('thinking')).toBe('thinking');
  });

  it('replying → talking', () => {
    expect(statusFallbackEmotion('replying')).toBe('talking');
  });

  it('success → happy', () => {
    expect(statusFallbackEmotion('success')).toBe('happy');
  });

  it('error → surprised', () => {
    expect(statusFallbackEmotion('error')).toBe('surprised');
  });

  it('idle/connecting/cancelled → idle', () => {
    expect(statusFallbackEmotion('idle')).toBe('idle');
    expect(statusFallbackEmotion('connecting')).toBe('idle');
    expect(statusFallbackEmotion('cancelled')).toBe('idle');
  });
});

describe('resolveWhaleFrame', () => {
  it('优先使用显式 emotion', () => {
    expect(resolveWhaleFrame('replying', 'happy')).toBe('happy');
    expect(resolveWhaleFrame('idle', 'surprised')).toBe('surprised');
  });

  it('无 emotion 时按状态推导', () => {
    expect(resolveWhaleFrame('thinking', undefined)).toBe('smile');
    expect(resolveWhaleFrame('success', undefined)).toBe('happy');
    expect(resolveWhaleFrame('error', undefined)).toBe('surprised');
    expect(resolveWhaleFrame('idle', undefined)).toBe('idle');
  });
});
