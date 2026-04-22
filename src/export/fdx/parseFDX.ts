import { XMLParser } from 'fast-xml-parser';
import type { ScreenplayElement, TitlePageField } from '@/fountain/types';
import type { RecordedPageBreak } from '@/types/script';

/**
 * Reverse of exportToFDX: parse a Final Draft .fdx string back into
 * the element shapes our app already understands, PLUS the page-
 * break positions the source FDX asserted. Those recorded breaks are
 * the ground truth our paginate() engine gets calibrated against in a
 * follow-up commit.
 *
 * Pure: string in, object out. No DOM, no I/O. We use fast-xml-parser
 * rather than the browser's DOMParser because:
 *   - it runs identically in jsdom and the browser (no feature-detect
 *     shims)
 *   - zero native deps and small bundle footprint
 *   - straightforward attribute + array handling once configured
 *
 * Contract (ParsedFDX):
 *   elements             — ScreenplayElement[] mirroring the FDX body
 *   titlePage            — heuristic-detected TitlePageField[], null
 *                          when the document carries no title page
 *   recordedPageBreaks   — every time the source's Page attribute
 *                          STRICTLY INCREASES across paragraphs, a
 *                          break is recorded at that paragraph's
 *                          index (1-indexed page; 0-indexed array
 *                          position). Implicit "page 1" is never
 *                          emitted.
 *   warnings             — human-readable notes about lossy or
 *                          best-effort conversions (unknown paragraph
 *                          types, unhandled alignments, un-auto-
 *                          detectable title-page fields, missing
 *                          page metadata, etc.).
 *
 * Throws on malformed XML or documents without a FinalDraft root.
 * Everything else is either handled or turned into a warning —
 * nothing goes silently missing.
 */

export interface ParsedFDX {
  elements: ScreenplayElement[];
  titlePage: TitlePageField[] | null;
  recordedPageBreaks: RecordedPageBreak[];
  warnings: string[];
}

// ──────────────────────────────────────────────────────────────────────────
// XML parser configuration
// ──────────────────────────────────────────────────────────────────────────

/**
 * fast-xml-parser config notes:
 *
 *   - attributeNamePrefix: '@_' distinguishes attrs from child tags
 *     in the output object.
 *   - textNodeName: '#text' for mixed-content nodes (we don't really
 *     hit this in FDX but it's safe).
 *   - isArray: we force `Paragraph` (and a few others) to always be
 *     arrays so we can iterate without checking "is this a single
 *     object or a list?" every time.
 *   - parseTagValue / parseAttributeValue: OFF. We want every value
 *     as a string and coerce ourselves. Otherwise fast-xml-parser
 *     will coerce "1" to the number 1 and "1/2" to a string, which
 *     is inconsistent to handle.
 */
const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  isArray: (name: string): boolean => {
    // Anything that can appear more than once at the same level gets
    // forced to array. Over-including here is cheaper than under-
    // including (an array of one is trivial to handle).
    return name === 'Paragraph' || name === 'Text';
  },
};

// ──────────────────────────────────────────────────────────────────────────
// parseFDX
// ──────────────────────────────────────────────────────────────────────────

export function parseFDX(xml: string): ParsedFDX {
  const parser = new XMLParser(PARSER_OPTIONS);
  let parsed: FastXmlDoc;
  try {
    parsed = parser.parse(xml) as FastXmlDoc;
  } catch (e) {
    throw new Error(`Malformed FDX XML: ${(e as Error).message}`);
  }

  const root = parsed.FinalDraft;
  if (!root) {
    throw new Error('Not a FinalDraft document: missing <FinalDraft> root element');
  }

  const warnings: string[] = [];

  const { elements, paragraphPageAttrs } = parseBody(root.Content, warnings);
  const recordedPageBreaks = extractPageBreaks(
    elements,
    paragraphPageAttrs,
    warnings,
  );
  const titlePage = parseTitlePage(root.TitlePage, warnings);

  return { elements, titlePage, recordedPageBreaks, warnings };
}

// ──────────────────────────────────────────────────────────────────────────
// Body parsing
// ──────────────────────────────────────────────────────────────────────────

interface ParsedBody {
  elements: ScreenplayElement[];
  /** For each element, the Page attribute value (or null if absent). */
  paragraphPageAttrs: (number | null)[];
}

function parseBody(
  contentNode: FdxContent | undefined,
  warnings: string[],
): ParsedBody {
  const paragraphs = toArray<FdxParagraph>(contentNode?.Paragraph);
  const elements: ScreenplayElement[] = [];
  const pageAttrs: (number | null)[] = [];

  for (const para of paragraphs) {
    if (para.DualDialogue) {
      // DualDialogue wrapper: the outer <Paragraph> has no Type;
      // inner paragraphs carry the real types. Both characters get
      // `dual: true` — exported FDX puts the second speaker's cue
      // inside the wrapper, so we mark every Character we find here
      // as dual.
      const innerParas = toArray<FdxParagraph>(para.DualDialogue.Paragraph);
      for (const inner of innerParas) {
        const el = mapParagraphToElement(inner, warnings);
        if (el) {
          if (el.type === 'character') el.dual = true;
          elements.push(el);
          pageAttrs.push(readPageAttr(inner));
        }
      }
      continue;
    }

    // StartsNewPage="Yes" is FD's forced-break signal. Translate to
    // our `page-break` pseudo-element so downstream code (our own
    // paginate, re-export via exportToFDX) handles it uniformly.
    if (para['@_StartsNewPage'] === 'Yes') {
      elements.push({ type: 'page-break' });
      pageAttrs.push(null);
    }

    const el = mapParagraphToElement(para, warnings);
    if (el) {
      elements.push(el);
      pageAttrs.push(readPageAttr(para));
    }
  }

  return { elements, paragraphPageAttrs: pageAttrs };
}

function mapParagraphToElement(
  para: FdxParagraph,
  warnings: string[],
): ScreenplayElement | null {
  const type = para['@_Type'];
  const alignment = para['@_Alignment'];
  const text = extractTextContent(para.Text);

  switch (type) {
    case 'Scene Heading':
      return { type: 'scene', text };
    case 'Action':
      // Centered Action → our `centered` element type.
      if (alignment === 'Center') return { type: 'centered', text };
      if (alignment && alignment !== 'Left') {
        warnings.push(`Action with Alignment="${alignment}" imported as left-aligned`);
      }
      return { type: 'action', text };
    case 'Character':
      return { type: 'character', text };
    case 'Parenthetical': {
      // FDX stores parentheticals with literal `(…)` around the text;
      // our model stores the INNER text. Strip one level of parens.
      const stripped = text
        .replace(/^\s*\(\s*/, '')
        .replace(/\s*\)\s*$/, '');
      return { type: 'parenthetical', text: stripped };
    }
    case 'Dialogue':
      return { type: 'dialogue', text };
    case 'Transition':
      return { type: 'transition', text };
    case 'General':
    case 'Shot':
      // Real FDX types we don't model directly — fold to Action.
      // Warn only for Shot, which carries more semantic weight; General
      // shows up often enough to stay silent.
      if (type === 'Shot') {
        warnings.push('FDX "Shot" paragraph imported as action');
      }
      return { type: 'action', text };
    case 'New Act':
      return { type: 'section', depth: 1, text };
    case 'End of Act':
      warnings.push('FDX "End of Act" paragraph imported as section');
      return { type: 'section', depth: 1, text };
    default:
      if (!type) {
        // Bare <Paragraph> with no Type and no DualDialogue — unusual.
        // Fold to action so the text isn't lost.
        if (text.length > 0) {
          return { type: 'action', text };
        }
        return null;
      }
      warnings.push(
        `Unknown FDX Paragraph Type "${type}" imported as action (text preserved)`,
      );
      return { type: 'action', text };
  }
}

/**
 * Pull text content out of a <Text> child, handling the shapes
 * fast-xml-parser can return:
 *   - string (simple `<Text>hello</Text>`)
 *   - object with #text (`<Text Style="Bold">hello</Text>`)
 *   - array of either (multiple `<Text>` children in one paragraph,
 *     FD does this for runs with different emphasis)
 *
 * Multiple <Text> children get joined with a single line feed —
 * multi-line action / long dialogue comes out as a single element
 * with embedded `\n` characters, matching how the Fountain
 * serializer will emit it back out.
 */
function extractTextContent(textNode: unknown): string {
  if (textNode === undefined || textNode === null) return '';
  if (typeof textNode === 'string') return textNode;
  if (Array.isArray(textNode)) {
    return textNode.map(extractTextContent).filter((s) => s.length > 0).join('\n');
  }
  if (typeof textNode === 'object') {
    const obj = textNode as { '#text'?: unknown };
    if ('#text' in obj) return extractTextContent(obj['#text']);
  }
  return String(textNode);
}

function readPageAttr(para: FdxParagraph): number | null {
  const sceneProps = para.SceneProperties;
  const raw =
    (sceneProps && sceneProps['@_Page']) ??
    para['@_Page'] ??
    null;
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ──────────────────────────────────────────────────────────────────────────
// Page break extraction
// ──────────────────────────────────────────────────────────────────────────

function extractPageBreaks(
  elements: ScreenplayElement[],
  pageAttrs: (number | null)[],
  warnings: string[],
): RecordedPageBreak[] {
  const breaks: RecordedPageBreak[] = [];
  let lastSeenPage: number | null = null;
  let sawAnyPageAttr = false;

  for (let i = 0; i < pageAttrs.length; i++) {
    const page = pageAttrs[i];
    if (page === null) continue;
    sawAnyPageAttr = true;
    if (lastSeenPage === null) {
      // First paragraph with a Page attr establishes the baseline —
      // implicit page 1 (or whatever number this is), no break emitted.
      lastSeenPage = page;
      continue;
    }
    if (page > lastSeenPage) {
      breaks.push({ pageNumber: page, elementIndex: i });
      lastSeenPage = page;
    }
    // Equal: still on the same page; ignore.
    // Less-than: unusual (out-of-order Page attrs); ignore silently.
  }

  if (!sawAnyPageAttr && elements.length > 0) {
    // Zero Page attrs at all — the source was almost certainly
    // hand-edited or from a non-FD tool. Calibration can't use it.
    // (A short single-page script with Page="1" but no increases is
    // fine — no warning.)
    warnings.push(
      'No page metadata found in source FDX — recordedPageBreaks is empty',
    );
  }

  return breaks;
}

// ──────────────────────────────────────────────────────────────────────────
// Title page parsing (heuristic)
// ──────────────────────────────────────────────────────────────────────────

function parseTitlePage(
  titlePageNode: FdxTitlePage | undefined,
  warnings: string[],
): TitlePageField[] | null {
  if (!titlePageNode) return null;
  const paragraphs = toArray<FdxParagraph>(titlePageNode.Content?.Paragraph);
  if (paragraphs.length === 0) return null;

  // Collapse to non-empty paragraphs with alignment info preserved.
  const cleaned = paragraphs
    .map((p) => ({
      text: extractTextContent(p.Text).trim(),
      alignment: p['@_Alignment'] ?? null,
    }))
    .filter((p) => p.text.length > 0);

  if (cleaned.length === 0) return null;

  const result: TitlePageField[] = [];
  let titleEmitted = false;
  let creditEmitted = false;
  let expectAuthorNext = false;
  let unmatchedCount = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const { text, alignment } = cleaned[i];

    // Contact: email-ish or phone-ish pattern — highly distinctive.
    if (/\S+@\S+\.\S+/.test(text) || /^\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/.test(text)) {
      result.push({ key: 'Contact', value: text });
      expectAuthorNext = false;
      continue;
    }

    // Copyright marker — also distinctive.
    if (/©|\(c\)|copyright/i.test(text)) {
      result.push({ key: 'Copyright', value: text });
      expectAuthorNext = false;
      continue;
    }

    // Draft date: starts with "Draft", or matches a date-ish pattern.
    if (
      /^draft/i.test(text) ||
      /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$/.test(text) ||
      /^(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(
        text,
      )
    ) {
      result.push({ key: 'Draft date', value: text });
      expectAuthorNext = false;
      continue;
    }

    // First center-aligned paragraph is the Title.
    if (!titleEmitted && alignment === 'Center') {
      result.push({ key: 'Title', value: text });
      titleEmitted = true;
      continue;
    }

    // Credit line — "Written by" / "Story by" / "Based on" / "by".
    if (
      !creditEmitted &&
      (/^written by$/i.test(text) ||
        /^by$/i.test(text) ||
        /^story by\b/i.test(text) ||
        /^based on\b/i.test(text) ||
        /^adapted from\b/i.test(text))
    ) {
      result.push({ key: 'Credit', value: text });
      creditEmitted = true;
      expectAuthorNext = true;
      continue;
    }

    // Author = the paragraph immediately after Credit.
    if (expectAuthorNext) {
      result.push({ key: 'Author', value: text });
      expectAuthorNext = false;
      continue;
    }

    // Uppercase standalone paragraph near the top → probably the Title
    // when we haven't caught it via center-alignment (some exports
    // drop the Alignment attr).
    if (!titleEmitted && text === text.toUpperCase() && text.length < 80) {
      result.push({ key: 'Title', value: text });
      titleEmitted = true;
      continue;
    }

    // Fallback — preserve verbatim but flag so the user knows they may
    // want to clean up in the title-page drawer.
    result.push({ key: `_raw_${i}`, value: text });
    unmatchedCount++;
  }

  if (unmatchedCount > 0) {
    warnings.push(
      `Title page: ${unmatchedCount} paragraph${unmatchedCount === 1 ? '' : 's'} couldn't be auto-detected — preserved as _raw_* keys`,
    );
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────────────
// Utilities & types for fast-xml-parser output
// ──────────────────────────────────────────────────────────────────────────

function toArray<T>(input: T | T[] | undefined): T[] {
  if (input === undefined || input === null) return [];
  return Array.isArray(input) ? input : [input];
}

interface FastXmlDoc {
  FinalDraft?: {
    Content?: FdxContent;
    TitlePage?: FdxTitlePage;
  };
}

interface FdxContent {
  Paragraph?: FdxParagraph | FdxParagraph[];
}

interface FdxTitlePage {
  Content?: { Paragraph?: FdxParagraph | FdxParagraph[] };
}

interface FdxParagraph {
  '@_Type'?: string;
  '@_Alignment'?: string;
  '@_StartsNewPage'?: string;
  '@_Page'?: string;
  Text?: unknown;
  SceneProperties?: {
    '@_Page'?: string;
    '@_Number'?: string;
    '@_Title'?: string;
    '@_Length'?: string;
  };
  DualDialogue?: {
    Paragraph?: FdxParagraph | FdxParagraph[];
  };
}
