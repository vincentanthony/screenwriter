import type { ScreenplayElement, TitlePageField } from '@/fountain/types';
import { NODE_NAMES } from './nodeNames';
import type { TipTapBlockNode, TipTapDoc, TipTapInline } from './types';

/**
 * Convert a ScreenplayElement array into a TipTap document plus a detached
 * title page. The title page is deliberately NOT part of the rich-editor
 * document (per plan: "Title page — not editable in v1 via the rich editor").
 */
export function screenplayToDoc(elements: ScreenplayElement[]): {
  titlePage: TitlePageField[] | null;
  doc: TipTapDoc;
} {
  let titlePage: TitlePageField[] | null = null;
  const content: TipTapBlockNode[] = [];

  for (const el of elements) {
    if (el.type === 'title-page') {
      titlePage = el.fields;
      continue;
    }
    content.push(elementToNode(el));
  }

  return { titlePage, doc: { type: 'doc', content } };
}

function elementToNode(el: Exclude<ScreenplayElement, { type: 'title-page' }>): TipTapBlockNode {
  switch (el.type) {
    case 'scene':
      return {
        type: NODE_NAMES.sceneHeading,
        attrs: { forced: Boolean(el.forced) },
        content: textToInline(el.text),
      };

    case 'action':
      return {
        type: NODE_NAMES.action,
        attrs: { forced: Boolean(el.forced) },
        content: textToInline(el.text),
      };

    case 'character':
      return {
        type: NODE_NAMES.character,
        attrs: { forced: Boolean(el.forced), dual: Boolean(el.dual) },
        content: textToInline(el.text),
      };

    case 'parenthetical':
      return { type: NODE_NAMES.parenthetical, content: textToInline(el.text) };

    case 'dialogue':
      return { type: NODE_NAMES.dialogue, content: textToInline(el.text) };

    case 'transition':
      return {
        type: NODE_NAMES.transition,
        attrs: { forced: Boolean(el.forced) },
        content: textToInline(el.text),
      };

    case 'centered':
      return { type: NODE_NAMES.centered, content: textToInline(el.text) };

    case 'note':
      return { type: NODE_NAMES.note, content: textToInline(el.text) };

    case 'boneyard':
      return { type: NODE_NAMES.boneyard, content: textToInline(el.text) };

    case 'section':
      return {
        type: NODE_NAMES.section,
        attrs: { depth: el.depth },
        content: textToInline(el.text),
      };

    case 'synopsis':
      return { type: NODE_NAMES.synopsis, content: textToInline(el.text) };

    case 'lyric':
      return { type: NODE_NAMES.lyric, content: textToInline(el.text) };

    case 'page-break':
      return { type: NODE_NAMES.pageBreak };
  }
}

/**
 * Turn a plain string with embedded `\n`s into a sequence of text + hardBreak
 * inline nodes. Empty text runs are dropped (ProseMirror rejects them), but
 * hardBreaks adjacent to the start/end or to each other are preserved so
 * leading/trailing newlines round-trip (important for multi-line boneyards).
 */
export function textToInline(text: string): TipTapInline[] {
  if (text === '') return [];
  const parts = text.split('\n');
  const out: TipTapInline[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) out.push({ type: 'hardBreak' });
    if (parts[i] !== '') out.push({ type: 'text', text: parts[i] });
  }
  return out;
}
