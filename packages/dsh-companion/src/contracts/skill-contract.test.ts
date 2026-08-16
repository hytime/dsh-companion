import { describe, expect, it } from 'vitest';
import {
  isCharacterActivity,
  isCompanionEmotion,
  normalizeCompanionEmotion,
  normalizeReasoningEffort,
  normalizeSkillStatus,
  parseTravelNoteCLIResult,
  skillStatusToActivity,
  type CompanionEmotion,
  type ReasoningEffort,
  type SkillStatus,
} from './skill-contract';

describe('parseTravelNoteCLIResult', () => {
  it('接受合法成功结果', () => {
    const result = parseTravelNoteCLIResult({
      ok: true,
      text: '你好呀',
      conversationId: 'conv-1',
      emotion: 'happy',
    });
    expect(result).toEqual({
      ok: true,
      text: '你好呀',
      conversationId: 'conv-1',
      emotion: 'happy',
    });
  });

  it('可安全通过 JSON 序列化往返', () => {
    const result = parseTravelNoteCLIResult({ ok: true, text: '往返' });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('接受合法失败结果（非零退出）', () => {
    const result = parseTravelNoteCLIResult({
      ok: false,
      errorCode: 'exit-nonzero',
      errorMessage: 'hyc chat 退出码 1',
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('exit-nonzero');
  });

  it('保留超时与取消错误码', () => {
    expect(parseTravelNoteCLIResult({ ok: false, errorCode: 'timeout' }).errorCode).toBe('timeout');
    expect(parseTravelNoteCLIResult({ ok: false, errorCode: 'cancelled' }).errorCode).toBe(
      'cancelled',
    );
  });

  it('空结果（无 ok 字段）归一化为结构化错误', () => {
    const result = parseTravelNoteCLIResult({ text: '孤零零的文本' });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('unknown-error');
  });

  it('非对象输入转为结构化错误', () => {
    expect(parseTravelNoteCLIResult(null).errorCode).toBe('invalid-result');
    expect(parseTravelNoteCLIResult('string').errorCode).toBe('invalid-result');
    expect(parseTravelNoteCLIResult([1, 2]).errorCode).toBe('invalid-result');
    expect(parseTravelNoteCLIResult(undefined).errorCode).toBe('invalid-result');
  });

  it('拒绝携带 Token 的结果', () => {
    const result = parseTravelNoteCLIResult({ ok: true, text: 'x', token: 'abc' });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('sensitive-field');
  });

  it('拒绝携带 API Key 的结果', () => {
    const result = parseTravelNoteCLIResult({ ok: true, text: 'x', apiKey: 'secret' });
    expect(result.errorCode).toBe('sensitive-field');
  });

  it('拒绝携带完整内部错误堆栈的结果', () => {
    const result = parseTravelNoteCLIResult({
      ok: false,
      errorCode: 'boom',
      stack: 'at /src/host/run.ts:12',
    });
    expect(result.errorCode).toBe('sensitive-field');
  });

  it('拒绝携带密码字段的结果', () => {
    const result = parseTravelNoteCLIResult({ ok: true, text: 'x', password: 'p' });
    expect(result.errorCode).toBe('sensitive-field');
  });

  it('未知字段被忽略', () => {
    const result = parseTravelNoteCLIResult({ ok: true, text: 'x', extra: { a: 1 } });
    expect(result).toEqual({ ok: true, text: 'x' });
  });

  it('非法核心字段（text 非字符串）不进入结果', () => {
    const result = parseTravelNoteCLIResult({ ok: true, text: 123 });
    expect(result.text).toBeUndefined();
  });

  it('非法 emotion 归一化为 idle（对齐 Phaser sanitizeEmotion）', () => {
    expect(parseTravelNoteCLIResult({ ok: true, emotion: 'angry' }).emotion).toBe('idle');
    expect(parseTravelNoteCLIResult({ ok: true, emotion: 'bogus' }).emotion).toBe('idle');
  });
});

describe('normalizeCompanionEmotion（对齐 Phaser CompanionEmotion）', () => {
  it.each(['idle', 'thinking', 'talking', 'happy', 'shy', 'surprised'] as const)(
    '接受合法表情 %s',
    (emotion: CompanionEmotion) => {
      expect(normalizeCompanionEmotion(emotion)).toBe(emotion);
    },
  );

  it('非法或缺省表情归一化为 idle', () => {
    expect(normalizeCompanionEmotion(undefined)).toBe('idle');
    expect(normalizeCompanionEmotion(null)).toBe('idle');
    expect(normalizeCompanionEmotion('angry')).toBe('idle');
    expect(normalizeCompanionEmotion('sad')).toBe('idle');
  });

  it('isCompanionEmotion 白名单校验', () => {
    expect(isCompanionEmotion('happy')).toBe(true);
    expect(isCompanionEmotion('laugh')).toBe(false);
    expect(isCompanionEmotion(undefined)).toBe(false);
  });
});

describe('skillStatusToActivity（对齐 Phaser CharacterActivity）', () => {
  it('connecting → listening', () => {
    expect(skillStatusToActivity('connecting')).toBe('listening');
  });

  it('thinking → thinking', () => {
    expect(skillStatusToActivity('thinking')).toBe('thinking');
  });

  it('replying → speaking', () => {
    expect(skillStatusToActivity('replying')).toBe('speaking');
  });

  it.each(['idle', 'success', 'error', 'cancelled'] as const)('%s → idle', (status: SkillStatus) => {
    expect(skillStatusToActivity(status)).toBe('idle');
  });

  it('isCharacterActivity 校验', () => {
    expect(isCharacterActivity('speaking')).toBe(true);
    expect(isCharacterActivity('dancing')).toBe(false);
  });
});

describe('normalizeSkillStatus', () => {
  it.each(['idle', 'connecting', 'thinking', 'replying', 'success', 'error', 'cancelled'] as const)(
    '接受合法状态 %s',
    (status: SkillStatus) => {
      expect(normalizeSkillStatus(status)).toBe(status);
    },
  );

  it('未知状态归一化为 idle', () => {
    expect(normalizeSkillStatus('bogus')).toBe('idle');
    expect(normalizeSkillStatus(undefined)).toBe('idle');
    expect(normalizeSkillStatus(null)).toBe('idle');
    expect(normalizeSkillStatus(42)).toBe('idle');
  });
});

describe('normalizeReasoningEffort', () => {
  it('接受合法强度', () => {
    expect(normalizeReasoningEffort('low')).toBe('low');
    expect(normalizeReasoningEffort('medium')).toBe('medium');
    expect(normalizeReasoningEffort('high')).toBe('high');
  });

  it('缺省或非法强度归一化为 medium', () => {
    expect(normalizeReasoningEffort(undefined)).toBe('medium');
    expect(normalizeReasoningEffort('extreme' as unknown as ReasoningEffort)).toBe('medium');
    expect(normalizeReasoningEffort('')).toBe('medium');
  });
});
