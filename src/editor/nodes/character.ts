import { Node } from '@tiptap/core';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { dataSwTag, dualAttr, forcedAttr, renderAsDataSw } from './_shared';

/**
 * Character — the speaker's name, always immediately followed by dialogue
 * (optionally with a parenthetical interposed). Single-line.
 *
 * Casing: non-forced character text is stored UPPERCASE in the document
 * (not merely styled uppercase via CSS) so the Fountain serializer never
 * emits a lowercase slug and re-parsing is deterministic. The uppercasing
 * is enforced by the CharacterUppercase extension in src/editor/extensions/.
 * Forced characters (`@name`) are left as-typed so mixed-case names round-trip.
 */
export const Character = Node.create({
  name: NODE_NAMES.character,
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      forced: forcedAttr,
      dual: dualAttr,
    };
  },

  parseHTML: dataSwTag(NODE_NAMES.character),
  renderHTML: renderAsDataSw(NODE_NAMES.character),
});
