import type { ScreenplayElement } from '@/fountain/types';

/**
 * BUMP THIS integer whenever screenplay CSS that affects block height
 * changes — page dimensions, margins, font, line-height, or any `.sw-*`
 * rule whose delta would shift rendered heights. Stale entries from a
 * previous version are ignored silently and rewritten on next call.
 *
 * A longer-term safety net: BrowserMeasurer also calls cache.clear()
 * when `document.fonts` finishes loading mid-session, catching the case
 * where initial measurements ran against a fallback font face.
 */
export const MEASUREMENT_CACHE_VERSION = 1;

interface CacheEntry {
  version: number;
  height: number;
}

/**
 * Height cache keyed by (element.type, relevant attrs, text). Pure
 * by construction: two elements that render the same way share a key
 * and therefore share a cached height.
 *
 * The "relevant attrs" subset is hand-picked per element type because
 * not every attr changes rendered height (e.g. Character's `dual`
 * attr can affect width via a side-by-side layout rule; `forced`
 * doesn't affect body-page height for any current element). Err on
 * the side of including attrs we're unsure about — a cache miss
 * costs one measurement; a false hit is a silent correctness bug.
 */
export class MeasurementCache {
  private store = new Map<string, CacheEntry>();

  keyFor(element: ScreenplayElement): string {
    return `${element.type}|${this.relevantAttrs(element)}|${this.elementText(element)}`;
  }

  get(element: ScreenplayElement): number | null {
    const entry = this.store.get(this.keyFor(element));
    if (!entry) return null;
    if (entry.version !== MEASUREMENT_CACHE_VERSION) return null;
    return entry.height;
  }

  set(element: ScreenplayElement, height: number): void {
    this.store.set(this.keyFor(element), {
      version: MEASUREMENT_CACHE_VERSION,
      height,
    });
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  private elementText(element: ScreenplayElement): string {
    // page-break, title-page: no body text contributes to height.
    // title-page shouldn't even be measured (engine filters it out),
    // but a safe default prevents accidental NaN-like collisions.
    if ('text' in element) return element.text;
    return '';
  }

  private relevantAttrs(element: ScreenplayElement): string {
    switch (element.type) {
      case 'scene':
      case 'action':
      case 'transition':
        return `forced=${Boolean(element.forced)}`;
      case 'character':
        return `forced=${Boolean(element.forced)};dual=${Boolean(element.dual)}`;
      case 'section':
        return `depth=${element.depth}`;
      default:
        return '';
    }
  }
}
