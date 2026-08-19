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

export interface StatusMachineLike {
  enter(phase: StatusPhase, context?: { provider?: string; model?: string; context?: string }): unknown;
  restoreAfterApproval(): unknown;
  get?(): { phase: StatusPhase | 'idle' };
}

export function registerStatusEventBridge(ctx: Context, machine: StatusMachineLike): void {
  ctx.on('agent/status', ({ agent, status }) => {
    if (!isMainAgent(agent)) return;
    if (status === 'idle' && (machine.get?.().phase === 'error' || machine.get?.().phase === 'cancelled')) return;
    machine.enter(status === 'running' ? 'thinking' : 'success', agentContext(agent));
  });
  ctx.on('tools/execute', async (exec, next) => {
    if (!isMainAgent(exec.agent)) return next();
    machine.enter('executing', agentContext(exec.agent, summarizeToolContext(exec.name, exec.arguments)));
    return next();
  });
  ctx.on('tools/result', (exec, result) => {
    if (!isMainAgent(exec.agent)) return;
    if (exec.signal.aborted) machine.enter('cancelled', agentContext(exec.agent, exec.name));
    else if (result.isError) machine.enter('error', agentContext(exec.agent, result.error.message));
    else machine.enter('replying', agentContext(exec.agent));
  });
  ctx.on('approval/request', async (request, next) => {
    if (!isMainAgent(request.agent)) return next();
    machine.enter('approval', agentContext(request.agent, request.reason));
    try {
      return await next();
    } finally {
      machine.restoreAfterApproval();
    }
  });
}

function agentContext(agent: unknown, context?: string): { provider?: string; model?: string; context?: string } {
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
