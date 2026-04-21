import { Node } from '@tiptap/core';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { dataSwTag, renderAsDataSw } from './_shared';

/**
 * Lyric — `~line` in Fountain. Song lyrics. Multiple consecutive `~` lines
 * in Fountain collapse into one Lyric element with multi-line text; the
 * serializer re-expands them with a `~` on every line.
 */
export const Lyric = Node.create({
  name: NODE_NAMES.lyric,
  group: 'block',
  content: 'inline*',
  defining: true,

  parseHTML: dataSwTag(NODE_NAMES.lyric),
  renderHTML: renderAsDataSw(NODE_NAMES.lyric),
});
