import type { ScreenplayElement, TitlePageField } from './types';

/**
 * Fountain parser — hand-rolled, line-oriented, and deliberately NOT built on
 * fountain-js.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  Why not fountain-js?
 * ──────────────────────────────────────────────────────────────────────────
 * Our single non-negotiable invariant (see CLAUDE.md) is:
 *
 *     serialize(parse(x)) === normalize(x)   — byte-exact round-trip
 *
 * fountain-js is a rendering-oriented library. Its output (tokens + HTML)
 * is lossy with respect to the source:
 *
 *   - it strips `[[ notes ]]` and `/* boneyard *\/` inline from text runs
 *     and re-emits them as separate constructs, so source position and
 *     whitespace context are lost
 *   - it flattens consecutive lyrics and certain dual-dialogue arrangements
 *   - it does not preserve the distinction between forced and natural
 *     markers (`.`, `!`, `@`, `>`) consistently enough to re-serialize
 *   - it eagerly interprets inline emphasis (`**bold**`, `*italic*`, `_u_`)
 *     as rendered HTML, dropping the raw markers
 *
 * All of those are round-trip-breaking. We only need the subset of Fountain
 * defined in our support matrix, and that subset is small enough to parse
 * by hand (~200 lines). Owning the parser means owning the round-trip
 * guarantee.
 *
 * Do not reintroduce fountain-js as a dependency. If you find yourself
 * wanting to, add a failing round-trip test first and then solve it here.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Parse a Fountain string into a normalized ScreenplayElement array.
 * Supported elements match the Fountain support matrix in the project plan.
 */
export function parse(input: string): ScreenplayElement[] {
  // Normalize line endings; trailing whitespace per line is stripped by
  // normalize() before round-trip comparison but we do it here too so the
  // parser sees canonical text.
  const lines = input.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').split('\n');

  const elements: ScreenplayElement[] = [];
  let i = 0;

  // Title page must appear at the very top of the file.
  if (isTitlePageStart(lines, i)) {
    const { element, consumed } = parseTitlePage(lines, i);
    elements.push(element);
    i += consumed;
  }

  while (i < lines.length) {
    // Skip blank lines between blocks.
    while (i < lines.length && lines[i] === '') i++;
    if (i >= lines.length) break;

    const { parsed, consumed } = parseBlock(lines, i);
    elements.push(...parsed);
    i += consumed;
  }

  return elements;
}

// --- Title page -------------------------------------------------------------

function isTitlePageStart(lines: string[], i: number): boolean {
  if (i >= lines.length) return false;
  return matchTitlePageField(lines[i]) !== null;
}

const TITLE_PAGE_FIELD_RE = /^([A-Za-z][A-Za-z0-9 ]*):\s*(.*)$/;

/**
 * A title-page field is `Key: Value`. The key must contain at least one
 * lowercase letter — this disambiguates legitimate title-page keys like
 * `Title`, `Author`, `Draft date` from transitions like `CUT TO:` or
 * `FADE TO:` which are all-uppercase.
 */
function matchTitlePageField(line: string): { key: string; value: string } | null {
  const match = TITLE_PAGE_FIELD_RE.exec(line);
  if (!match) return null;
  const [, key, value] = match;
  if (!/[a-z]/.test(key)) return null;
  return { key, value };
}

function parseTitlePage(
  lines: string[],
  start: number,
): { element: ScreenplayElement; consumed: number } {
  const fields: TitlePageField[] = [];
  let i = start;
  while (i < lines.length && lines[i] !== '') {
    const field = matchTitlePageField(lines[i]);
    if (!field) break;
    fields.push(field);
    i++;
  }
  return { element: { type: 'title-page', fields }, consumed: i - start };
}

// --- Block dispatch ---------------------------------------------------------

function parseBlock(
  lines: string[],
  start: number,
): { parsed: ScreenplayElement[]; consumed: number } {
  const line = lines[start];

  // Page break: three or more equals signs, nothing else on the line.
  if (/^=+$/.test(line) && line.length >= 3) {
    return { parsed: [{ type: 'page-break' }], consumed: 1 };
  }

  // Section: one or more `#` followed by text.
  const sectionMatch = /^(#+)\s+(.*)$/.exec(line);
  if (sectionMatch) {
    return {
      parsed: [{ type: 'section', depth: sectionMatch[1].length, text: sectionMatch[2] }],
      consumed: 1,
    };
  }

  // Synopsis: single `=` followed by space and text. Guard against `===`.
  if (line.startsWith('= ')) {
    return { parsed: [{ type: 'synopsis', text: line.slice(2) }], consumed: 1 };
  }

  // Lyrics: consecutive `~` lines collapse into one multi-line lyric element.
  if (line.startsWith('~')) {
    const collected: string[] = [line.slice(1)];
    let k = start + 1;
    while (k < lines.length && lines[k].startsWith('~')) {
      collected.push(lines[k].slice(1));
      k++;
    }
    return {
      parsed: [{ type: 'lyric', text: collected.join('\n') }],
      consumed: k - start,
    };
  }

  // Boneyard: /* ... */, possibly multi-line. Preserve whitespace verbatim.
  if (line.startsWith('/*')) {
    const result = parseBoneyard(lines, start);
    if (result) return result;
    // Unclosed boneyard falls through to action.
  }

  // Standalone note: entire line is [[ ... ]].
  if (/^\[\[.*\]\]$/.test(line)) {
    return { parsed: [{ type: 'note', text: line.slice(2, -2) }], consumed: 1 };
  }

  // Forced action: ! prefix. Consumes until blank line.
  if (line.startsWith('!')) {
    const collected: string[] = [line.slice(1)];
    let k = start + 1;
    while (k < lines.length && lines[k] !== '') {
      collected.push(lines[k]);
      k++;
    }
    return {
      parsed: [{ type: 'action', text: collected.join('\n'), forced: true }],
      consumed: k - start,
    };
  }

  // Forced scene heading: leading `.` (but not `..` which could be ellipsis).
  if (line.startsWith('.') && !line.startsWith('..') && line.length > 1) {
    return { parsed: [{ type: 'scene', text: line.slice(1), forced: true }], consumed: 1 };
  }

  // Scene heading: INT./EXT./EST./I/E./INT./EXT. prefix.
  if (isSceneHeading(line)) {
    return { parsed: [{ type: 'scene', text: line }], consumed: 1 };
  }

  // Centered: `> text <`.
  if (/^>\s*.+\s*<$/.test(line)) {
    const inner = line.replace(/^>\s*/, '').replace(/\s*<$/, '');
    return { parsed: [{ type: 'centered', text: inner }], consumed: 1 };
  }

  // Forced transition: leading `>`.
  if (line.startsWith('>')) {
    return {
      parsed: [{ type: 'transition', text: line.slice(1).trimStart(), forced: true }],
      consumed: 1,
    };
  }

  // Transition: ALL CAPS ending with `TO:`.
  if (isTransition(line)) {
    return { parsed: [{ type: 'transition', text: line }], consumed: 1 };
  }

  // Forced character: `@name`.
  if (line.startsWith('@')) {
    return parseCharacterBlock(lines, start, /* forced */ true);
  }

  // Character: ALL CAPS line, next line non-blank.
  if (
    isCharacterLine(line) &&
    start + 1 < lines.length &&
    lines[start + 1] !== ''
  ) {
    return parseCharacterBlock(lines, start, /* forced */ false);
  }

  // Fallback: action block (consecutive non-blank lines).
  const collected: string[] = [line];
  let k = start + 1;
  while (k < lines.length && lines[k] !== '') {
    collected.push(lines[k]);
    k++;
  }
  return { parsed: [{ type: 'action', text: collected.join('\n') }], consumed: k - start };
}

// --- Character blocks -------------------------------------------------------

function parseCharacterBlock(
  lines: string[],
  start: number,
  forced: boolean,
): { parsed: ScreenplayElement[]; consumed: number } {
  const first = lines[start];
  let charText = forced ? first.slice(1) : first;

  // Dual-dialogue caret lives at the end of the character line.
  let dual = false;
  if (/\s\^$/.test(charText) || charText.endsWith('^')) {
    dual = true;
    charText = charText.replace(/\s*\^$/, '');
  }

  const out: ScreenplayElement[] = [
    { type: 'character', text: charText, ...(forced ? { forced: true } : {}), ...(dual ? { dual: true } : {}) },
  ];

  let k = start + 1;
  while (k < lines.length && lines[k] !== '') {
    const l = lines[k];
    if (/^\(.*\)$/.test(l)) {
      out.push({ type: 'parenthetical', text: l.slice(1, -1) });
      k++;
      continue;
    }
    // Dialogue: may span multiple consecutive non-parenthetical lines.
    const dialogueLines: string[] = [l];
    let d = k + 1;
    while (d < lines.length && lines[d] !== '' && !/^\(.*\)$/.test(lines[d])) {
      dialogueLines.push(lines[d]);
      d++;
    }
    out.push({ type: 'dialogue', text: dialogueLines.join('\n') });
    k = d;
  }

  return { parsed: out, consumed: k - start };
}

// --- Boneyard ---------------------------------------------------------------

function parseBoneyard(
  lines: string[],
  start: number,
): { parsed: ScreenplayElement[]; consumed: number } | null {
  // Handle single-line /* ... */ first.
  const first = lines[start];
  const sameLineClose = first.indexOf('*/', 2);
  if (sameLineClose !== -1) {
    return {
      parsed: [{ type: 'boneyard', text: first.slice(2, sameLineClose) }],
      consumed: 1,
    };
  }

  // Multi-line: collect until `*/` appears.
  const parts: string[] = [first.slice(2)]; // after the opening `/*`
  let k = start + 1;
  while (k < lines.length) {
    const l = lines[k];
    const closeIdx = l.indexOf('*/');
    if (closeIdx !== -1) {
      parts.push(l.slice(0, closeIdx));
      return {
        parsed: [{ type: 'boneyard', text: parts.join('\n') }],
        consumed: k - start + 1,
      };
    }
    parts.push(l);
    k++;
  }

  return null; // unclosed — caller falls back to action
}

// --- Line classifiers -------------------------------------------------------

const SCENE_PREFIXES = /^(INT\.\/EXT\.?|EXT\.\/INT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)(\s|$)/i;

function isSceneHeading(line: string): boolean {
  return SCENE_PREFIXES.test(line);
}

function isTransition(line: string): boolean {
  if (line.length === 0) return false;
  if (line !== line.toUpperCase()) return false;
  return /[A-Z].*TO:$/.test(line);
}

function isCharacterLine(line: string): boolean {
  if (line.length === 0) return false;
  // Strip optional trailing dual-dialogue caret for the test.
  const stripped = line.replace(/\s*\^$/, '');
  if (stripped.length === 0) return false;
  // Must contain at least one A-Z letter.
  if (!/[A-Z]/.test(stripped)) return false;
  // Characters can have parenthetical extensions: NAME (V.O.), NAME (CONT'D).
  // The whole line must be uppercase.
  return stripped === stripped.toUpperCase();
}
