import { describe, expect, it } from 'vitest';
import {
  inferFromAgentIdle,
  inferFromToolResult,
  inferFromToolStart,
} from './status-inference';

describe('inferFromToolStart', () => {
  it('skill(hy-companion-*) → connecting', () => {
    expect(inferFromToolStart('skill', { name: 'hy-companion-chat' })).toEqual({ status: 'connecting' });
  });
  it('skill(非 hy-companion) → null', () => {
    expect(inferFromToolStart('skill', { name: 'other' })).toBeNull();
  });
  it('bash(hyc ...) → thinking', () => {
    expect(inferFromToolStart('bash', { command: 'hyc chat --msg "hi"' })).toEqual({ status: 'thinking' });
  });
  it('bash(非 hyc) → null', () => {
    expect(inferFromToolStart('bash', { command: 'echo hi' })).toBeNull();
  });
  it('无关工具 → null', () => {
    expect(inferFromToolStart('read', {})).toBeNull();
  });
});

describe('inferFromToolResult', () => {
  it('bash(hyc) 成功 → replying', () => {
    expect(inferFromToolResult('bash', { command: 'hyc chat' }, { isError: false }, false)).toEqual({ status: 'replying' });
  });
  it('bash(hyc) 失败 → error 携带 lastError', () => {
    expect(inferFromToolResult('bash', { command: 'hyc chat' }, { isError: true, errorMessage: 'boom' }, false)).toEqual({ status: 'error', lastError: 'boom' });
  });
  it('bash(hyc) 取消 → cancelled（取消优先于失败）', () => {
    expect(inferFromToolResult('bash', { command: 'hyc chat' }, { isError: true, errorMessage: 'x' }, true)).toEqual({ status: 'cancelled' });
  });
  it('bash(非 hyc) → null', () => {
    expect(inferFromToolResult('bash', { command: 'ls' }, { isError: false }, false)).toBeNull();
  });
  it('skill 结果 → null', () => {
    expect(inferFromToolResult('skill', { name: 'hy-companion-chat' }, { isError: false }, false)).toBeNull();
  });
});

describe('inferFromAgentIdle', () => {
  it('replying → success', () => {
    expect(inferFromAgentIdle('replying')).toEqual({ status: 'success' });
  });
  it('非 replying → null', () => {
    expect(inferFromAgentIdle('thinking')).toBeNull();
    expect(inferFromAgentIdle('idle')).toBeNull();
  });
});
