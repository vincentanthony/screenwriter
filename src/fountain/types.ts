/**
 * ScreenplayElement — the intermediate representation between a Fountain
 * string and the TipTap document. Fountain is the source of truth; this
 * array is the normalized form we (de)serialize through.
 *
 * Design rules:
 * - Each element is a block. Inline content (bold/italic/underline markers,
 *   inline [[notes]], inline /* boneyard *\/) lives as literal characters
 *   inside `text`.
 * - Forced-marker state is carried as a `forced` attribute so re-serialization
 *   can emit the leading `.`, `!`, `@`, or `>` when necessary.
 * - Round-trip invariant: `serialize(parse(x)) === normalize(x)` for any
 *   well-formed Fountain string `x`. See normalize() in serialize.ts.
 */

export interface TitlePageField {
  key: string;
  value: string;
}

export type ScreenplayElement =
  | { type: 'title-page'; fields: TitlePageField[] }
  | { type: 'scene'; text: string; forced?: boolean }
  | { type: 'action'; text: string; forced?: boolean }
  | { type: 'character'; text: string; forced?: boolean; dual?: boolean }
  | { type: 'parenthetical'; text: string }
  | { type: 'dialogue'; text: string }
  | { type: 'transition'; text: string; forced?: boolean }
  | { type: 'centered'; text: string }
  | { type: 'note'; text: string }
  | { type: 'boneyard'; text: string }
  | { type: 'section'; text: string; depth: number }
  | { type: 'synopsis'; text: string }
  | { type: 'lyric'; text: string }
  | { type: 'page-break' };

export type ScreenplayElementType = ScreenplayElement['type'];

/** Block types that belong to a single character's dialogue group. */
export const DIALOGUE_GROUP_TYPES: ReadonlySet<ScreenplayElementType> = new Set([
  'character',
  'parenthetical',
  'dialogue',
]);
