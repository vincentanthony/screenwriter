import { Node } from '@tiptap/core';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { dataSwTag, forcedAttr, renderAsDataSw } from './_shared';

/**
 * Transition — CUT TO:, FADE OUT, SMASH CUT TO:, etc. Natural transitions
 * end with `TO:` and are all-caps; forced transitions start with `>` and
 * may be mixed case.
 */
export const Transition = Node.create({
  name: NODE_NAMES.transition,
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return { forced: forcedAttr };
  },

  parseHTML: dataSwTag(NODE_NAMES.transition),
  renderHTML: renderAsDataSw(NODE_NAMES.transition),
});
