import { Node } from '@tiptap/core';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { dataSwTag, renderAsDataSw } from './_shared';

/**
 * Centered — `> text <` in Fountain, rendered horizontally centered. The
 * `>` and `<` delimiters are stripped on parse and added on serialize.
 */
export const Centered = Node.create({
  name: NODE_NAMES.centered,
  group: 'block',
  content: 'inline*',
  defining: true,

  parseHTML: dataSwTag(NODE_NAMES.centered),
  renderHTML: renderAsDataSw(NODE_NAMES.centered),
});
