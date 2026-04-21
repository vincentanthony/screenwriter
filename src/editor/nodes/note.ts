import { Node } from '@tiptap/core';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { dataSwTag, renderAsDataSw } from './_shared';

/**
 * Note — `[[ text ]]` in Fountain. Writer's annotations that survive the
 * Fountain round-trip but get muted visual treatment. The `[[ ]]` delimiters
 * are stripped on parse and added on serialize.
 */
export const Note = Node.create({
  name: NODE_NAMES.note,
  group: 'block',
  content: 'inline*',
  defining: true,

  parseHTML: dataSwTag(NODE_NAMES.note),
  renderHTML: renderAsDataSw(NODE_NAMES.note),
});
