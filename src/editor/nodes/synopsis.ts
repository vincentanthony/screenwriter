import { Node } from '@tiptap/core';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { dataSwTag, renderAsDataSw } from './_shared';

/**
 * Synopsis — `= text` in Fountain. One-line summaries attached to scenes
 * or sections. The leading `= ` is stripped on parse, added on serialize.
 */
export const Synopsis = Node.create({
  name: NODE_NAMES.synopsis,
  group: 'block',
  content: 'inline*',
  defining: true,

  parseHTML: dataSwTag(NODE_NAMES.synopsis),
  renderHTML: renderAsDataSw(NODE_NAMES.synopsis),
});
