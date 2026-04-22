import { DIALOGUE_GROUP_TYPES, type ScreenplayElement } from './types';

/**
 * Serialize ScreenplayElement[] → Fountain string.
 *
 * Output is canonical form:
 *  - LF line endings
 *  - no trailing whitespace on any line
 *  - exactly one blank line between sibling blocks, except within a
 *    character/parenthetical/dialogue group (which is contiguous)
 *  - file terminated with a single `\n`
 *
 * Round-trip: for any Fountain string x, serialize(parse(x)) === normalize(x).
 */
export function serialize(elements: ScreenplayElement[]): string {
  const out: string[] = [];

  for (let i = 0; i < elements.length; i++) {
    const cur = elements[i];
    const prev = i > 0 ? elements[i - 1] : null;

    if (prev) {
      const tightJoin =
        DIALOGUE_GROUP_TYPES.has(prev.type) &&
        (cur.type === 'parenthetical' || cur.type === 'dialogue');
      if (!tightJoin) out.push(''); // blank line separator
    }

    out.push(...renderElement(cur));
  }

  return out.join('\n') + '\n';
}

function renderElement(el: ScreenplayElement): string[] {
  switch (el.type) {
    case 'title-page':
      // Defensive string coercion: TitlePageField.value is typed `string`,
      // but an upstream FDX import bug can produce object values that the
      // default template-literal stringification turns into the literal
      // `[object Object]`. Once that lands in the Fountain source of truth,
      // every downstream read (editor, export, card title) sees the garbage.
      // Coercing to empty here contains the blast radius.
      return el.fields.map((f) => `${f.key}: ${typeof f.value === 'string' ? f.value : ''}`);

    case 'scene':
      // Natural scene headings must be uppercase to re-parse. Forced scenes
      // (`.slug`) bypass the prefix rule and may carry mixed-case text.
      return [el.forced ? `.${el.text}` : el.text.toUpperCase()];

    case 'action':
      // Action text may contain newlines — split so the serializer's
      // `join('\n')` produces the right output.
      return (el.forced ? `!${el.text}` : el.text).split('\n');

    case 'character': {
      // Natural character names must be all-uppercase in Fountain.
      // `@name` is the forced variant that allows lowercase.
      const text = el.forced ? el.text : el.text.toUpperCase();
      let line = el.forced ? `@${text}` : text;
      if (el.dual) line += ' ^';
      return [line];
    }

    case 'parenthetical':
      return [`(${el.text})`];

    case 'dialogue':
      return el.text.split('\n');

    case 'transition':
      // Natural transitions must be uppercase; `> forced` may be mixed-case.
      return [el.forced ? `> ${el.text}` : el.text.toUpperCase()];

    case 'centered':
      return [`> ${el.text} <`];

    case 'note':
      return [`[[${el.text}]]`];

    case 'boneyard':
      // Preserve verbatim — the stored text includes any internal newlines
      // so /*\ntext\n*/ round-trips to the exact same line structure.
      return (`/*${el.text}*/`).split('\n');

    case 'section':
      return [`${'#'.repeat(el.depth)} ${el.text}`];

    case 'synopsis':
      return [`= ${el.text}`];

    case 'lyric':
      return el.text.split('\n').map((l) => `~${l}`);

    case 'page-break':
      return ['==='];
  }
}

/**
 * Normalize a Fountain string to the form `serialize()` emits, so round-trip
 * equality is byte-exact.
 *
 * Normalization rules:
 *  - CRLF → LF
 *  - trailing whitespace stripped from each line
 *  - leading and trailing blank lines removed
 *  - consecutive blank lines collapsed to a single blank line
 *  - file terminated with exactly one `\n`
 */
export function normalize(input: string): string {
  const lines = input
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .split('\n');

  // Trim leading blanks.
  let start = 0;
  while (start < lines.length && lines[start] === '') start++;

  // Trim trailing blanks.
  let end = lines.length;
  while (end > start && lines[end - 1] === '') end--;

  // Collapse runs of blank lines to a single blank.
  const out: string[] = [];
  let lastWasBlank = false;
  for (let i = start; i < end; i++) {
    const blank = lines[i] === '';
    if (blank && lastWasBlank) continue;
    out.push(lines[i]);
    lastWasBlank = blank;
  }

  return out.join('\n') + '\n';
}
