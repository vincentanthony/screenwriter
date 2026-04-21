import { Node } from '@tiptap/core';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { dataSwTag, renderAsDataSw } from './_shared';

/**
 * Parenthetical — the (softly) / (beat) direction between character and
 * dialogue. The literal `( )` wrappers are NOT stored in the document;
 * they're added on serialize and stripped on parse, so in-editor text is
 * clean. CSS adds visual parens around the rendered block.
 */
export const Parenthetical = Node.create({
  name: NODE_NAMES.parenthetical,
  group: 'block',
  content: 'inline*',
  defining: true,

  parseHTML: dataSwTag(NODE_NAMES.parenthetical),
  renderHTML: renderAsDataSw(NODE_NAMES.parenthetical),
});
