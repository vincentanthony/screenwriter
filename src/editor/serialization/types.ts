/**
 * Minimal structural types for the TipTap/ProseMirror JSON shape we produce.
 * Kept narrow on purpose — the editor bridge only ever emits/consumes the
 * fields listed here, so type drift with TipTap's internal types is fine.
 */

export interface TipTapTextNode {
  type: 'text';
  text: string;
}

export interface TipTapHardBreak {
  type: 'hardBreak';
}

export type TipTapInline = TipTapTextNode | TipTapHardBreak;

export interface TipTapBlockNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapInline[];
}

export interface TipTapDoc {
  type: 'doc';
  content: TipTapBlockNode[];
}
