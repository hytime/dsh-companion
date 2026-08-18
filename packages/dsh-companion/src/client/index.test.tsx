import { describe, expect, it } from 'vitest';
import { apply, inject, name } from './index';

describe('Client plugin entry', () => {
  it('exports stable metadata and an apply delegate', () => {
    expect(name).toBe('dsh-companion');
    expect(inject).toEqual(['remote']);
    expect(apply).toBeTypeOf('function');
  });
});
