import { Node } from '@tiptap/core';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { dataSwTag, forcedAttr, renderAsDataSw } from './_shared';

/**
 * Action — prose describing what happens on screen. The default block type
 * most text falls back to. `forced` tracks the `!` leading marker.
 */
export const Action = Node.create({
  name: NODE_NAMES.action,
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return { forced: forcedAttr };
  },

  parseHTML: dataSwTag(NODE_NAMES.action),
  renderHTML: renderAsDataSw(NODE_NAMES.action),
});
