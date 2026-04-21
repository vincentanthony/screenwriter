import { Node } from '@tiptap/core';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { dataSwTag, renderAsDataSwAtom } from './_shared';

/**
 * Page Break — `===` in Fountain. A forced page boundary, rendered as an
 * `<hr>`. Leaf/atom node (no content, not selectable for editing).
 */
export const PageBreak = Node.create({
  name: NODE_NAMES.pageBreak,
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML: dataSwTag(NODE_NAMES.pageBreak, 'hr'),
  renderHTML: renderAsDataSwAtom(NODE_NAMES.pageBreak, 'hr'),
});
