import { describe, expect, it } from 'vitest';
import { parseStatusEvent } from './status-parser';

describe('parseStatusEvent', () => {
  it('parses serializable statusMessage and emotion fields', () => {
    expect(parseStatusEvent('{"status":"thinking","statusMessage":"检查中","emotion":"happy"}')).toEqual({
      status: 'thinking', statusMessage: '检查中', emotion: 'happy',
    });
  });

  it('returns null for malformed frames and normalizes invalid emotion', () => {
    expect(parseStatusEvent('not-json')).toBeNull();
    expect(parseStatusEvent('{"status":"replying","emotion":"bad"}')).toEqual({
      status: 'replying', emotion: 'talking',
    });
  });
});
