import { describe, expect, it } from 'vitest';
import type { ScreenplayElement } from '@/fountain/types';
import type { DialogueSplitResult, Measurer } from './measurer';
import { paginate } from './paginate';
import { findSentenceBoundaries, findWordBoundaries } from './sentenceBoundaries';

/**
 * A deterministic Measurer that sizes elements by character count:
 * ~60 chars per line, 20px per line, 800px per page. Close enough to
 * real screenplay density that rule-driven tests read naturally while
 * staying entirely under our control.
 *
 * findDialogueSplitPoint mirrors the real algorithm — prefer sentence
 * boundaries, fall back to word boundaries, return null if nothing
 * fits — but uses predictable char-count math instead of real layout.
 */
class FakeMeasurer implements Measurer {
  readonly lineHeightPx = 20;
  readonly pageHeightPx = 800;
  readonly charsPerLine = 60;

  private linesOf(text: string): number {
    // Honor explicit newlines, then wrap long single lines.
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

  findDialogueSplitPoint(
    element: ScreenplayElement,
    remainingPx: number,
  ): DialogueSplitResult | null {
    if (element.type !== 'dialogue') return null;
    const text = element.text;
    if (text.length === 0) return null;

    const maxLines = Math.floor(remainingPx / this.lineHeightPx);
    if (maxLines <= 0) return null;
    const maxChars = maxLines * this.charsPerLine;

    const candidates = [
      ...findSentenceBoundaries(text),
      ...findWordBoundaries(text),
    ];

    // Largest candidate whose prefix fits.
    let best: number | null = null;
    for (const idx of candidates) {
      // Use the prefix's LINE COUNT (honoring newlines), not its char
      // count, so the fake matches the real Measurer's behavior.
      const prefixLines = this.linesOf(text.slice(0, idx).trim());
      if (prefixLines * this.lineHeightPx > remainingPx) continue;
      if (best === null || idx > best) best = idx;
      // Small optimization: if we've already reached maxChars we're done.
      if (best !== null && best >= maxChars) break;
    }

    if (best === null) return null;
    const headText = text.slice(0, best).trim();
    const tailText = text.slice(best).trim();
    if (headText.length === 0 || tailText.length === 0) return null;
    return { headText, tailText };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Determinism
// ──────────────────────────────────────────────────────────────────────────

describe('paginate — determinism', () => {
  it('returns JSON-equal output when called twice with the same inputs', () => {
    const measurer = new FakeMeasurer();
    const elements: ScreenplayElement[] = [
      { type: 'scene', text: 'INT. ROOM - DAY' },
      { type: 'action', text: 'She walks in.' },
      { type: 'character', text: 'ALICE' },
      { type: 'dialogue', text: 'Hi.' },
    ];
    const a = paginate(elements, measurer);
    const b = paginate(elements, measurer);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('does not mutate the input array or its elements (round-trip property)', () => {
    const measurer = new FakeMeasurer();
    const el1: ScreenplayElement = { type: 'scene', text: 'INT. ROOM - DAY' };
    const el2: ScreenplayElement = { type: 'action', text: 'short action' };
    const elements: ScreenplayElement[] = [el1, el2];
    const beforeLength = elements.length;

    paginate(elements, measurer);

    expect(elements).toHaveLength(beforeLength);
    expect(elements[0]).toBe(el1);
    expect(elements[1]).toBe(el2);
    // Non-split page-slots reference the original element by identity.
    const pages = paginate(elements, measurer);
    expect(pages[0].elements[0].element).toBe(el1);
    expect(pages[0].elements[1].element).toBe(el2);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Simple flow
// ──────────────────────────────────────────────────────────────────────────

describe('paginate — simple cases', () => {
  it('everything fits on a single page', () => {
    const measurer = new FakeMeasurer();
    const elements: ScreenplayElement[] = [
      { type: 'action', text: 'a short action' },
      { type: 'action', text: 'another' },
    ];
    const pages = paginate(elements, measurer);
    expect(pages).toHaveLength(1);
    expect(pages[0].pageNumber).toBe(1);
    expect(pages[0].elements).toHaveLength(2);
  });

  it('drops title-page elements (they do not consume body pages)', () => {
    const measurer = new FakeMeasurer();
    const elements: ScreenplayElement[] = [
      { type: 'title-page', fields: [{ key: 'Title', value: 'X' }] },
      { type: 'action', text: 'first action' },
    ];
    const pages = paginate(elements, measurer);
    expect(pages).toHaveLength(1);
    expect(pages[0].elements).toHaveLength(1);
    expect(pages[0].elements[0].element.type).toBe('action');
  });

  it('preserves originalIndex into the ORIGINAL (pre-filter) array', () => {
    const measurer = new FakeMeasurer();
    const elements: ScreenplayElement[] = [
      { type: 'title-page', fields: [] }, // index 0, filtered
      { type: 'action', text: 'first' }, // index 1
      { type: 'action', text: 'second' }, // index 2
    ];
    const pages = paginate(elements, measurer);
    expect(pages[0].elements.map((p) => p.originalIndex)).toEqual([1, 2]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Forced page break
// ──────────────────────────────────────────────────────────────────────────

describe('paginate — forced page break', () => {
  it('a page-break element starts a new page, producing exactly two pages', () => {
    const measurer = new FakeMeasurer();
    const elements: ScreenplayElement[] = [
      { type: 'action', text: 'before' },
      { type: 'page-break' },
      { type: 'action', text: 'after' },
    ];
    const pages = paginate(elements, measurer);
    expect(pages).toHaveLength(2);
    expect(pages[0].elements[0].element.type).toBe('action');
    expect(pages[0].elements[0].element).toMatchObject({ text: 'before' });
    expect(pages[1].elements[0].element).toMatchObject({ text: 'after' });
    // The page-break itself doesn't land on any page — it's a control signal.
    const allElements = pages.flatMap((p) => p.elements);
    expect(allElements.some((p) => p.element.type === 'page-break')).toBe(false);
  });

  it('consecutive page-breaks do not produce empty pages', () => {
    const measurer = new FakeMeasurer();
    const elements: ScreenplayElement[] = [
      { type: 'action', text: 'a' },
      { type: 'page-break' },
      { type: 'page-break' },
      { type: 'action', text: 'b' },
    ];
    const pages = paginate(elements, measurer);
    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.elements.length)).toEqual([1, 1]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Rule 1 — Character keeps with Dialogue
// ──────────────────────────────────────────────────────────────────────────

describe('paginate — Rule 1: Character + Dialogue keep together', () => {
  it('pushes Character to the next page when it would be stranded at page bottom', () => {
    const measurer = new FakeMeasurer();

    // 800px / 20px-per-line = 40 lines available. Fill 39 so Character
    // (1 line = 20px) ITSELF just fits in the 20px remaining — but the
    // keep-with rule demands Character + one more line, which can't,
    // so we should flush.
    const padding: ScreenplayElement = { type: 'action', text: 'X'.repeat(60 * 39) };
    const elements: ScreenplayElement[] = [
      padding, // 39 lines → uses 780px, leaves 20px remaining
      { type: 'character', text: 'ALICE' },
      { type: 'dialogue', text: 'Hi.' },
    ];
    const pages = paginate(elements, measurer);
    // Character moves to page 2 so it doesn't sit alone above the break.
    expect(pages).toHaveLength(2);
    expect(pages[0].elements).toHaveLength(1);
    expect(pages[0].elements[0].element.type).toBe('action');
    expect(pages[1].elements.map((p) => p.element.type)).toEqual([
      'character',
      'dialogue',
    ]);
  });

  it('keeps Character on the current page when room for one line of dialogue remains', () => {
    const measurer = new FakeMeasurer();
    // 36 lines → 720px, leaves 80px (4 lines) — plenty for Character + dialogue line.
    const padding: ScreenplayElement = { type: 'action', text: 'X'.repeat(60 * 36) };
    const elements: ScreenplayElement[] = [
      padding,
      { type: 'character', text: 'ALICE' },
      { type: 'dialogue', text: 'Hi there.' },
    ];
    const pages = paginate(elements, measurer);
    expect(pages).toHaveLength(1);
    expect(pages[0].elements.map((p) => p.element.type)).toEqual([
      'action',
      'character',
      'dialogue',
    ]);
  });

  it('applies Rule 1 when Parenthetical follows Character (not just Dialogue)', () => {
    const measurer = new FakeMeasurer();
    const padding: ScreenplayElement = { type: 'action', text: 'X'.repeat(60 * 39) };
    const elements: ScreenplayElement[] = [
      padding,
      { type: 'character', text: 'ALICE' },
      { type: 'parenthetical', text: 'softly' },
      { type: 'dialogue', text: 'Hi.' },
    ];
    const pages = paginate(elements, measurer);
    expect(pages).toHaveLength(2);
    expect(pages[1].elements[0].element.type).toBe('character');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Rule 2 — Scene Heading keeps with content
// ──────────────────────────────────────────────────────────────────────────

describe('paginate — Rule 2: Scene Heading + content keep together', () => {
  it('pushes a Scene Heading to the next page when content would be stranded', () => {
    const measurer = new FakeMeasurer();
    const padding: ScreenplayElement = { type: 'action', text: 'X'.repeat(60 * 39) };
    const elements: ScreenplayElement[] = [
      padding, // 39 lines → 780px used, 20px remaining (1 line)
      { type: 'scene', text: 'INT. ROOM - DAY' },
      { type: 'action', text: 'Action begins.' },
    ];
    const pages = paginate(elements, measurer);
    expect(pages).toHaveLength(2);
    expect(pages[1].elements.map((p) => p.element.type)).toEqual([
      'scene',
      'action',
    ]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Rule 3 — Dialogue splits with (MORE) / (CONT'D)
// ──────────────────────────────────────────────────────────────────────────

describe('paginate — Rule 3: Dialogue splits with (MORE)/(CONT\u2019D)', () => {
  it('splits a long Dialogue across a page boundary and preserves text', () => {
    const measurer = new FakeMeasurer();
    // 30 lines padding → 600px used → 200px remaining. Character eats
    // another 20px → 180px for dialogue. Our dialogue is built to be
    // ~35 lines (~700px), well past the 180px remaining.
    const padding: ScreenplayElement = { type: 'action', text: 'X'.repeat(60 * 30) };
    const sentence = 'This is a moderately long sentence of dialogue to fill space.'; // 61 chars
    const longText = Array.from({ length: 35 }, () => sentence).join(' ');
    const elements: ScreenplayElement[] = [
      padding,
      { type: 'character', text: 'ALICE' },
      { type: 'dialogue', text: longText },
    ];
    const pages = paginate(elements, measurer);

    expect(pages.length).toBeGreaterThanOrEqual(2);

    // Find the head + tail page-slots.
    const allSlots = pages.flatMap((p) => p.elements);
    const splitHeads = allSlots.filter((s) => s.split?.portion === 'head');
    const splitTails = allSlots.filter(
      (s) => s.split?.portion === 'tail' && s.element.type === 'dialogue',
    );
    const contdCues = allSlots.filter(
      (s) => s.split?.portion === 'tail' && s.element.type === 'character',
    );

    expect(splitHeads.length).toBeGreaterThanOrEqual(1);
    expect(splitTails.length).toBeGreaterThanOrEqual(1);
    // Every split head asks for (MORE).
    expect(splitHeads.every((h) => h.split?.emitMore === true)).toBe(true);
    // Every re-emitted character cue before a tail asks for (CONT'D).
    expect(contdCues.every((c) => c.split?.emitContd === true)).toBe(true);

    // Concatenated head(s) + tail(s) text equals the original (whitespace normalized).
    const headText = splitHeads.map((h) => h.split!.text).join(' ');
    const tailText = splitTails.map((t) => t.split!.text).join(' ');
    const combined = `${headText} ${tailText}`.replace(/\s+/g, ' ').trim();
    const normalized = longText.replace(/\s+/g, ' ').trim();
    expect(combined).toBe(normalized);
  });

  it("does NOT split when remaining space is below `minSplitLines`", () => {
    const measurer = new FakeMeasurer();
    // 39 lines → 780px used → 20px remaining (1 line). That's below
    // the default minSplitLines (3 * 20 = 60px), so the whole
    // dialogue must punt to the next page instead of splitting.
    const padding: ScreenplayElement = { type: 'action', text: 'X'.repeat(60 * 39) };
    // A dialogue that definitely doesn't fit in 20px but does fit on
    // a fresh page (4 lines = 80px < 800).
    const longText = 'Y'.repeat(200);
    const elements: ScreenplayElement[] = [
      padding,
      { type: 'dialogue', text: longText },
    ];
    const pages = paginate(elements, measurer);
    expect(pages).toHaveLength(2);
    const slot = pages[1].elements[0];
    expect(slot.split).toBeUndefined();
    expect((slot.element as { text: string }).text).toBe(longText);
  });

  it('re-emits the preceding Character cue on the tail page with emitContd', () => {
    const measurer = new FakeMeasurer();
    const padding: ScreenplayElement = { type: 'action', text: 'X'.repeat(60 * 30) };
    const sentence = 'This is a moderately long sentence of dialogue to fill space.'; // 61 chars
    const longText = Array.from({ length: 35 }, () => sentence).join(' ');
    const elements: ScreenplayElement[] = [
      padding,
      { type: 'character', text: 'ALICE' },
      { type: 'dialogue', text: longText },
    ];
    const pages = paginate(elements, measurer);

    // Find the first tail page.
    const firstTailPage = pages.find((p) =>
      p.elements.some((s) => s.split?.portion === 'tail'),
    );
    expect(firstTailPage).toBeDefined();
    const firstSlot = firstTailPage!.elements[0];
    expect(firstSlot.element.type).toBe('character');
    expect((firstSlot.element as { text: string }).text).toBe('ALICE');
    expect(firstSlot.split).toEqual({
      portion: 'tail',
      text: 'ALICE',
      emitContd: true,
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Overflow (single element taller than a page)
// ──────────────────────────────────────────────────────────────────────────

describe('paginate — overflow on over-tall elements', () => {
  it('isolates an over-tall Action element on its own page with overflow: true', () => {
    const measurer = new FakeMeasurer();
    const huge = 'X'.repeat(60 * 50); // 50 lines → 1000px > 800px pageHeight
    const elements: ScreenplayElement[] = [
      { type: 'action', text: 'before' },
      { type: 'action', text: huge },
      { type: 'action', text: 'after' },
    ];
    const pages = paginate(elements, measurer);
    // Three pages: before | overflowed | after.
    expect(pages).toHaveLength(3);
    const overflowSlot = pages[1].elements[0];
    expect(overflowSlot.overflow).toBe(true);
    expect(pages[1].elements).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Fountain round-trip — non-split elements preserved by reference
// ──────────────────────────────────────────────────────────────────────────

describe('paginate — Fountain round-trip', () => {
  it('returns the SAME element references for non-split entries (no mutation, no cloning)', () => {
    const measurer = new FakeMeasurer();
    const el1: ScreenplayElement = { type: 'scene', text: 'INT. ROOM - DAY' };
    const el2: ScreenplayElement = { type: 'action', text: 'short' };
    const el3: ScreenplayElement = { type: 'character', text: 'ALICE' };
    const el4: ScreenplayElement = { type: 'dialogue', text: 'Hi.' };
    const elements = [el1, el2, el3, el4];
    const pages = paginate(elements, measurer);
    const slots = pages.flatMap((p) => p.elements);
    expect(slots.find((s) => s.originalIndex === 0)!.element).toBe(el1);
    expect(slots.find((s) => s.originalIndex === 1)!.element).toBe(el2);
    expect(slots.find((s) => s.originalIndex === 2)!.element).toBe(el3);
    expect(slots.find((s) => s.originalIndex === 3)!.element).toBe(el4);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Performance smoke
// ──────────────────────────────────────────────────────────────────────────

// Skipped in CI to avoid timing flakes; run locally with
// `CI= npx vitest run src/pagination/paginate.test.ts` to exercise it.
// The real-world bar is <100ms with a warm cache; we budget 200ms here
// for local headroom.
describe.skipIf(!!process.env.CI)('paginate — performance smoke (local only)', () => {
  it('paginates a ~30K-word fixture in under 200ms (warm-cache proxy)', () => {
    const measurer = new FakeMeasurer();
    // Build ~30K words: 100 scenes, each with 6 action + 4 character/dialogue
    // pairs. Average word-per-element ≈ 10 → 100 * 14 * ~10 ≈ 14K words;
    // double it to get comfortably past 30K.
    const elements: ScreenplayElement[] = [];
    for (let i = 0; i < 200; i++) {
      elements.push({ type: 'scene', text: `INT. LOCATION ${i} - DAY` });
      for (let j = 0; j < 6; j++) {
        elements.push({
          type: 'action',
          text: 'Action line '.repeat(10).trim(),
        });
      }
      for (let k = 0; k < 4; k++) {
        elements.push({ type: 'character', text: `SPEAKER ${k}` });
        elements.push({
          type: 'dialogue',
          text: 'Dialogue words here '.repeat(10).trim(),
        });
      }
    }

    const start = performance.now();
    const pages = paginate(elements, measurer);
    const elapsedMs = performance.now() - start;

    expect(pages.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(200);
  });
});
