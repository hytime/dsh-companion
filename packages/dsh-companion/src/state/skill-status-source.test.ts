import { describe, expect, it } from 'vitest';
import {
  createSkillStatusAdapter,
  normalizeSkillStatusUpdate,
  type SkillStatusListener,
  type SkillStatusSource,
  type SkillStatusUpdate,
} from './skill-status-source';

function makeMockSource(updates: SkillStatusUpdate[] = []): SkillStatusSource & {
  emit: (update: SkillStatusUpdate) => void;
  retried: number;
  disposed: boolean;
  listenerCount: () => number;
} {
  const listeners = new Set<SkillStatusListener>();
  let disposed = false;
  const source = {
    retried: 0,
    disposed: false,
    subscribe: (listener: SkillStatusListener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    retryLast: () => {
      source.retried += 1;
      if (!disposed) for (const listener of [...listeners]) listener({ status: 'thinking' });
    },
    dispose: () => {
      disposed = true;
      source.disposed = true;
      listeners.clear();
    },
    emit: (update: SkillStatusUpdate) => {
      if (disposed) return;
      for (const listener of [...listeners]) listener(update);
    },
    listenerCount: () => listeners.size,
  };
  for (const update of updates) source.emit(update);
  return source;
}

describe('normalizeSkillStatusUpdate', () => {
  it('归一化合法更新', () => {
    expect(normalizeSkillStatusUpdate({ status: 'thinking', emotion: 'thinking' })).toEqual({
      status: 'thinking',
      emotion: 'thinking',
    });
  });

  it('非对象输入回退 idle', () => {
    expect(normalizeSkillStatusUpdate(null)).toEqual({ status: 'idle' });
    expect(normalizeSkillStatusUpdate('x')).toEqual({ status: 'idle' });
  });

  it('未知状态回退 idle、非法表情回退 idle、未知字段忽略', () => {
    expect(normalizeSkillStatusUpdate({ status: 'dancing', emotion: 'angry', extra: 1 })).toEqual({
      status: 'idle',
      emotion: 'idle',
    });
  });

  it('取消状态不被归一化为错误', () => {
    expect(normalizeSkillStatusUpdate({ status: 'cancelled' })).toEqual({ status: 'cancelled' });
  });

  it('保留 lastError', () => {
    expect(normalizeSkillStatusUpdate({ status: 'error', lastError: 'timeout' })).toEqual({
      status: 'error',
      lastError: 'timeout',
    });
  });
});

describe('createSkillStatusAdapter', () => {
  it('投影 Skill 开始 → CLI 执行 → 成功 的完整序列', () => {
    const seen: SkillStatusUpdate[] = [];
    const source = makeMockSource();
    const adapter = createSkillStatusAdapter(source, (u) => seen.push(u));
    source.emit({ status: 'connecting' });
    source.emit({ status: 'thinking', emotion: 'thinking' });
    source.emit({ status: 'replying', emotion: 'talking' });
    source.emit({ status: 'success', emotion: 'happy' });
    expect(seen.map((u) => u.status)).toEqual(['connecting', 'thinking', 'replying', 'success']);
    expect(adapter.getLast()).toEqual({ status: 'success', emotion: 'happy' });
  });

  it('空结果（未知事件）归一化为 idle 且不追加回复文本', () => {
    const seen: SkillStatusUpdate[] = [];
    const source = makeMockSource();
    const adapter = createSkillStatusAdapter(source, (u) => seen.push(u));
    source.emit({ status: 'bogus' } as unknown as SkillStatusUpdate);
    expect(seen).toEqual([{ status: 'idle' }]);
    expect(adapter.getLast()).toEqual({ status: 'idle' });
  });

  it('超时/取消作为 error 状态携带错误信息', () => {
    const source = makeMockSource();
    const adapter = createSkillStatusAdapter(source);
    source.emit({ status: 'error', lastError: 'cancelled' });
    expect(adapter.getLast()).toEqual({ status: 'error', lastError: 'cancelled' });
  });

  it('重试委托给源并产生新状态', () => {
    const source = makeMockSource();
    const adapter = createSkillStatusAdapter(source);
    adapter.retryLast();
    expect(source.retried).toBe(1);
    expect(adapter.getLast()).toEqual({ status: 'thinking' });
  });

  it('卸载后取消订阅并释放源，不再通知', () => {
    const seen: SkillStatusUpdate[] = [];
    const source = makeMockSource();
    const adapter = createSkillStatusAdapter(source, (u) => seen.push(u));
    expect(source.listenerCount()).toBe(1);
    adapter.dispose();
    expect(source.listenerCount()).toBe(0);
    expect(source.disposed).toBe(true);
    source.emit({ status: 'success' });
    expect(seen).toEqual([]);
  });

  it('重复卸载幂等', () => {
    const source = makeMockSource();
    const adapter = createSkillStatusAdapter(source);
    adapter.dispose();
    expect(() => adapter.dispose()).not.toThrow();
  });
});
