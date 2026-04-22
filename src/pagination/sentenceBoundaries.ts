/**
 * Candidate split points for a dialogue string, preferred order:
 *
 *   1. Sentence boundaries — `.`, `?`, or `!` followed by (optional
 *      closing quote/bracket,) whitespace, and an uppercase letter or
 *      opening quote. Rejected when the word preceding the punctuation
 *      matches a known abbreviation ("Dr. Smith", "U.S. forces"). This
 *      is a pragmatic heuristic — real natural-language sentence
 *      tokenization is a follow-up. Ellipsis and decimals are both
 *      excluded by the "uppercase-after-space" lookahead.
 *
 *   2. Word boundaries — any whitespace run. Used when no sentence
 *      boundary fits the remaining space.
 *
 * The engine's `paginate()` asks for candidate indices and lets the
 * Measurer pick the largest one that fits by measuring range heights
 * in the live DOM. We return absolute CHARACTER indices (suitable for
 * `text.slice(0, idx)` / `text.slice(idx)`), not ranges or offsets.
 */

const ABBREVIATIONS = new Set<string>([
  'Mr', 'Mrs', 'Ms', 'Dr', 'Jr', 'Sr', 'St',
  'Prof', 'Rev', 'Capt', 'Lt', 'Sgt', 'Col',
  'vs', 'etc', 'Inc', 'Ltd', 'Corp', 'Co',
  'No', 'Fig', 'Vol', 'Ed', 'Pg',
]);

/**
 * Returns ascending character indices where splitting
 * `text.slice(0, idx).trim()` / `text.slice(idx).trim()` is safe.
 * Preference order (sentence first, word second) is preserved in the
 * returned arrays.
 */
export function findSentenceBoundaries(text: string): number[] {
  const boundaries: number[] = [];
  // Match a sentence-ending punctuation + optional closing quote/bracket + whitespace + uppercase letter or opening quote.
  const re = /([.!?])(["')\]]?)\s+(?=["'(\[]?[A-Z])/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    // Position right after the punctuation + optional closer — the
    // split index we hand back. text.slice(0, idx) includes the
    // punctuation; text.slice(idx) starts at the whitespace, which
    // trim() discards.
    const punctIdx = match.index;
    const idx = punctIdx + match[1].length + match[2].length;

    // Abbreviation guard: the word directly before the punctuation.
    const wordMatch = /(\w+)$/.exec(text.slice(0, punctIdx));
    if (wordMatch && ABBREVIATIONS.has(wordMatch[1])) continue;

    boundaries.push(idx);
  }

  return boundaries;
}

export function findWordBoundaries(text: string): number[] {
  const boundaries: number[] = [];
  const re = /\s+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    // Skip leading/trailing whitespace runs — splitting there just
    // produces an empty head or tail.
    if (match.index === 0) continue;
    if (match.index + match[0].length === text.length) continue;
    boundaries.push(match.index);
  }
  return boundaries;
}
