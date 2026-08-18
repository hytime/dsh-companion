import { describe, expect, it, vi } from 'vitest';
import { createSsePublisher } from './sse-publisher';

describe('createSsePublisher', () => {
  it('broadcasts an SSE frame to every connected client', () => {
    const publisher = createSsePublisher();
    const first = { write: vi.fn() };
    const second = { write: vi.fn() };
    publisher.add({ res: first });
    publisher.add({ res: second });

    publisher.broadcast('status', { status: 'thinking' });

    expect(first.write).toHaveBeenCalledWith('event: status\ndata: {"status":"thinking"}\n\n');
    expect(second.write).toHaveBeenCalledWith('event: status\ndata: {"status":"thinking"}\n\n');
  });

  it('stops broadcasting after a client is removed', () => {
    const publisher = createSsePublisher();
    const client = { write: vi.fn() };
    const entry = { res: client };
    publisher.add(entry);
    publisher.remove(entry);

    publisher.broadcast('reply', { reply: 'done' });

    expect(client.write).not.toHaveBeenCalled();
  });
});
