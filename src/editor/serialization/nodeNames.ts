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

/**
 * HTML rendering descriptors for each screenplay node. `data` becomes the
 * node's `data-sw` attribute (kebab-case, human-readable) and `className`
 * is its Tailwind/CSS hook. Lives here (not inside each node file) so
 * consumers can reason about the rendered DOM without importing TipTap.
 */
export const NODE_HTML: Record<NodeName, { data: string; className: string }> = {
  [NODE_NAMES.sceneHeading]: { data: 'scene', className: 'sw-scene' },
  [NODE_NAMES.action]: { data: 'action', className: 'sw-action' },
  [NODE_NAMES.character]: { data: 'character', className: 'sw-character' },
  [NODE_NAMES.parenthetical]: { data: 'parenthetical', className: 'sw-parenthetical' },
  [NODE_NAMES.dialogue]: { data: 'dialogue', className: 'sw-dialogue' },
  [NODE_NAMES.transition]: { data: 'transition', className: 'sw-transition' },
  [NODE_NAMES.centered]: { data: 'centered', className: 'sw-centered' },
  [NODE_NAMES.note]: { data: 'note', className: 'sw-note' },
  [NODE_NAMES.boneyard]: { data: 'boneyard', className: 'sw-boneyard' },
  [NODE_NAMES.section]: { data: 'section', className: 'sw-section' },
  [NODE_NAMES.synopsis]: { data: 'synopsis', className: 'sw-synopsis' },
  [NODE_NAMES.lyric]: { data: 'lyric', className: 'sw-lyric' },
  [NODE_NAMES.pageBreak]: { data: 'page-break', className: 'sw-page-break' },
};
