import { describe, expect, it } from 'vitest';
import { isMainAgent, mergeStatusUpdate, normalizeStatusUpdate, summarizeToolContext } from './status-utils';

describe('status utils', () => {
  it('accepts only agents without a parent session as the main agent', () => {
    expect(isMainAgent({ session: { header: { id: 'main' } } })).toBe(true);
    expect(isMainAgent({ session: { header: { parentSession: 'main' } } })).toBe(false);
    expect(isMainAgent(null)).toBe(false);
  });

  it('normalizes serializable status fields and falls back invalid emotion', () => {
    expect(normalizeStatusUpdate({ status: 'thinking', statusMessage: '检查中', emotion: 'happy' })).toEqual({
      status: 'thinking', statusMessage: '检查中', emotion: 'happy',
    });
    expect(normalizeStatusUpdate({ status: 'replying', statusMessage: 42, emotion: 'bad' })).toEqual({
      status: 'replying', emotion: 'talking',
    });
  });

  it('summarizes tool context without leaking sensitive values or exceeding the limit', () => {
    const summary = summarizeToolContext('bash', { command: 'hyc buddy list', password: 'secret', token: 'abc' });
    expect(summary).toContain('hyc buddy list');
    expect(summary).not.toContain('secret');
    expect(summary).not.toContain('abc');
    expect(summarizeToolContext('tool', { value: 'x'.repeat(500) }).length).toBeLessThanOrEqual(160);
  });

  it('merges only normalized serializable patches', () => {
    expect(mergeStatusUpdate({ status: 'thinking', statusMessage: '旧' }, { statusMessage: 12, lastError: '坏' } as unknown as Partial<{ statusMessage: string; lastError: string }>)).toEqual({
      status: 'thinking', statusMessage: '旧', lastError: '坏',
    });
  });
});
