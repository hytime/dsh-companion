import {
  EMOTION_TO_FRAME,
  statusFallbackEmotion,
  type CompanionEmotion,
  type SkillStatus,
} from '../contracts/companion-status';
import { REMOTE_PACKAGE } from '../contracts/remote-descriptors';

export { EMOTION_TO_FRAME, FRAME_NAMES, statusFallbackEmotion } from '../contracts/companion-status';

export const FRAME_BASE_PATH = '/deepseek-girl-phaser/frames';

export function frameUrl(frame: string): string {
  return `/plugins/${REMOTE_PACKAGE}/deepseek-girl-phaser/frames/${frame}.png`;
}

export function resolveWhaleFrame(status: SkillStatus, emotion: CompanionEmotion | undefined): string {
  return EMOTION_TO_FRAME[emotion ?? statusFallbackEmotion(status)];
}
