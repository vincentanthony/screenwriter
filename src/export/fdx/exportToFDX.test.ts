import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScreenplayElement } from '@/fountain/types';
import { parse } from '@/fountain/parse';
import { paginate } from '@/pagination/paginate';
import type { DialogueSplitResult, Measurer } from '@/pagination/measurer';
import { exportToFDX } from './exportToFDX';

/**
 * The same char-counting FakeMeasurer used by the pagination tests.
 * Keeps these tests deterministic and detached from real layout —
 * exportToFDX is pure, but it needs a Page[] to thread through, and
 * the engine is the right way to produce one.
 */
class FakeMeasurer implements Measurer {
  readonly lineHeightPx = 20;
  readonly pageHeightPx = 800;
  readonly charsPerLine = 60;

  private linesOf(text: string): number {
    const rawLines = text.split('\n');
    let total = 0;
    for (const raw of rawLines) {
      total += Math.max(1, Math.ceil(raw.length / this.charsPerLine));
    }
    return Math.max(total, 1);
  }

  measure(element: ScreenplayElement): number {
    if (element.type === 'page-break' || element.type === 'title-page') return 0;
    const text = 'text' in element ? element.text : '';
    return this.linesOf(text) * this.lineHeightPx;
  }

  findDialogueSplitPoint(): DialogueSplitResult | null {
    return null; // splits not relevant for these export tests
  }
}

function paginated(elements: ScreenplayElement[]) {
  const measurer = new FakeMeasurer();
  return paginate(elements, measurer);
}

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '../../fountain/__fixtures__/reference.fountain');
const fixture = readFileSync(fixturePath, 'utf8');

// Parse XML in a jsdom-friendly way for well-formedness assertions.
function parseXml(source: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(source, 'application/xml');
}

function isWellFormed(doc: Document): boolean {
  // Browsers (and jsdom) put a <parsererror> element in the parsed
  // document when XML is malformed.
  return doc.getElementsByTagName('parsererror').length === 0;
}

// ──────────────────────────────────────────────────────────────────────────
// Reference fixture round-trip
// ──────────────────────────────────────────────────────────────────────────

describe('exportToFDX — reference.fountain round-trip', () => {
  const elements = parse(fixture);
  const titlePage = elements.find((e) => e.type === 'title-page');
  const titlePageFields = titlePage?.type === 'title-page' ? titlePage.fields : null;
  const pages = paginated(elements);
  const xml = exportToFDX(elements, titlePageFields, pages);

  it('produces well-formed XML', () => {
    const doc = parseXml(xml);
    expect(isWellFormed(doc)).toBe(true);
  });

  it('declares UTF-8 encoding in the prolog', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"')).toBe(true);
  });

  it('has the FinalDraft root element with DocumentType=Script', () => {
    const doc = parseXml(xml);
    const root = doc.documentElement;
    expect(root.tagName).toBe('FinalDraft');
    expect(root.getAttribute('DocumentType')).toBe('Script');
  });

  it('has a Content block with at least one Paragraph per fixture body element', () => {
    const doc = parseXml(xml);
    const paragraphs = doc.querySelectorAll('FinalDraft > Content > Paragraph');
    expect(paragraphs.length).toBeGreaterThan(0);
  });

  it('emits Scene Heading paragraphs with sequential numbering starting at 1', () => {
    const doc = parseXml(xml);
    const sceneProps = Array.from(doc.querySelectorAll('Paragraph[Type="Scene Heading"] SceneProperties'));
    expect(sceneProps.length).toBeGreaterThan(0);
    const numbers = sceneProps.map((s) => Number(s.getAttribute('Number')));
    // Every number must be a positive integer and strictly ascending.
    for (let i = 0; i < numbers.length; i++) {
      expect(numbers[i]).toBe(i + 1);
    }
  });

  it('every Scene Heading carries a Page attribute', () => {
    const doc = parseXml(xml);
    const sceneProps = Array.from(doc.querySelectorAll('SceneProperties'));
    for (const s of sceneProps) {
      const page = s.getAttribute('Page');
      expect(page).not.toBeNull();
      expect(Number(page)).toBeGreaterThanOrEqual(1);
    }
  });

  it('renders all the in-fixture paragraph types present', () => {
    const doc = parseXml(xml);
    const types = new Set(
      Array.from(doc.querySelectorAll('FinalDraft > Content > Paragraph'))
        .map((p) => p.getAttribute('Type'))
        .filter((t): t is string => t !== null),
    );
    // The reference fixture includes every Tier-A element (and a few
    // Tier-B). Every one must surface as a known FDX paragraph Type.
    for (const required of ['Scene Heading', 'Action', 'Character', 'Parenthetical', 'Dialogue', 'Transition']) {
      expect(types.has(required), `missing FDX Type=${required}`).toBe(true);
    }
  });

  it('emits a TitlePage block with the fixture title', () => {
    const doc = parseXml(xml);
    const titleParagraphs = doc.querySelectorAll('TitlePage > Content > Paragraph');
    expect(titleParagraphs.length).toBeGreaterThan(0);
    const text = Array.from(titleParagraphs)
      .map((p) => p.textContent ?? '')
      .join('|');
    // The fixture's Title is "Reference Screenplay" — gets uppercased.
    expect(text).toContain('REFERENCE SCREENPLAY');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Escaping
// ──────────────────────────────────────────────────────────────────────────

describe('exportToFDX — escaping', () => {
  it('escapes <, >, &, ", \' in element text without breaking the XML', () => {
    const elements: ScreenplayElement[] = [
      { type: 'action', text: `<script>alert("hi & \'bye\'")</script>` },
    ];
    const xml = exportToFDX(elements, null, paginated(elements));
    const doc = parseXml(xml);
    expect(isWellFormed(doc)).toBe(true);
    const text = doc.querySelector('Paragraph[Type="Action"] Text')?.textContent ?? '';
    // Browser-decoded textContent equals the original — that's the
    // round-trip we want.
    expect(text).toBe(`<script>alert("hi & 'bye'")</script>`);
  });

  it('escapes characters in title-page values too', () => {
    const elements: ScreenplayElement[] = [];
    const xml = exportToFDX(elements, [{ key: 'Title', value: 'Tom & Jerry <ALL CAPS>' }], paginated(elements));
    const doc = parseXml(xml);
    expect(isWellFormed(doc)).toBe(true);
    const titleText = Array.from(doc.querySelectorAll('TitlePage > Content > Paragraph > Text'))
      .map((t) => t.textContent ?? '')
      .filter((s) => s.length > 0)
      .join('');
    // Title gets uppercased on the title page.
    expect(titleText).toContain('TOM & JERRY <ALL CAPS>');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Edge cases
// ──────────────────────────────────────────────────────────────────────────

describe('exportToFDX — edge cases', () => {
  it('produces valid minimal FDX for an empty script', () => {
    const xml = exportToFDX([], null, []);
    const doc = parseXml(xml);
    expect(isWellFormed(doc)).toBe(true);
    expect(doc.documentElement.tagName).toBe('FinalDraft');
    expect(doc.querySelector('Content')).not.toBeNull();
    expect(doc.querySelectorAll('Paragraph').length).toBe(0);
    expect(doc.querySelector('TitlePage')).toBeNull();
  });

  it('produces a TitlePage with empty Content for a title-page-only script', () => {
    const xml = exportToFDX(
      [],
      [
        { key: 'Title', value: 'Nothing Yet' },
        { key: 'Author', value: 'Solo' },
      ],
      [],
    );
    const doc = parseXml(xml);
    expect(isWellFormed(doc)).toBe(true);
    expect(doc.querySelector('TitlePage')).not.toBeNull();
    const bodyParagraphs = doc.querySelectorAll('FinalDraft > Content > Paragraph');
    expect(bodyParagraphs.length).toBe(0);
  });

  it('wraps both speakers of a dual-dialogue pair in a single DualDialogue element', () => {
    const elements: ScreenplayElement[] = [
      { type: 'character', text: 'ALICE' },
      { type: 'dialogue', text: 'Hi.' },
      { type: 'character', text: 'BOB', dual: true },
      { type: 'dialogue', text: 'Hey.' },
    ];
    const xml = exportToFDX(elements, null, paginated(elements));
    const doc = parseXml(xml);
    expect(isWellFormed(doc)).toBe(true);

    const duals = doc.querySelectorAll('DualDialogue');
    expect(duals.length).toBe(1);
    // The DualDialogue should contain BOTH speakers' character cues
    // and dialogue.
    const inner = duals[0];
    const characters = inner.querySelectorAll('Paragraph[Type="Character"]');
    const dialogues = inner.querySelectorAll('Paragraph[Type="Dialogue"]');
    expect(characters.length).toBe(2);
    expect(dialogues.length).toBe(2);
    expect(characters[0].textContent).toContain('ALICE');
    expect(characters[1].textContent).toContain('BOB');
  });

  it('places StartsNewPage="Yes" on the paragraph following a forced page-break element', () => {
    const elements: ScreenplayElement[] = [
      { type: 'action', text: 'before' },
      { type: 'page-break' },
      { type: 'action', text: 'after' },
    ];
    const xml = exportToFDX(elements, null, paginated(elements));
    const doc = parseXml(xml);
    const paragraphs = Array.from(doc.querySelectorAll('FinalDraft > Content > Paragraph'));
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].getAttribute('StartsNewPage')).toBeNull();
    expect(paragraphs[1].getAttribute('StartsNewPage')).toBe('Yes');
    expect(paragraphs[1].textContent).toContain('after');
  });

  it('wraps Parenthetical text in literal ( ) parens (FD expects the chars)', () => {
    const elements: ScreenplayElement[] = [
      { type: 'character', text: 'ALICE' },
      { type: 'parenthetical', text: 'softly' },
      { type: 'dialogue', text: 'Hi.' },
    ];
    const xml = exportToFDX(elements, null, paginated(elements));
    const doc = parseXml(xml);
    const parens = doc.querySelector('Paragraph[Type="Parenthetical"] Text');
    expect(parens?.textContent).toBe('(softly)');
  });

  it('emits Centered text as Action with Alignment="Center"', () => {
    const elements: ScreenplayElement[] = [{ type: 'centered', text: 'THE END' }];
    const xml = exportToFDX(elements, null, paginated(elements));
    const doc = parseXml(xml);
    const para = doc.querySelector('Paragraph[Type="Action"]');
    expect(para?.getAttribute('Alignment')).toBe('Center');
    expect(para?.textContent).toContain('THE END');
  });

  it('skips Fountain-only constructs (boneyard, synopsis, note) from the body', () => {
    const elements: ScreenplayElement[] = [
      { type: 'boneyard', text: 'cut me' },
      { type: 'synopsis', text: 'about this scene' },
      { type: 'note', text: 'production note' },
      { type: 'action', text: 'visible action' },
    ];
    const xml = exportToFDX(elements, null, paginated(elements));
    const doc = parseXml(xml);
    const paragraphs = doc.querySelectorAll('FinalDraft > Content > Paragraph');
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].textContent).toContain('visible action');
    // The skipped text shouldn't leak into the document.
    expect(xml).not.toContain('cut me');
    expect(xml).not.toContain('about this scene');
    expect(xml).not.toContain('production note');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Determinism
// ──────────────────────────────────────────────────────────────────────────

describe('exportToFDX — determinism', () => {
  it('returns byte-identical output for two calls with the same inputs', () => {
    const elements: ScreenplayElement[] = [
      { type: 'scene', text: 'INT. ROOM - DAY' },
      { type: 'action', text: 'She walks in.' },
      { type: 'character', text: 'ALICE' },
      { type: 'dialogue', text: 'Hello.' },
    ];
    const titlePage = [
      { key: 'Title', value: 'X' },
      { key: 'Author', value: 'Y' },
    ];
    const pages = paginated(elements);
    const a = exportToFDX(elements, titlePage, pages);
    const b = exportToFDX(elements, titlePage, pages);
    expect(b).toBe(a);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Pagination consistency — Page attribute matches the engine's output
// ──────────────────────────────────────────────────────────────────────────

describe('exportToFDX — page consistency with paginate()', () => {
  it("the SceneProperties Page attribute matches paginate()'s page assignment", () => {
    const elements: ScreenplayElement[] = [
      { type: 'scene', text: 'INT. ROOM - DAY' },
      { type: 'action', text: 'short' },
      { type: 'page-break' },
      { type: 'scene', text: 'EXT. STREET - NIGHT' },
      { type: 'action', text: 'short' },
    ];
    const pages = paginated(elements);
    const xml = exportToFDX(elements, null, pages);
    const doc = parseXml(xml);
    const sceneProps = Array.from(doc.querySelectorAll('SceneProperties'));
    expect(sceneProps).toHaveLength(2);
    // First scene on page 1, second scene on page 2 — forced break between.
    expect(sceneProps[0].getAttribute('Page')).toBe('1');
    expect(sceneProps[1].getAttribute('Page')).toBe('2');
  });
});
