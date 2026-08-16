/**
 * DSH Companion 鲸鱼插件公开 API。
 * 只导出 WhaleFloatingWidget、Skill/CLI 纯 JSON 类型与样式入口；
 * 不导出 mock、CLI 执行器或 DSH live 对象。
 */
export {
  WhaleFloatingWidget,
  type WhaleFloatingWidgetProps,
} from './components/whale-floating-widget';
export {
  EMOTION_TO_FRAME,
  FRAME_NAMES,
  resolveWhaleFrame,
  statusFallbackEmotion,
  frameUrl,
} from './components/expression-map';
export {
  createSkillStatusAdapter,
  normalizeSkillStatusUpdate,
  type SkillStatusSource,
  type SkillStatusAdapter,
  type SkillStatusUpdate,
  type SkillStatusListener,
} from './state/skill-status-source';
export {
  parseTravelNoteCLIResult,
  normalizeSkillStatus,
  normalizeReasoningEffort,
  normalizeCompanionEmotion,
  skillStatusToActivity,
  isCompanionEmotion,
  isCharacterActivity,
  type TravelNoteSkillInput,
  type TravelNoteCLIResult,
  type SkillStatus,
  type ReasoningEffort,
  type CompanionEmotion,
  type CharacterActivity,
} from './contracts/skill-contract';
import './styles/companion.module.css';
