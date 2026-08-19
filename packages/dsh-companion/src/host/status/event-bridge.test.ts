import { describe, expect, it, vi } from 'vitest';
import { registerStatusEventBridge } from './event-bridge';

type Handler = (...args: any[]) => any;

describe('main agent status event bridge', () => {
  it('filters child agents and preserves waterfall continuation', async () => {
    const handlers: Record<string, Handler> = {};
    const ctx = { on: vi.fn((name: string, handler: Handler) => { handlers[name] = handler; }) };
    const machine = { enter: vi.fn(), restoreAfterApproval: vi.fn() };
    registerStatusEventBridge(ctx as never, machine as never);
    const main = { session: { header: { id: 'main' } } };
    const child = { session: { header: { parentSession: 'main' } } };
    const next = vi.fn(async () => 'downstream');

    await handlers['tools/execute']!({ agent: child, name: 'bash', arguments: {}, signal: { aborted: false } }, next);
    await handlers['tools/execute']!({ agent: main, name: 'bash', arguments: {}, signal: { aborted: false } }, next);
    expect(machine.enter).toHaveBeenCalledWith('executing', expect.objectContaining({ context: 'bash' }));
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('maps tool results and restores phase after approval', async () => {
    const handlers: Record<string, Handler> = {};
    const ctx = { on: vi.fn((name: string, handler: Handler) => { handlers[name] = handler; }) };
    const machine = { enter: vi.fn(), restoreAfterApproval: vi.fn() };
    registerStatusEventBridge(ctx as never, machine as never);
    const main = { session: { header: { id: 'main' } } };

    handlers['tools/result']!({ agent: main, name: 'bash', arguments: {}, signal: { aborted: false } }, { isError: false });
    handlers['tools/result']!({ agent: main, name: 'bash', arguments: {}, signal: { aborted: true } }, { isError: false });
    handlers['tools/result']!({ agent: main, name: 'bash', arguments: {}, signal: { aborted: false } }, { isError: true, error: { message: 'failed' } });
    await handlers['approval/request']!({ agent: main, toolName: 'bash', reason: 'needs access' }, async () => 'allowed');
    expect(machine.enter).toHaveBeenCalledWith('replying', expect.any(Object));
    expect(machine.enter).toHaveBeenCalledWith('cancelled', expect.objectContaining({ context: 'bash' }));
    expect(machine.enter).toHaveBeenCalledWith('error', expect.objectContaining({ context: 'failed' }));
    expect(machine.enter).toHaveBeenCalledWith('approval', expect.objectContaining({ context: 'needs access' }));
    expect(machine.restoreAfterApproval).toHaveBeenCalledTimes(1);
  });

  it('switches the focused agent and ignores the old focus', async () => {
    const handlers: Record<string, Handler> = {};
    const ctx = { on: vi.fn((name: string, handler: Handler) => { handlers[name] = handler; }) };
    const machine = { enter: vi.fn(), restoreAfterApproval: vi.fn(), reset: vi.fn() };
    const controller = registerStatusEventBridge(ctx as never, machine as never);
    const child = { id: 'child', session: { header: { parentSession: 'main' } } };
    const next = vi.fn(async () => undefined);

    await handlers['tools/execute']!({ agent: child, name: 'bash', arguments: {}, signal: { aborted: false } }, next);
    expect(machine.enter).not.toHaveBeenCalled();
    controller.selectAgent('child');
    expect(machine.enter).toHaveBeenCalledWith('executing', expect.objectContaining({ context: 'bash' }));
    await handlers['tools/execute']!({ agent: child, name: 'bash', arguments: {}, signal: { aborted: false } }, next);
    expect(machine.enter).toHaveBeenCalledWith('executing', expect.objectContaining({ context: 'bash' }));
  });
});
