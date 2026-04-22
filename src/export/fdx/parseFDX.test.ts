import { describe, expect, it } from 'vitest';
import type { ScreenplayElement } from '@/fountain/types';
import { paginate } from '@/pagination/paginate';
import type { DialogueSplitResult, Measurer } from '@/pagination/measurer';
import { exportToFDX } from './exportToFDX';
import { parseFDX } from './parseFDX';

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

class FakeMeasurer implements Measurer {
  readonly lineHeightPx = 20;
  readonly pageHeightPx = 800;
  measure(el: ScreenplayElement): number {
    if (el.type === 'page-break' || el.type === 'title-page') return 0;
    const text = 'text' in el ? el.text : '';
    return Math.max(1, Math.ceil(text.length / 60)) * this.lineHeightPx;
  }
  findDialogueSplitPoint(): DialogueSplitResult | null {
    return null;
  }
}

function paginated(elements: ScreenplayElement[]) {
  return paginate(elements, new FakeMeasurer());
}

// ──────────────────────────────────────────────────────────────────────────
// Round-trip (Fountain → FDX → parseFDX → Fountain-shape)
// ──────────────────────────────────────────────────────────────────────────

describe('parseFDX — round-trip through exportToFDX', () => {
  it('body elements survive a full round-trip', () => {
    const elements: ScreenplayElement[] = [
      { type: 'scene', text: 'INT. ROOM - DAY' },
      { type: 'action', text: 'She walks in.' },
      { type: 'character', text: 'ALICE' },
      { type: 'parenthetical', text: 'softly' },
      { type: 'dialogue', text: 'Hello.' },
      { type: 'transition', text: 'CUT TO:' },
      { type: 'centered', text: 'THE END' },
    ];
    const xml = exportToFDX(elements, null, paginated(elements));
    const parsed = parseFDX(xml);

    expect(parsed.warnings).toEqual([]);
    // Compare element types in order — byte-equality of text isn't
    // guaranteed because exports/imports normalize (e.g. scene
    // uppercasing is already in the Fountain serialize guard), but
    // types + text content should match.
    expect(parsed.elements.map((e) => e.type)).toEqual([
      'scene',
      'action',
      'character',
      'parenthetical',
      'dialogue',
      'transition',
      'centered',
    ]);
    expect(
      parsed.elements
        .filter((e): e is Extract<ScreenplayElement, { text: string }> => 'text' in e)
        .map((e) => e.text),
    ).toEqual([
      'INT. ROOM - DAY',
      'She walks in.',
      'ALICE',
      'softly',
      'Hello.',
      'CUT TO:',
      'THE END',
    ]);
  });

  it('title page fields survive a round-trip', () => {
    const titlePage = [
      { key: 'Title', value: 'My Script' },
      { key: 'Credit', value: 'Written by' },
      { key: 'Author', value: 'Claude' },
    ];
    const xml = exportToFDX([], titlePage, []);
    const parsed = parseFDX(xml);
    expect(parsed.titlePage).not.toBeNull();
    const byKey = (k: string) => parsed.titlePage?.find((f) => f.key === k)?.value;
    expect(byKey('Title')).toBe('MY SCRIPT'); // exporter uppercases; importer preserves
    expect(byKey('Credit')).toBe('Written by');
    expect(byKey('Author')).toBe('Claude');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Page break extraction
// ──────────────────────────────────────────────────────────────────────────

describe('parseFDX — recordedPageBreaks', () => {
  it('extracts a break where a Scene Heading Page attr increases', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
    <Paragraph Type="Scene Heading">
      <SceneProperties Length="1/8" Page="1" Title="" Number="1"><SceneArcBeats/></SceneProperties>
      <Text>INT. ROOM - DAY</Text>
    </Paragraph>
    <Paragraph Type="Action"><Text>short</Text></Paragraph>
    <Paragraph Type="Scene Heading">
      <SceneProperties Length="1/8" Page="2" Title="" Number="2"><SceneArcBeats/></SceneProperties>
      <Text>EXT. STREET - NIGHT</Text>
    </Paragraph>
    <Paragraph Type="Action"><Text>rain</Text></Paragraph>
    <Paragraph Type="Scene Heading">
      <SceneProperties Length="1/8" Page="3" Title="" Number="3"><SceneArcBeats/></SceneProperties>
      <Text>INT. CAR - CONTINUOUS</Text>
    </Paragraph>
  </Content>
</FinalDraft>`;
    const parsed = parseFDX(xml);
    expect(parsed.recordedPageBreaks).toHaveLength(2);
    expect(parsed.recordedPageBreaks[0].pageNumber).toBe(2);
    expect(parsed.recordedPageBreaks[1].pageNumber).toBe(3);
    // Element indices point at the scene headings opening those pages.
    const [b2, b3] = parsed.recordedPageBreaks;
    const at2 = parsed.elements[b2.elementIndex];
    const at3 = parsed.elements[b3.elementIndex];
    expect(at2.type).toBe('scene');
    expect(at3.type).toBe('scene');
    expect(at2.type === 'scene' ? at2.text : '').toBe('EXT. STREET - NIGHT');
  });

  it('ignores equal Page attrs on successive paragraphs (no spurious breaks)', () => {
    const xml = `<?xml version="1.0"?>
<FinalDraft><Content>
  <Paragraph Type="Scene Heading">
    <SceneProperties Page="1" Number="1"/><Text>INT. ROOM - DAY</Text>
  </Paragraph>
  <Paragraph Type="Scene Heading">
    <SceneProperties Page="1" Number="2"/><Text>INT. HALL - CONTINUOUS</Text>
  </Paragraph>
</Content></FinalDraft>`;
    const parsed = parseFDX(xml);
    expect(parsed.recordedPageBreaks).toEqual([]);
  });

  it('emits a warning when the source has no page metadata at all', () => {
    const xml = `<?xml version="1.0"?>
<FinalDraft><Content>
  <Paragraph Type="Action"><Text>just action, no pages</Text></Paragraph>
  <Paragraph Type="Action"><Text>more action</Text></Paragraph>
</Content></FinalDraft>`;
    const parsed = parseFDX(xml);
    expect(parsed.recordedPageBreaks).toEqual([]);
    expect(parsed.warnings.join(' ')).toMatch(/No page metadata/i);
  });

  it('translates StartsNewPage="Yes" into a page-break element', () => {
    const xml = `<?xml version="1.0"?>
<FinalDraft><Content>
  <Paragraph Type="Action"><Text>before</Text></Paragraph>
  <Paragraph Type="Action" StartsNewPage="Yes"><Text>after</Text></Paragraph>
</Content></FinalDraft>`;
    const parsed = parseFDX(xml);
    const types = parsed.elements.map((e) => e.type);
    expect(types).toEqual(['action', 'page-break', 'action']);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Dual dialogue
// ──────────────────────────────────────────────────────────────────────────

describe('parseFDX — dual dialogue', () => {
  it('sets dual: true on BOTH characters inside a DualDialogue wrapper', () => {
    const xml = `<?xml version="1.0"?>
<FinalDraft><Content>
  <Paragraph>
    <DualDialogue>
      <Paragraph Type="Character"><Text>ALICE</Text></Paragraph>
      <Paragraph Type="Dialogue"><Text>Hi.</Text></Paragraph>
      <Paragraph Type="Character"><Text>BOB</Text></Paragraph>
      <Paragraph Type="Dialogue"><Text>Hey.</Text></Paragraph>
    </DualDialogue>
  </Paragraph>
</Content></FinalDraft>`;
    const parsed = parseFDX(xml);
    const characters = parsed.elements.filter((e) => e.type === 'character');
    expect(characters).toHaveLength(2);
    expect(characters.every((c) => c.type === 'character' && c.dual === true)).toBe(true);
    // Order is preserved.
    expect(characters.map((c) => (c.type === 'character' ? c.text : ''))).toEqual([
      'ALICE',
      'BOB',
    ]);
  });

  it('preserves the full dialogue group order: character / dialogue / character / dialogue', () => {
    const xml = `<?xml version="1.0"?>
<FinalDraft><Content>
  <Paragraph>
    <DualDialogue>
      <Paragraph Type="Character"><Text>A</Text></Paragraph>
      <Paragraph Type="Dialogue"><Text>one</Text></Paragraph>
      <Paragraph Type="Character"><Text>B</Text></Paragraph>
      <Paragraph Type="Dialogue"><Text>two</Text></Paragraph>
    </DualDialogue>
  </Paragraph>
</Content></FinalDraft>`;
    const parsed = parseFDX(xml);
    expect(parsed.elements.map((e) => e.type)).toEqual([
      'character',
      'dialogue',
      'character',
      'dialogue',
    ]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Unknown types / alignment handling
// ──────────────────────────────────────────────────────────────────────────

describe('parseFDX — unknown element types', () => {
  it('folds an unknown Type to action and emits a warning (text preserved)', () => {
    const xml = `<?xml version="1.0"?>
<FinalDraft><Content>
  <Paragraph Type="MysteryMeat"><Text>keep this text</Text></Paragraph>
</Content></FinalDraft>`;
    const parsed = parseFDX(xml);
    expect(parsed.elements).toHaveLength(1);
    expect(parsed.elements[0].type).toBe('action');
    const el = parsed.elements[0];
    expect(el.type === 'action' ? el.text : '').toBe('keep this text');
    expect(parsed.warnings.join(' ')).toMatch(/MysteryMeat/);
  });

  it('maps General and Shot to action (Shot warns, General stays silent)', () => {
    const xml = `<?xml version="1.0"?>
<FinalDraft><Content>
  <Paragraph Type="General"><Text>g</Text></Paragraph>
  <Paragraph Type="Shot"><Text>s</Text></Paragraph>
</Content></FinalDraft>`;
    const parsed = parseFDX(xml);
    expect(parsed.elements.map((e) => e.type)).toEqual(['action', 'action']);
    expect(parsed.warnings.filter((w) => /Shot/.test(w))).toHaveLength(1);
    expect(parsed.warnings.filter((w) => /General/.test(w))).toHaveLength(0);
  });

  it('Action + Alignment="Center" becomes our centered element type', () => {
    const xml = `<?xml version="1.0"?>
<FinalDraft><Content>
  <Paragraph Type="Action" Alignment="Center"><Text>THE END</Text></Paragraph>
</Content></FinalDraft>`;
    const parsed = parseFDX(xml);
    expect(parsed.elements).toEqual([{ type: 'centered', text: 'THE END' }]);
  });

  it('strips outer parens from Parenthetical text on import', () => {
    const xml = `<?xml version="1.0"?>
<FinalDraft><Content>
  <Paragraph Type="Character"><Text>ALICE</Text></Paragraph>
  <Paragraph Type="Parenthetical"><Text>(softly)</Text></Paragraph>
  <Paragraph Type="Dialogue"><Text>Hi.</Text></Paragraph>
</Content></FinalDraft>`;
    const parsed = parseFDX(xml);
    const paren = parsed.elements[1];
    expect(paren.type).toBe('parenthetical');
    expect(paren.type === 'parenthetical' ? paren.text : '').toBe('softly');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Title page heuristics
// ──────────────────────────────────────────────────────────────────────────

describe('parseFDX — title page heuristics', () => {
  it('detects Title / Credit / Author / Contact from a conventional title page', () => {
    const xml = `<?xml version="1.0"?>
<FinalDraft><Content/>
<TitlePage><Content>
  <Paragraph Alignment="Center"><Text>THE HERO'S JOURNEY</Text></Paragraph>
  <Paragraph Alignment="Center"><Text>Written by</Text></Paragraph>
  <Paragraph Alignment="Center"><Text>Claude</Text></Paragraph>
  <Paragraph Alignment="Left"><Text>claude@example.com</Text></Paragraph>
</Content></TitlePage>
</FinalDraft>`;
    const parsed = parseFDX(xml);
    const keys = (parsed.titlePage ?? []).map((f) => f.key);
    expect(keys).toContain('Title');
    expect(keys).toContain('Credit');
    expect(keys).toContain('Author');
    expect(keys).toContain('Contact');
  });

  it('detects Draft date from "Draft 2" and from month-name dates', () => {
    const xml = `<?xml version="1.0"?>
<FinalDraft><Content/>
<TitlePage><Content>
  <Paragraph Alignment="Right"><Text>January 2026</Text></Paragraph>
  <Paragraph Alignment="Right"><Text>Draft 2</Text></Paragraph>
</Content></TitlePage>
</FinalDraft>`;
    const parsed = parseFDX(xml);
    const draftDateFields = (parsed.titlePage ?? []).filter((f) => f.key === 'Draft date');
    expect(draftDateFields).toHaveLength(2);
  });

  it('preserves un-detectable paragraphs as _raw_N and warns', () => {
    const xml = `<?xml version="1.0"?>
<FinalDraft><Content/>
<TitlePage><Content>
  <Paragraph Alignment="Left"><Text>some weird metadata line</Text></Paragraph>
</Content></TitlePage>
</FinalDraft>`;
    const parsed = parseFDX(xml);
    const raw = (parsed.titlePage ?? []).filter((f) => f.key.startsWith('_raw_'));
    expect(raw).toHaveLength(1);
    expect(raw[0].value).toBe('some weird metadata line');
    expect(parsed.warnings.some((w) => /couldn't be auto-detected/.test(w))).toBe(true);
  });

  it('returns null titlePage when the FDX has no <TitlePage>', () => {
    const xml = `<?xml version="1.0"?>
<FinalDraft><Content>
  <Paragraph Type="Action"><Text>only body</Text></Paragraph>
</Content></FinalDraft>`;
    const parsed = parseFDX(xml);
    expect(parsed.titlePage).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Malformed / empty
// ──────────────────────────────────────────────────────────────────────────

describe('parseFDX — error paths', () => {
  it('throws on XML that is plain not-XML', () => {
    expect(() => parseFDX('this is not xml at all')).toThrow(/Malformed|FinalDraft/i);
  });

  it('throws when the root element is not <FinalDraft>', () => {
    expect(() => parseFDX('<?xml version="1.0"?><NotFinalDraft/>')).toThrow(/FinalDraft/i);
  });

  it('parses an empty FinalDraft to empty elements, empty breaks, null title page', () => {
    const parsed = parseFDX('<?xml version="1.0"?><FinalDraft><Content/></FinalDraft>');
    expect(parsed.elements).toEqual([]);
    expect(parsed.recordedPageBreaks).toEqual([]);
    expect(parsed.titlePage).toBeNull();
  });
});
