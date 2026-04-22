import type { TitlePageField } from '@/fountain/types';
import { escapeXml } from './escape';

/**
 * Emit the FDX `<TitlePage>` block from our TitlePageField[].
 *
 * FDX models the title page as a sequence of <Paragraph> elements
 * with explicit Alignment, separated by empty paragraphs for vertical
 * spacing. We follow Final Draft's typical export shape:
 *
 *   - Title:        Center, uppercased
 *   - Credit:       Center
 *   - Author:       Center
 *   - Source:       Center
 *   - Notes:        Left
 *   - Copyright:    Left
 *   - Contact:      Left  (typically bottom-left in real FD layout)
 *   - Draft date:   Right (typically bottom-right)
 *
 * Empty paragraphs between blocks approximate FD's vertical spacing.
 * Pixel-perfect positioning isn't possible without knowing FD's
 * exact paragraph spacing rules; this is "open and recognizable",
 * not "render-identical to native FD title page".
 *
 * Fields not in the canonical list (e.g. someone pasting "Language:
 * French" from a Fountain file) are emitted at the end as Left-
 * aligned paragraphs so they're at least preserved visually.
 *
 * Empty value? Skipped entirely — no point in an empty paragraph
 * whose only purpose was carrying the field.
 *
 * VERIFY against Final Draft:
 *   - whether Alignment="Right" works on title page paragraphs (FD
 *     might require a different attribute name for title-page
 *     specifically)
 *   - whether the title needs explicit underline styling (our
 *     in-app preview underlines but the title page in FDX may not)
 */

interface FieldRule {
  key: string;
  alignment: 'Left' | 'Center' | 'Right';
  uppercase?: boolean;
}

const KNOWN_FIELDS: readonly FieldRule[] = [
  { key: 'Title', alignment: 'Center', uppercase: true },
  { key: 'Credit', alignment: 'Center' },
  { key: 'Author', alignment: 'Center' },
  { key: 'Source', alignment: 'Center' },
  { key: 'Notes', alignment: 'Left' },
  { key: 'Copyright', alignment: 'Left' },
  { key: 'Contact', alignment: 'Left' },
  { key: 'Draft date', alignment: 'Right' },
];

const KNOWN_KEYS = new Set(KNOWN_FIELDS.map((f) => f.key));

/**
 * Defensive coercion for title-page field values.
 *
 * TitlePageField.value is typed `string`, but we've seen field values
 * arrive as objects (via corrupted fountain strings containing the
 * literal `[object Object]`, typically sourced from an FDX import bug
 * upstream). Rather than emit garbage into FD-facing XML, we:
 *
 *   - return empty for anything that isn't actually a string
 *   - return empty when the value equals the literal `[object Object]`
 *     sentinel — not a title any human types, so treating it as noise
 *     is safe and keeps the exported title page visually clean
 *
 * Upstream parser fix for `_raw_N: [object Object]` on import is
 * tracked separately; this is the downstream blast-radius shield.
 */
function safeString(value: unknown): string {
  if (typeof value !== 'string') return '';
  if (value === '[object Object]') return '';
  return value;
}

export function emitTitlePage(titlePage: TitlePageField[] | null): string {
  // No title page → no <TitlePage> element. FD treats the absence as
  // "no title page" and starts the script straight on page 1.
  if (!titlePage || titlePage.length === 0) return '';

  const valueOf = (key: string) =>
    safeString(titlePage.find((f) => f.key === key)?.value).trim();

  const paragraphs: string[] = [];

  for (const rule of KNOWN_FIELDS) {
    const raw = valueOf(rule.key);
    if (raw.length === 0) continue;
    const text = rule.uppercase ? raw.toUpperCase() : raw;
    paragraphs.push(emitFieldBlock(text, rule.alignment));
  }

  // Preserve unknown keys at the end (left-aligned).
  for (const field of titlePage) {
    if (KNOWN_KEYS.has(field.key)) continue;
    const raw = safeString(field.value).trim();
    if (raw.length === 0) continue;
    paragraphs.push(emitFieldBlock(`${field.key}: ${raw}`, 'Left'));
  }

  // A few empty paragraphs at the top approximate FD's title block
  // sitting roughly a third of the way down the page.
  const topPadding = Array.from({ length: 8 }, () => emptyParagraph()).join('');

  return `<TitlePage>
<Content>
${topPadding}${paragraphs.join(emptyParagraph())}
</Content>
</TitlePage>`;
}

/**
 * Emit one or more <Paragraph> tags for a field's value. Multi-line
 * values (e.g. a multi-line Contact address with literal newlines)
 * become one <Paragraph> per line so FD lays them out correctly.
 */
function emitFieldBlock(text: string, alignment: 'Left' | 'Center' | 'Right'): string {
  return text
    .split('\n')
    .map((line) => paragraphLine(line, alignment))
    .join('');
}

function paragraphLine(text: string, alignment: 'Left' | 'Center' | 'Right'): string {
  return `<Paragraph Alignment="${alignment}"><Text>${escapeXml(text)}</Text></Paragraph>`;
}

function emptyParagraph(): string {
  return '<Paragraph Alignment="Center"><Text></Text></Paragraph>';
}
