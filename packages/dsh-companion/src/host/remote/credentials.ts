import type { Context } from '@deepseek-ai/cordis';
import { COMMAND_TIMEOUT_MS, type CredentialPtyRun } from '../companion-commands';

interface CredentialTerminalHandle {
  output: AsyncIterable<Uint8Array | string>;
  done: Promise<{ exitCode: number | null; signal: unknown }>;
  write(data: string): Promise<void>;
  terminate(): Promise<void>;
}

interface CredentialSubprocessService {
  spawnTerminal(spec: {
    argv: readonly string[];
    cwd: string;
    rows: number;
    cols: number;
    graceMs: number;
  }): Promise<CredentialTerminalHandle>;
}

/** Run hyc login/register through DSH's real PTY service. */
export function createCredentialPtyRunner(ctx: Context): CredentialPtyRun {
  return async (command, input) => {
    const subprocess = ctx.get('subprocess') as unknown as CredentialSubprocessService | undefined;
    if (subprocess === undefined) {
      return { error: new Error('DSH subprocess PTY service unavailable') };
    }
    let terminal: CredentialTerminalHandle | undefined;
    let outputDone: Promise<void> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      terminal = await subprocess.spawnTerminal({
        argv: ['hyc', command],
        cwd: process.cwd(),
        rows: 24,
        cols: 120,
        graceMs: 3_000,
      });
      const chunks: string[] = [];
      const decoder = new TextDecoder();
      outputDone = (async () => {
        for await (const chunk of terminal!.output) {
          chunks.push(typeof chunk === 'string' ? chunk : decoder.decode(chunk));
        }
      })();
      await terminal.write(input);
      const outcome = await Promise.race([
        terminal.done,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            const error = new Error(`hyc ${command} PTY timed out after ${COMMAND_TIMEOUT_MS}ms`) as NodeJS.ErrnoException;
            error.code = 'ETIMEDOUT';
            reject(error);
          }, COMMAND_TIMEOUT_MS);
        }),
      ]);
      await outputDone;
      return { status: outcome.exitCode, stdout: chunks.join('') };
    } catch (error) {
      return { error };
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      if (terminal !== undefined) {
        await terminal.terminate().catch(() => {});
        await outputDone?.catch(() => {});
      }
    }
  };
}
