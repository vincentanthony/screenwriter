import { Node } from '@tiptap/core';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { dataSwTag, renderAsDataSw } from './_shared';

/**
 * Boneyard — `/* ... *\/` in Fountain. Drafts and cut material that live
 * on in the file but render as strikethrough. May span multiple lines; the
 * interior (including leading/trailing newlines) round-trips verbatim via
 * text + hardBreak inline nodes.
 */
export const Boneyard = Node.create({
  name: NODE_NAMES.boneyard,
  group: 'block',
  content: 'inline*',
  defining: true,

  parseHTML: dataSwTag(NODE_NAMES.boneyard),
  renderHTML: renderAsDataSw(NODE_NAMES.boneyard),
});
