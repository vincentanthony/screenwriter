/**
 * Canonical TipTap node names used by both the serialization bridge and
 * the node definitions in src/editor/nodes/. Keep this the single source
 * of truth — a typo here desynchronizes the entire editor.
 */
export const NODE_NAMES = {
  sceneHeading: 'sceneHeading',
  action: 'action',
  character: 'character',
  parenthetical: 'parenthetical',
  dialogue: 'dialogue',
  transition: 'transition',
  centered: 'centered',
  note: 'note',
  boneyard: 'boneyard',
  section: 'section',
  synopsis: 'synopsis',
  lyric: 'lyric',
  pageBreak: 'pageBreak',
} as const;

export type NodeName = (typeof NODE_NAMES)[keyof typeof NODE_NAMES];
