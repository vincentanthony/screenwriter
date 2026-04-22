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
  TransitionUppercase,
  TRANSITION_UPPERCASE_PLUGIN_KEY,
  applyTransitionUppercase,
} from './transitionUppercase';
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
export {
  CharacterSuggest,
  CHARACTER_SUGGEST_PLUGIN_KEY,
  isCharacterSuggestMatch,
} from './characterSuggest';
export {
  ScenePrefixSuggest,
  SCENE_PREFIX_PLUGIN_KEY,
  isScenePrefixMatch,
} from './scenePrefixSuggest';
export {
  SceneLocationSuggest,
  SCENE_LOCATION_PLUGIN_KEY,
  isSceneLocationMatch,
} from './sceneLocationSuggest';
export {
  PageBreakDecoration,
  PAGE_BREAK_PLUGIN_KEY,
  dispatchPageBreakPositions,
} from './pageBreakDecoration';

import { ElementKeymap } from './elementKeymap';
import { CharacterUppercase } from './characterUppercase';
import { SceneHeadingUppercase } from './sceneHeadingUppercase';
import { TransitionUppercase } from './transitionUppercase';
import { LivePromotions } from './livePromotions';
import { CharacterSuggest } from './characterSuggest';
import { ScenePrefixSuggest } from './scenePrefixSuggest';
import { SceneLocationSuggest } from './sceneLocationSuggest';
import { PageBreakDecoration } from './pageBreakDecoration';

/**
 * All screenplay-behavior extensions in one array. Pair with
 * SCREENPLAY_NODES from src/editor/nodes/ to stand up the editor.
 */
export const SCREENPLAY_EXTENSIONS = [
  ElementKeymap,
  CharacterUppercase,
  SceneHeadingUppercase,
  TransitionUppercase,
  LivePromotions,
  CharacterSuggest,
  ScenePrefixSuggest,
  SceneLocationSuggest,
  PageBreakDecoration,
] as const;
