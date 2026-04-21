export { SceneHeading } from './sceneHeading';
export { Action } from './action';
export { Character } from './character';
export { Parenthetical } from './parenthetical';
export { Dialogue } from './dialogue';
export { Transition } from './transition';
export { Centered } from './centered';
export { Note } from './note';
export { Boneyard } from './boneyard';
export { Section } from './section';
export { Synopsis } from './synopsis';
export { Lyric } from './lyric';
export { PageBreak } from './pageBreak';

import { SceneHeading } from './sceneHeading';
import { Action } from './action';
import { Character } from './character';
import { Parenthetical } from './parenthetical';
import { Dialogue } from './dialogue';
import { Transition } from './transition';
import { Centered } from './centered';
import { Note } from './note';
import { Boneyard } from './boneyard';
import { Section } from './section';
import { Synopsis } from './synopsis';
import { Lyric } from './lyric';
import { PageBreak } from './pageBreak';

/**
 * All screenplay node extensions in one array. Pass directly to
 * `new Editor({ extensions: [...SCREENPLAY_NODES, ...] })`.
 */
export const SCREENPLAY_NODES = [
  SceneHeading,
  Action,
  Character,
  Parenthetical,
  Dialogue,
  Transition,
  Centered,
  Note,
  Boneyard,
  Section,
  Synopsis,
  Lyric,
  PageBreak,
] as const;
