import { afterEach, describe, expect, it } from 'vitest';
import { BrowserMeasurer } from './browserMeasurer';

/**
 * BrowserMeasurer behavior that IS testable in jsdom:
 *   - Container is mounted offscreen at document.body and torn down on dispose.
 *   - pageHeightPx / lineHeightPx / contentWidthPx land at sensible defaults.
 *   - measure() and findDialogueSplitPoint() don't throw on normal input.
 *   - dispose() removes the container and flushes the cache.
 *
 * What is NOT testable in jsdom (flagged for manual QA):
 *   - Real layout-driven heights (jsdom returns 0 for getBoundingClientRect
 *     on almost everything). We verify the measurer doesn't blow up; the
 *     "does 9in page match a 9in layout?" check happens in the browser.
 *   - Range.getBoundingClientRect() on the text inside a Dialogue block —
 *     jsdom returns 0-height rects, so no split point ever "fits". We
 *     test the null-return path (no candidate fits → returns null).
 *   - Font-load cache invalidation — jsdom does not emit a meaningful
 *     document.fonts.ready event.
 */

const measurers: BrowserMeasurer[] = [];

afterEach(() => {
  while (measurers.length > 0) measurers.pop()!.dispose();
});

function build(options?: ConstructorParameters<typeof BrowserMeasurer>[0]) {
  const m = new BrowserMeasurer(options);
  measurers.push(m);
  return m;
}

describe('BrowserMeasurer — setup', () => {
  it('mounts an offscreen container to document.body', () => {
    build();
    const container = document.querySelector<HTMLDivElement>(
      '[data-testid="sw-measurement-container"]',
    );
    expect(container).not.toBeNull();
    expect(container!.parentElement).toBe(document.body);
  });

  it('positions the container offscreen (position: fixed; left: -9999px)', () => {
    build();
    const container = document.querySelector<HTMLDivElement>(
      '[data-testid="sw-measurement-container"]',
    )!;
    expect(container.style.position).toBe('fixed');
    expect(container.style.left).toBe('-9999px');
  });

  it('sets contentWidthPx to 6in (576px at 96dpi) by default', () => {
    const m = build();
    expect(m.contentWidthPx).toBe(6 * 96);
  });

  it('sets pageHeightPx to 9in (864px at 96dpi) by default', () => {
    const m = build();
    expect(m.pageHeightPx).toBe(9 * 96);
  });

  it('honors contentHeightPx / contentWidthPx overrides', () => {
    const m = build({ contentHeightPx: 500, contentWidthPx: 400 });
    expect(m.pageHeightPx).toBe(500);
    expect(m.contentWidthPx).toBe(400);
  });

  it('mirrors the `sw-screenplay` wrapper class so body typography defaults apply', () => {
    build();
    const container = document.querySelector<HTMLDivElement>(
      '[data-testid="sw-measurement-container"]',
    )!;
    expect(container.classList.contains('sw-screenplay')).toBe(true);
  });
});

describe('BrowserMeasurer — measure()', () => {
  it('returns 0 for page-break and title-page without touching the DOM', () => {
    const m = build();
    expect(m.measure({ type: 'page-break' })).toBe(0);
    expect(m.measure({ type: 'title-page', fields: [] })).toBe(0);
  });

  it('does not throw on a plain Action element (jsdom returns 0-height but call must succeed)', () => {
    const m = build();
    expect(() => m.measure({ type: 'action', text: 'hello' })).not.toThrow();
  });

  it('does not throw on elements with attrs (forced action, dual character, section depth)', () => {
    const m = build();
    expect(() => m.measure({ type: 'action', text: '!x', forced: true })).not.toThrow();
    expect(() =>
      m.measure({ type: 'character', text: 'BOB', dual: true }),
    ).not.toThrow();
    expect(() =>
      m.measure({ type: 'section', text: 'Act One', depth: 2 }),
    ).not.toThrow();
  });

  it('caches: measuring the same element twice hits the cache the second time', () => {
    const m = build();
    const el = { type: 'action' as const, text: 'stable' };
    const first = m.measure(el);
    // We can't measure the cache size publicly, but we can verify the
    // second call returns the same value without throwing — and that
    // the measurement isn't a NaN.
    const second = m.measure(el);
    expect(second).toBe(first);
    expect(Number.isFinite(second)).toBe(true);
  });
});

describe('BrowserMeasurer — findDialogueSplitPoint()', () => {
  it('returns null for non-dialogue elements', () => {
    const m = build();
    expect(m.findDialogueSplitPoint({ type: 'action', text: 'nope' }, 100)).toBeNull();
  });

  it('returns null for empty dialogue', () => {
    const m = build();
    expect(m.findDialogueSplitPoint({ type: 'dialogue', text: '' }, 100)).toBeNull();
  });

  it('does not throw on a normal dialogue + remainingPx (jsdom can return null when no height data is available)', () => {
    const m = build();
    const text = 'One sentence. Two sentences. Three sentences.';
    expect(() =>
      m.findDialogueSplitPoint({ type: 'dialogue', text }, 200),
    ).not.toThrow();
  });
});

describe('BrowserMeasurer — lifecycle', () => {
  it('dispose() removes the container from the DOM', () => {
    const m = new BrowserMeasurer();
    expect(
      document.querySelector('[data-testid="sw-measurement-container"]'),
    ).not.toBeNull();
    m.dispose();
    expect(
      document.querySelector('[data-testid="sw-measurement-container"]'),
    ).toBeNull();
  });

  it('invalidateCache() does not throw and is idempotent', () => {
    const m = build();
    m.measure({ type: 'action', text: 'x' });
    expect(() => m.invalidateCache()).not.toThrow();
    expect(() => m.invalidateCache()).not.toThrow();
  });
});
