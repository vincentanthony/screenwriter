import type { ScreenplayElement, TitlePageField } from '@/fountain/types';
import { NODE_NAMES } from './nodeNames';
import type { TipTapBlockNode, TipTapDoc, TipTapInline } from './types';

/**
 * Convert a TipTap document (plus the detached title page) back into a
 * ScreenplayElement array. Unknown node types are preserved as Action so
 * the content isn't silently dropped; downstream Fountain round-trip will
 * re-emit whatever text they carried.
 */
export function docToScreenplay(
  doc: TipTapDoc,
  titlePage: TitlePageField[] | null,
): ScreenplayElement[] {
  const out: ScreenplayElement[] = [];

  if (titlePage && titlePage.length > 0) {
    out.push({ type: 'title-page', fields: titlePage });
  }

  for (const node of doc.content ?? []) {
    out.push(nodeToElement(node));
  }

  return out;
}

function nodeToElement(node: TipTapBlockNode): ScreenplayElement {
  const text = inlineToText(node.content);
  const forced = Boolean(node.attrs?.forced);
  const dual = Boolean(node.attrs?.dual);

  switch (node.type) {
    case NODE_NAMES.sceneHeading:
      return forced ? { type: 'scene', text, forced: true } : { type: 'scene', text };

    case NODE_NAMES.action:
      return forced ? { type: 'action', text, forced: true } : { type: 'action', text };

    case NODE_NAMES.character: {
      const el: ScreenplayElement = { type: 'character', text };
      if (forced) el.forced = true;
      if (dual) el.dual = true;
      return el;
    }

    case NODE_NAMES.parenthetical:
      return { type: 'parenthetical', text };

    case NODE_NAMES.dialogue:
      return { type: 'dialogue', text };

    case NODE_NAMES.transition:
      return forced
        ? { type: 'transition', text, forced: true }
        : { type: 'transition', text };

    case NODE_NAMES.centered:
      return { type: 'centered', text };

    case NODE_NAMES.note:
      return { type: 'note', text };

    case NODE_NAMES.boneyard:
      return { type: 'boneyard', text };

    case NODE_NAMES.section: {
      const depth = typeof node.attrs?.depth === 'number' ? (node.attrs.depth as number) : 1;
      return { type: 'section', text, depth };
    }

    case NODE_NAMES.synopsis:
      return { type: 'synopsis', text };

    case NODE_NAMES.lyric:
      return { type: 'lyric', text };

    case NODE_NAMES.pageBreak:
      return { type: 'page-break' };

    default:
      // Preserve unknown nodes as action — don't drop content on the floor.
      warnUnknownNode(node.type);
      return { type: 'action', text };
  }
}

/**
 * Surface unexpected node types during development so we catch schema drift
 * early. Production builds are silent — Vite replaces `import.meta.env.DEV`
 * with `false` so dead-code elimination strips this entirely.
 */
function warnUnknownNode(nodeType: string): void {
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      `[editor/serialization] Unknown TipTap node type "${nodeType}" — falling back to action. ` +
        'Check that src/editor/serialization/nodeNames.ts is in sync with the editor schema.',
    );
  }
}

export function inlineToText(content: TipTapInline[] | undefined): string {
  if (!content) return '';
  let out = '';
  for (const n of content) {
    if (n.type === 'hardBreak') out += '\n';
    else if (n.type === 'text') out += n.text;
  }
  return out;
}
