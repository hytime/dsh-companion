import { describe, expect, it, vi } from 'vitest';
import { createStatusStateMachine } from './state-machine';

describe('main agent status state machine', () => {
  it('does not narrate the same phase twice', () => {
    const narrate = vi.fn(async () => ({ message: '继续检查', emotion: 'thinking' as const }));
    const onChange = vi.fn();
    const machine = createStatusStateMachine({ narrate, onChange });
    machine.enter('thinking');
    machine.enter('thinking');
    expect(narrate).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('restores the previous phase after approval completes', () => {
    const machine = createStatusStateMachine({ onChange: vi.fn() });
    machine.enter('executing');
    machine.enter('approval');
    expect(machine.get().phase).toBe('approval');
    machine.restoreAfterApproval();
    expect(machine.get().phase).toBe('executing');
  });

  it('drops narration results from an old generation', async () => {
    const resolvers: Array<(value: { message: string; emotion: 'thinking' }) => void> = [];
    const onChange = vi.fn();
    const machine = createStatusStateMachine({
      onChange,
      narrate: () => new Promise((resolve) => { resolvers.push(resolve); }),
    });
    const old = machine.enter('thinking');
    machine.enter('replying');
    resolvers[0]?.({ message: '过期思考', emotion: 'thinking' });
    await Promise.resolve();
    expect(machine.get().statusMessage).not.toBe('过期思考');
    expect(machine.get().generation).toBeGreaterThan(old.generation);
  });
});
