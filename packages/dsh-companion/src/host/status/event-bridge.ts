import type { Context } from '@deepseek-ai/cordis';
import { isMainAgent, summarizeToolContext } from '../../utils/status-utils';
import type { StatusPhase } from './state-machine';

declare module '@deepseek-ai/cordis' {
  interface Events {
    'agent/status'(payload: { status: 'idle' | 'running'; agent: unknown }): void;
    'tools/execute'(
      exec: { agent: unknown; name: string; arguments: unknown; signal: AbortSignal },
      next: () => Promise<unknown>,
    ): Promise<unknown>;
    'tools/result'(
      exec: { agent: unknown; name: string; arguments: unknown; signal: AbortSignal },
      result: { isError: false } | { isError: true; error: { message: string } },
    ): void;
    'approval/request'(
      request: { agent: unknown; toolName: string; reason?: string; signal?: AbortSignal },
      next: () => Promise<unknown>,
    ): Promise<unknown>;
  }
}

export interface AgentNarrationContext {
  provider?: string;
  model?: string;
  context?: string;
}

export interface StatusMachineLike {
  enter(phase: StatusPhase, context?: AgentNarrationContext): unknown;
  restoreAfterApproval(): unknown;
  get?(): { phase: StatusPhase | 'idle' };
  reset?(): unknown;
}

export interface StatusBridgeController {
  selectAgent(sessionId: string | null): void;
}

interface CachedAgentPhase {
  phase: StatusPhase;
  context: AgentNarrationContext;
}

export function registerStatusEventBridge(ctx: Context, machine: StatusMachineLike): StatusBridgeController {
  let activeAgentId: string | undefined;
  let defaultAgentId: string | undefined;
  const cached = new Map<string, CachedAgentPhase>();
  const relevant = (agent: unknown): boolean => {
    const id = agentIdOf(agent);
    return activeAgentId === undefined ? isMainAgent(agent) : id === activeAgentId;
  };
  const remember = (agent: unknown, phase: StatusPhase, context?: string): AgentNarrationContext => {
    const narrationContext = agentContext(agent, context);
    const id = agentIdOf(agent);
    if (id !== undefined) {
      cached.set(id, { phase, context: narrationContext });
      if (isMainAgent(agent)) defaultAgentId = id;
    }
    return narrationContext;
  };
  const enter = (agent: unknown, phase: StatusPhase, context?: string): void => {
    const narrationContext = remember(agent, phase, context);
    if (relevant(agent)) machine.enter(phase, narrationContext);
  };

  ctx.on('agent/status', ({ agent, status }) => {
    const previous = cached.get(agentIdOf(agent) ?? '');
    if (status === 'idle' && (previous?.phase === 'error' || previous?.phase === 'cancelled')) return;
    enter(agent, status === 'running' ? 'thinking' : 'success');
  });
  ctx.on('tools/execute', async (exec, next) => {
    enter(exec.agent, 'executing', summarizeToolContext(exec.name, exec.arguments));
    return next();
  });
  ctx.on('tools/result', (exec, result) => {
    if (exec.signal.aborted) enter(exec.agent, 'cancelled', exec.name);
    else if (result.isError) enter(exec.agent, 'error', result.error.message);
    else enter(exec.agent, 'replying');
  });
  ctx.on('approval/request', async (request, next) => {
    if (!relevant(request.agent)) return next();
    enter(request.agent, 'approval', request.reason);
    try {
      return await next();
    } finally {
      machine.restoreAfterApproval();
    }
  });

  return {
    selectAgent(sessionId): void {
      activeAgentId = sessionId === null ? undefined : sessionId;
      const cachedPhase = cached.get(sessionId === null ? defaultAgentId ?? '' : sessionId);
      if (cachedPhase !== undefined) machine.enter(cachedPhase.phase, cachedPhase.context);
      else machine.reset?.();
    },
  };
}

function agentIdOf(agent: unknown): string | undefined {
  if (agent === null || typeof agent !== 'object') return undefined;
  const candidate = agent as { id?: unknown; session?: { header?: { id?: unknown } } };
  if (typeof candidate.id === 'string') return candidate.id;
  return typeof candidate.session?.header?.id === 'string' ? candidate.session.header.id : undefined;
}

function agentContext(agent: unknown, context?: string): AgentNarrationContext {
  if (agent === null || typeof agent !== 'object') return context === undefined ? {} : { context };
  const options = (agent as { options?: unknown }).options;
  if (options === null || typeof options !== 'object') return context === undefined ? {} : { context };
  const route = options as { provider?: unknown; model?: unknown };
  return {
    ...typeof route.provider === 'string' ? { provider: route.provider } : {},
    ...typeof route.model === 'string' ? { model: route.model } : {},
    ...context === undefined ? {} : { context },
  };
}
