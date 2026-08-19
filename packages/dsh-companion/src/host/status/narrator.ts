import { isCompanionEmotion, type CompanionEmotion } from '../../contracts/companion-status';
import { fallbackTextForPhase } from './fallback-text';
import type { StatusPhase } from './state-machine';

export interface NarratorLlm {
  stream(options: {
    provider: string;
    model: string;
    messages: unknown[];
    maxTokens: number;
    signal: AbortSignal;
  }): AsyncIterable<unknown>;
}

export interface NarratorRequest {
  phase: StatusPhase;
  provider?: string;
  model?: string;
  signal: AbortSignal;
  context?: string;
}

export interface Narration {
  message: string;
  emotion: CompanionEmotion;
}

const NARRATOR_TIMEOUT_MS = 4_000;
const NARRATOR_MAX_TOKENS = 80;

export function parseNarration(raw: string, fallbackPhase: StatusPhase | 'idle'): Narration {
  const fallback = fallbackFor(fallbackPhase);
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const message = typeof parsed.message === 'string' ? parsed.message.trim() : '';
    if (message === '') return fallback;
    const emotion = isCompanionEmotion(parsed.emotion) ? parsed.emotion : fallback.emotion;
    return { message, emotion };
  } catch {
    return fallback;
  }
}

export function createStatusNarrator(llm: NarratorLlm, timeoutMs = NARRATOR_TIMEOUT_MS) {
  return async (request: NarratorRequest): Promise<Narration | null> => {
    if (request.provider === undefined || request.model === undefined) return null;
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const consume = async (): Promise<Narration> => {
      let raw = '';
      for await (const chunk of llm.stream({
        provider: request.provider!,
        model: request.model!,
        messages: [createStatusMessage(buildPrompt(request))],
        maxTokens: NARRATOR_MAX_TOKENS,
        signal: controller.signal,
      })) {
        if (isTextDelta(chunk)) raw += chunk.text;
      }
      return parseNarration(raw, request.phase);
    };
    try {
      const timedOut = new Promise<null>((resolve) => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve(null);
        }, timeoutMs);
      });
      return await Promise.race([consume(), timedOut]);
    } catch {
      return null;
    } finally {
      request.signal.removeEventListener('abort', abort);
      if (timeout !== undefined) clearTimeout(timeout);
    }
  };
}

function buildPrompt(request: NarratorRequest): string {
  return [
    '你是桌面旅伴，只负责播报当前主 Agent 的工作状态。',
    `当前状态：${request.phase}。`,
    request.context === undefined ? '' : `当前上下文：${request.context}`,
    '只输出严格 JSON，不要 Markdown，不要额外文字。格式：{"message":"一句简短中文话语","emotion":"idle|thinking|talking|happy|shy|surprised"}。',
  ].filter(Boolean).join('\n');
}

function createStatusMessage(text: string): Record<string, unknown> {
  return {
    id: `companion-status-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  };
}

function isTextDelta(value: unknown): value is { type: 'text-delta'; text: string } {
  if (value === null || typeof value !== 'object') return false;
  const chunk = value as Record<string, unknown>;
  return chunk.type === 'text-delta' && typeof chunk.text === 'string';
}

function fallbackFor(phase: StatusPhase | 'idle'): Narration {
  if (phase === 'idle') return { message: '我在这里。', emotion: 'idle' };
  const fallback = fallbackTextForPhase(phase);
  return { message: fallback.statusMessage, emotion: fallback.emotion };
}
