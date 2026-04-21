import { Node } from '@tiptap/core';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { dataSwTag, renderAsDataSw } from './_shared';

/**
 * Dialogue — what the Character says. Sits immediately after a Character
 * (or Parenthetical) block with no intervening blank line.
 */
export const Dialogue = Node.create({
  name: NODE_NAMES.dialogue,
  group: 'block',
  content: 'inline*',
  defining: true,

  parseHTML: dataSwTag(NODE_NAMES.dialogue),
  renderHTML: renderAsDataSw(NODE_NAMES.dialogue),
});
