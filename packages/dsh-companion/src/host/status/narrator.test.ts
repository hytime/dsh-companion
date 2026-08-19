import { describe, expect, it } from 'vitest';
import { createStatusNarrator, parseNarration } from './narrator';

describe('status narrator parsing', () => {
  it('parses a valid JSON narration', () => {
    expect(parseNarration('{"message":"我在检查这一步。","emotion":"thinking"}', 'idle')).toEqual({
      message: '我在检查这一步。', emotion: 'thinking',
    });
  });

  it('falls back when emotion is invalid or output is not JSON', () => {
    expect(parseNarration('{"message":"x","emotion":"invalid"}', 'thinking')).toEqual({
      message: 'x', emotion: 'thinking',
    });
    expect(parseNarration('not-json', 'replying')).toEqual({
      message: '我正在整理回答。', emotion: 'talking',
    });
  });

  it('falls back for empty messages', () => {
    expect(parseNarration('{"message":"","emotion":"happy"}', 'success')).toEqual({
      message: '这一步完成了。', emotion: 'happy',
    });
  });

  it('uses one user message without tools or session history', async () => {
    let seen: Record<string, unknown> | undefined;
    const llm = {
      async *stream(options: Record<string, unknown>) {
        seen = options;
        yield { type: 'text-delta', text: '{"message":"继续","emotion":"thinking"}' };
      },
    };
    const narrate = createStatusNarrator(llm);
    const result = await narrate({ phase: 'thinking', provider: 'p', model: 'm', signal: new AbortController().signal });
    expect(result).toEqual({ message: '继续', emotion: 'thinking' });
    expect(seen?.provider).toBe('p');
    expect(seen?.model).toBe('m');
    expect(seen?.maxTokens).toBe(80);
    expect(seen).not.toHaveProperty('tools');
    expect(seen).not.toHaveProperty('sessionId');
    expect(seen?.messages).toHaveLength(1);
  });
});
