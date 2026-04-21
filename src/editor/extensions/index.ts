export { ElementKeymap, resolveEnter, resolveShiftTab, resolveTab } from './elementKeymap';
export type { KeyMapAction, KeyMapContext } from './elementKeymap';
export {
  CharacterUppercase,
  CHARACTER_UPPERCASE_PLUGIN_KEY,
  applyCharacterUppercase,
} from './characterUppercase';
export {
  SceneHeadingUppercase,
  SCENE_HEADING_UPPERCASE_PLUGIN_KEY,
  applySceneHeadingUppercase,
} from './sceneHeadingUppercase';
export {
  LivePromotions,
  sceneHeadingInputRule,
  transitionInputRule,
  parentheticalInputRule,
  canPromoteToSceneHeading,
  canPromoteToTransition,
  canPromoteToParenthetical,
  SCENE_HEADING_TRIGGER,
  TRANSITION_TRIGGER,
  PARENTHETICAL_TRIGGER,
  type PromotionContext,
} from './livePromotions';

import { ElementKeymap } from './elementKeymap';
import { CharacterUppercase } from './characterUppercase';
import { SceneHeadingUppercase } from './sceneHeadingUppercase';
import { LivePromotions } from './livePromotions';

/**
 * All screenplay-behavior extensions in one array. Pair with
 * SCREENPLAY_NODES from src/editor/nodes/ to stand up the editor.
 */
export const SCREENPLAY_EXTENSIONS = [
  ElementKeymap,
  CharacterUppercase,
  SceneHeadingUppercase,
  LivePromotions,
] as const;
