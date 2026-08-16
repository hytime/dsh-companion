import type { CompanionEmotion, SkillStatus } from '../contracts/skill-contract';
import { REMOTE_PACKAGE } from '../contracts/remote-descriptors';

/**
 * CompanionEmotion → 鲸鱼娘 atlas 帧名。
 * 与 apps/web Phaser `expression-map.ts`（EXPRESSION_TO_FRAME）及
 * `character-state-machine.ts`（CHARACTER_EMOTION_MAP）逐项对齐：
 *   idle → neutral → idle
 *   thinking → gentle → smile
 *   talking → laugh → laugh
 *   happy → happy → happy
 *   shy → shy → shy
 *   surprised → surprised → surprised
 */
export const EMOTION_TO_FRAME: Record<CompanionEmotion, string> = {
  idle: 'idle',
  thinking: 'smile',
  talking: 'laugh',
  happy: 'happy',
  shy: 'shy',
  surprised: 'surprised',
};

/** 资源目录下可用的帧文件名（与 deepseek-girl-atlas.json 帧名一致）。 */
export const FRAME_NAMES: readonly string[] = [
  'idle',
  'happy',
  'smile',
  'laugh',
  'shy',
  'surprised',
];

/** 资源目录下帧文件的基础路径。 */
export const FRAME_BASE_PATH = '/deepseek-girl-phaser/frames';

/** 鲸鱼娘帧 URL（指向 host half 注册的静态路由，见 src/host/plugin.ts 的 asset 路由）。 */
export function frameUrl(frame: string): string {
  return `/plugins/${REMOTE_PACKAGE}/deepseek-girl-phaser/frames/${frame}.png`;
}

/**
 * Skill 状态缺省表情：无 emotion 时按状态推导（与 Phaser 活动阶段语义一致）。
 * connecting → idle（待机）、thinking → thinking、replying → talking、
 * success → happy、error → surprised、cancelled → idle、idle → idle。
 */
export function statusFallbackEmotion(status: SkillStatus): CompanionEmotion {
  switch (status) {
    case 'thinking':
      return 'thinking';
    case 'replying':
      return 'talking';
    case 'success':
      return 'happy';
    case 'error':
      return 'surprised';
    default:
      return 'idle';
  }
}

/** 解析悬浮窗应展示的帧名：优先 emotion，缺省按状态推导。 */
export function resolveWhaleFrame(
  status: SkillStatus,
  emotion: CompanionEmotion | undefined,
): string {
  return EMOTION_TO_FRAME[emotion ?? statusFallbackEmotion(status)];
}
