import type { ScreenplayElement } from '@/fountain/types';

/**
 * Output of `paginate()`. A Page is a 1-indexed group of PageElements
 * that together fit within the usable content height of a US Letter
 * page (9in = 864px at 96dpi by default; overridable).
 *
 * Downstream consumers (live editor decorations, FDX export, PDF
 * export) all start from this shape — the engine's guarantee of
 * consistency between drafting page count and export page count is
 * that everyone reads the same Page[].
 */
export interface Page {
  pageNumber: number;
  elements: PageElement[];
}

export interface PageElement {
  /** The Fountain element this page-slot comes from. Preserved by reference unless the element was split. */
  element: ScreenplayElement;
  /** Index into the ORIGINAL elements array passed to paginate(). Lets consumers map back to ProseMirror positions / FDX paragraphs / etc. */
  originalIndex: number;
  /** True when this element is taller than a single page and had to render anyway. Callers decide how to handle (scroll, shrink, warn). */
  overflow?: boolean;
  /** Populated when this page-slot represents part of an element split across a page boundary. */
  split?: PageElementSplit;
}

/**
 * Describes an element that was split across a page boundary.
 *
 *   - `portion: 'head'`  → the first chunk on page N.
 *     `emitMore: true` → render `(MORE)` beneath the text.
 *   - `portion: 'tail'`  → the continuation on page N+1.
 *     `emitContd: true` → this is a re-emitted Character cue that
 *     should render with `(CONT'D)` appended so the reader knows who's
 *     still talking. Only set on Character page-slots that precede a
 *     split-tail Dialogue.
 *
 * For Dialogue splits the `text` is the PORTION of dialogue for this
 * page; head.text + tail.text === element.text (minus whitespace
 * trimmed at the split boundary).
 *
 * For Character-cue `(CONT'D)` tails, `text` is the (unchanged)
 * character name — the `(CONT'D)` suffix is a rendering concern, not
 * part of the stored text.
 */
export interface PageElementSplit {
  portion: 'head' | 'tail';
  text: string;
  emitMore?: boolean;
  emitContd?: boolean;
}

export interface PaginationOptions {
  /** Usable content height per page in CSS pixels. Default: the measurer's own pageHeightPx. */
  pageHeightPx?: number;
  /**
   * Minimum number of lines of space remaining before a Dialogue block
   * is considered worth splitting. If remaining space is below this
   * threshold, the whole Dialogue pushes to the next page instead.
   * Default: 3.
   */
  minSplitLines?: number;
}
