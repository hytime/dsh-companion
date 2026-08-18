import { describe, expect, it } from 'vitest';
import * as entry from './index';
import * as legacy from './plugin';

describe('Host plugin entry', () => {
  it('publishes the stable plugin metadata and delegates apply', () => {
    expect(entry.name).toBe('dsh-companion');
    expect(entry.inject).toEqual(['subprocess']);
    expect(entry.apply).toBeTypeOf('function');
  });

  it('keeps the legacy plugin module compatible', () => {
    expect(legacy.name).toBe(entry.name);
    expect(legacy.inject).toEqual(entry.inject);
    expect(legacy.CompanionRemote).toBe(entry.CompanionRemote);
  });
});
