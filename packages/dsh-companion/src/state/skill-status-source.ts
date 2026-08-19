import { normalizeStatusUpdate, type StatusUpdate } from '../utils/status-utils';

/** 一次可序列化的 Skill 状态更新。 */
export type SkillStatusUpdate = StatusUpdate;

/** 状态订阅者。 */
export type SkillStatusListener = (update: SkillStatusUpdate) => void;

/**
 * 最小 Skill 状态源接口：只提供可序列化状态订阅与重试命令。
 * 不暴露 Host Service、Session、CLI 子进程或 SSE Response。
 */
export interface SkillStatusSource {
  /** 订阅状态更新，返回取消订阅函数。 */
  subscribe(listener: SkillStatusListener): () => void;
  /** 重试最近一次失败的 Skill 调用。 */
  retryLast(): void;
  /** 释放源；之后不得再通知订阅者。 */
  dispose(): void;
}

/**
 * 归一化来自 Host RPC 的未知 JSON 状态事件；
 * 未知状态回退 idle、非法表情回退 idle、未知字段忽略。
 */
export function normalizeSkillStatusUpdate(raw: unknown): SkillStatusUpdate {
  return normalizeStatusUpdate(raw);
}

export interface SkillStatusAdapter {
  /** 最近一次状态快照。 */
  getLast(): SkillStatusUpdate;
  /** 重试最近一次失败调用。 */
  retryLast(): void;
  /** 停止订阅并释放源。 */
  dispose(): void;
}

/**
 * 状态适配器：把 SkillStatusSource 的事件投影为归一化更新，
 * 卸载后忽略一切事件，不修改 DSH 当前对话消息。
 */
export function createSkillStatusAdapter(
  source: SkillStatusSource,
  onChange?: (update: SkillStatusUpdate) => void,
): SkillStatusAdapter {
  let disposed = false;
  let last: SkillStatusUpdate = { status: 'idle' };

  const emit = (update: SkillStatusUpdate): void => {
    if (disposed) return;
    last = update;
    onChange?.(update);
  };

  const unsubscribe = source.subscribe((update) => {
    emit(normalizeSkillStatusUpdate(update));
  });

  return {
    getLast: () => last,
    retryLast: () => {
      if (!disposed) source.retryLast();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      source.dispose();
    },
  };
}
