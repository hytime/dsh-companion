import type { CompanionEmotion } from '../../contracts/companion-status';
import type { StatusUpdate } from '../../utils/status-utils';
import type { StatusPhase } from './state-machine';

export interface FallbackText extends StatusUpdate {
  emotion: CompanionEmotion;
  statusMessage: string;
}

export function fallbackTextForPhase(phase: StatusPhase): FallbackText {
  switch (phase) {
    case 'thinking': return { status: 'thinking', statusMessage: '我正在思考这一步。', emotion: 'thinking' };
    case 'executing': return { status: 'connecting', statusMessage: '我正在执行这一步。', emotion: 'idle' };
    case 'approval': return { status: 'connecting', statusMessage: '我在等待这一步的授权。', emotion: 'idle' };
    case 'replying': return { status: 'replying', statusMessage: '我正在整理回答。', emotion: 'talking' };
    case 'success': return { status: 'success', statusMessage: '这一步完成了。', emotion: 'happy' };
    case 'error': return { status: 'error', statusMessage: '这一步遇到了一点问题。', emotion: 'surprised' };
    case 'cancelled': return { status: 'cancelled', statusMessage: '这一步已经取消了。', emotion: 'idle' };
  }
}
