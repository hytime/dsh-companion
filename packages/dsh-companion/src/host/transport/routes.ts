import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import type { Context } from '@deepseek-ai/cordis';
import { EVENTS_URL, REMOTE_PACKAGE } from '../../contracts/remote-descriptors';
import { scheduleInitialPushes } from '../schedules/timer';
import type { TravelNoteCompanionHostOptions, CompanionRemote } from '../remote/service';
import { FRAME_NAMES } from '../../contracts/companion-status';
import type { SsePublisher, SseResponse } from './sse-publisher';

interface WebServerService {
  register(route: {
    kind: 'exact' | 'prefix';
    path: string;
    handler: (req: unknown, res: {
      writeHead(code: number, headers?: Record<string, string>): void;
      write?(chunk: string): void;
      end(body?: string | Uint8Array): void;
    }) => void | Promise<void>;
  }): () => void;
}

export interface CompanionRouteDeps {
  ctx: Context;
  remote: CompanionRemote;
  options: TravelNoteCompanionHostOptions;
  publisher: SsePublisher;
  pushBuddy(): void;
  pushReply(): void;
}

function defaultAssetRoot(): string {
  return fileURLToPath(new URL('deepseek-girl-phaser', import.meta.url));
}

export function registerCompanionRoutes({ ctx, remote, options, publisher, pushBuddy, pushReply }: CompanionRouteDeps): () => void {
  let routesRegistered = false;
  let disposeRoutes: (() => void) | undefined;
  const register = (): void => {
    if (routesRegistered) return;
    const webServer = ctx.get('webServer') as unknown as WebServerService | undefined;
    if (webServer === undefined) return;
    routesRegistered = true;
    const assetRoot = options.assetRoot ?? process.env.DSH_COMPANION_ASSET_ROOT ?? defaultAssetRoot();
    const disposers: Array<() => void> = [];
    const add = (route: Parameters<WebServerService['register']>[0]): void => {
      disposers.push(webServer.register(route));
    };
    add({
      kind: 'exact',
      path: '/api/dsh-companion/ping',
      handler: (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, plugin: 'dsh-companion' }));
      },
    });
    for (const frameName of FRAME_NAMES) {
      add({
        kind: 'exact',
        path: `/plugins/${REMOTE_PACKAGE}/deepseek-girl-phaser/frames/${frameName}.png`,
        handler: async (_req, res) => {
          try {
            const bytes = await readFile(`${assetRoot}/frames/${frameName}.png`);
            res.writeHead(200, {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=31536000, immutable',
            });
            res.end(bytes);
          } catch {
            res.writeHead(404);
            res.end();
          }
        },
      });
    }
    add({
      kind: 'exact',
      path: EVENTS_URL,
      handler: (req, res) => {
        if (res.write === undefined) {
          res.writeHead(501);
          res.end();
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write(`event: status\ndata: ${JSON.stringify(remote.getStatus())}\n\n`);
        const response: SseResponse = { write: (chunk) => res.write!(chunk) };
        const client = { res: response };
        publisher.add(client);
        scheduleInitialPushes(remote.getSettings(), pushBuddy, pushReply);
        const heartbeat = setInterval(() => {
          try {
            res.write?.(': ping\n\n');
          } catch {
            // Connection cleanup is handled by request close events.
          }
        }, 15_000);
        const onClose = (): void => {
          publisher.remove(client);
          clearInterval(heartbeat);
        };
        const request = req as { on?: (event: string, cb: () => void) => void };
        request.on?.('close', onClose);
        request.on?.('aborted', onClose);
      },
    });
    disposeRoutes = () => {
      for (const dispose of disposers.splice(0)) dispose();
      disposeRoutes = undefined;
    };
  };
  register();
  if (!routesRegistered) ctx.on('internal/service', register);
  return () => disposeRoutes?.();
}
