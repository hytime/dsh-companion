import type { SkillStatus } from '../contracts/skill-contract';
import type { StatusUpdate } from '../utils/status-utils';

export type { StatusUpdate } from '../utils/status-utils';

const COMPANION_SKILL_PREFIX = 'hy-companion';

function skillNameOf(args: unknown): string | null {
  if (typeof args !== 'object' || args === null) return null;
  const name = (args as Record<string, unknown>).name;
  return typeof name === 'string' ? name : null;
}

function companionCommandOf(args: unknown): string | null {
  if (typeof args !== 'object' || args === null) return null;
  const command = (args as Record<string, unknown>).command;
  if (typeof command !== 'string') return null;
  const first = command.trim().split(/\s+/)[0];
  return first === 'hyc' ? command.trim() : null;
}

/** tools/execute（工具开始）→ connecting/thinking，无关返回 null。 */
export function inferFromToolStart(toolName: string, args: unknown): StatusUpdate | null {
  if (toolName === 'skill') {
    const name = skillNameOf(args);
    if (name !== null && name.startsWith(COMPANION_SKILL_PREFIX)) return { status: 'connecting' };
  }
  if (toolName === 'bash' && companionCommandOf(args) !== null) return { status: 'thinking' };
  return null;
}

/** tools/result（工具结果）→ replying/error/cancelled，无关返回 null。 */
export function inferFromToolResult(
  toolName: string,
  args: unknown,
  outcome: { isError: boolean; errorMessage?: string },
  aborted: boolean,
): StatusUpdate | null {
  if (toolName !== 'bash' || companionCommandOf(args) === null) return null;
  if (aborted) return { status: 'cancelled' };
  if (outcome.isError) return { status: 'error', lastError: outcome.errorMessage ?? 'hyc 调用失败' };
  return { status: 'replying' };
}

/** agent/status（回到 idle）→ success：任何忙态都复位，避免中断后卡死。 */
export function inferFromAgentIdle(current: SkillStatus): StatusUpdate | null {
  return current === 'connecting' || current === 'thinking' || current === 'replying'
    ? { status: 'success' }
    : null;
}
