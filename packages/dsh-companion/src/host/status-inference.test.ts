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
  it('thinking → success（工具被中断后状态不得卡死，否则永久抑制 buddy 提醒 toast）', () => {
    expect(inferFromAgentIdle('thinking')).toEqual({ status: 'success' });
  });
  it('connecting → success', () => {
    expect(inferFromAgentIdle('connecting')).toEqual({ status: 'success' });
  });
  it('非忙态（idle/success/error/cancelled）→ null（无状态跃迁）', () => {
    expect(inferFromAgentIdle('idle')).toBeNull();
    expect(inferFromAgentIdle('success')).toBeNull();
    expect(inferFromAgentIdle('error')).toBeNull();
    expect(inferFromAgentIdle('cancelled')).toBeNull();
  });
});
