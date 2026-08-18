export interface SseResponse {
  write(chunk: string): void;
}

export interface SseClient {
  res: SseResponse;
}

export interface SsePublisher {
  broadcast(type: string, payload: unknown): void;
  add(client: SseClient): void;
  remove(client: SseClient): void;
}

export function createSsePublisher(): SsePublisher {
  const clients = new Set<SseClient>();
  return {
    broadcast(type, payload): void {
      const frame = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
      for (const client of clients) client.res.write(frame);
    },
    add: (client) => clients.add(client),
    remove: (client) => clients.delete(client),
  };
}
