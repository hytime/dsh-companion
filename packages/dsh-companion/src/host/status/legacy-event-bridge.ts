import type { Context } from '@deepseek-ai/cordis';
import { inferFromAgentIdle, inferFromToolResult, inferFromToolStart } from '../status-inference';
import type { CompanionRemote } from '../remote/service';

declare module '@deepseek-ai/cordis' {
  interface Events {
    'tools/execute'(
      exec: { name: string; arguments: unknown; signal: AbortSignal; agent: unknown },
      next: () => Promise<unknown>,
    ): Promise<unknown>;
    'tools/result'(
      exec: { name: string; arguments: unknown; signal: AbortSignal; agent: unknown },
      result: { isError: true; error: { message: string } } | { isError: false; error?: never },
    ): void;
    'agent/status'(payload: { status: 'idle' | 'running'; agent: unknown }): void;
  }
}

export function registerLegacyStatusBridge(
  ctx: Context,
  remote: CompanionRemote,
  publishStatus: () => void,
): void {
  let companionAgent: unknown;
  ctx.on('tools/execute', async (exec, next) => {
    const update = inferFromToolStart(exec.name, exec.arguments);
    if (update !== null) {
      companionAgent = exec.agent;
      remote.setStatus(update);
      publishStatus();
    }
    return next();
  });
  ctx.on('tools/result', (exec, result) => {
    const update = inferFromToolResult(
      exec.name,
      exec.arguments,
      { isError: result.isError, errorMessage: result.isError ? result.error.message : undefined },
      exec.signal.aborted,
    );
    if (update !== null) {
      companionAgent = exec.agent;
      remote.setStatus(update);
      publishStatus();
    }
  });
  ctx.on('agent/status', (payload) => {
    if (payload.status !== 'idle') return;
    if (companionAgent !== undefined && payload.agent !== companionAgent) return;
    const update = inferFromAgentIdle(remote.getStatus().status);
    if (update !== null) {
      remote.setStatus(update);
      publishStatus();
    }
  });
}
