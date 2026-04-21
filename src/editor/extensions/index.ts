export { ElementKeymap, resolveEnter, resolveShiftTab, resolveTab } from './elementKeymap';
export type { KeyMapAction, KeyMapContext } from './elementKeymap';
export {
  CharacterUppercase,
  CHARACTER_UPPERCASE_PLUGIN_KEY,
  applyCharacterUppercase,
} from './characterUppercase';

import { ElementKeymap } from './elementKeymap';
import { CharacterUppercase } from './characterUppercase';

/**
 * All screenplay-behavior extensions in one array. Pair with
 * SCREENPLAY_NODES from src/editor/nodes/ to stand up the editor.
 */
export const SCREENPLAY_EXTENSIONS = [ElementKeymap, CharacterUppercase] as const;
