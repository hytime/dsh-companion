import { describe, expect, it } from 'vitest';
import { EVENTS_URL, REMOTE_PACKAGE } from './remote-descriptors';

describe('EVENTS_URL', () => {
  it('由 REMOTE_PACKAGE 推导，与 host 注册路由一致', () => {
    expect(EVENTS_URL).toBe(`/plugins/${REMOTE_PACKAGE}/events`);
    expect(EVENTS_URL).toMatch(/^\/plugins\/@your-scope\/dsh-companion\/events$/);
  });
});
