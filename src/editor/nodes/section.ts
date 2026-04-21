import { Node } from '@tiptap/core';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { dataSwTag, renderAsDataSw } from './_shared';

/**
 * Section — `#`, `##`, `###` etc. in Fountain. Organizational markers
 * (acts, sequences). `depth` tracks the `#` count.
 */
export const Section = Node.create({
  name: NODE_NAMES.section,
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      depth: {
        default: 1,
        parseHTML: (el) => {
          const d = el.getAttribute('data-depth');
          return d ? Number(d) : 1;
        },
        renderHTML: (attrs: { depth?: number }) =>
          attrs.depth ? { 'data-depth': String(attrs.depth) } : {},
      },
    };
  },

  parseHTML: dataSwTag(NODE_NAMES.section),
  renderHTML: renderAsDataSw(NODE_NAMES.section),
});
