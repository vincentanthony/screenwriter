import type { ScreenplayElement } from '@/fountain/types';

/**
 * Measurer — the escape hatch for physical measurement.
 *
 * The pagination engine is pure (given a stable Measurer in + an
 * element array in, same Page[] out). Anything browser- or
 * renderer-specific lives behind this interface so the engine itself
 * stays testable with a FakeMeasurer, and so we can swap in a headless
 * implementation later (e.g. for server-side export) without touching
 * paginate.ts.
 *
 * Contract: all methods must be deterministic for a given (element,
 * remainingPx) given the same underlying CSS state. Implementations
 * are free to cache aggressively — MeasurementCache handles that for
 * BrowserMeasurer.
 */
export interface Measurer {
  /** Pixel height a single line of body text occupies. Used for keep-with rules and dialogue (MORE)/(CONT'D) reservations. */
  readonly lineHeightPx: number;

  /** Usable page content height in CSS px (9in = 864px at 96dpi by default). */
  readonly pageHeightPx: number;

  /**
   * Rendered pixel height this element will occupy on a page.
   * Text-carrying elements (Dialogue, Action, etc.) measure their
   * text at body width. Leaf elements (page-break) can return 0 — the
   * engine handles page-break as a structural signal before calling
   * measure().
   */
  measure(element: ScreenplayElement): number;

  /**
   * For a Dialogue element, find the best place to split so the head
   * portion fits inside `remainingPx` (AFTER reserving space for a
   * trailing `(MORE)` line — the engine passes the pre-reserved figure).
   *
   * Prefers sentence boundaries; falls back to word boundaries if no
   * sentence boundary fits. Returns null when NOTHING fits (caller
   * should push the whole element to the next page).
   */
  findDialogueSplitPoint(
    element: ScreenplayElement,
    remainingPx: number,
  ): DialogueSplitResult | null;
}

export interface DialogueSplitResult {
  headText: string;
  tailText: string;
}
