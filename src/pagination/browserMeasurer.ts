import type { ScreenplayElement } from '@/fountain/types';
import { NODE_HTML } from '@/editor/serialization/nodeNames';
import type { DialogueSplitResult, Measurer } from './measurer';
import { MeasurementCache } from './measurementCache';
import { findSentenceBoundaries, findWordBoundaries } from './sentenceBoundaries';

/**
 * Measures screenplay elements by actually rendering them offscreen in
 * a container whose content box matches the usable width of a US Letter
 * page — then reading getBoundingClientRect() for the truth.
 *
 * Setup:
 *   - Container is `position: fixed; left: -9999px; top: 0;`. That's
 *     the only combination that lets layout run AND keeps the content
 *     invisible to the user. `display: none` would zero out all rects.
 *   - Container width is fixed at 6in (= 8.5in page − 1.5in left − 1in
 *     right) via an inline style in CSS pixels, NOT a Tailwind class
 *     that might be overridden by theme CSS.
 *   - Container is mounted to document.body so it inherits the same
 *     `:root` CSS variables the on-page rendering uses.
 *
 * Font loading:
 *   - Courier Prime is loaded via @fontsource in main.tsx.
 *   - Until the font is resolved, getBoundingClientRect measures with
 *     fallback metrics → wrong heights. We listen for
 *     document.fonts.ready and clear the cache; the next paginate()
 *     call re-measures. BrowserMeasurer is instantiated lazily from
 *     the live editor, so in practice the font is resolved long
 *     before the first measurement.
 *
 * Cache:
 *   - Keyed by (type, relevant attrs, text). See MeasurementCache.
 *   - BUMP MEASUREMENT_CACHE_VERSION when screenplay CSS changes in a
 *     way that affects height (margins, font, line-height, block
 *     padding).
 *
 * Future: a HeadlessMeasurer (server-side, for FDX/PDF export without
 * a browser) could plug into the same Measurer interface using
 * satori/yoga or a minimal text-flow engine.
 */

const PAGE_WIDTH_IN = 8.5;
const PAGE_HEIGHT_IN = 11;
const LEFT_MARGIN_IN = 1.5;
const RIGHT_MARGIN_IN = 1.0;
const TOP_MARGIN_IN = 1.0;
const BOTTOM_MARGIN_IN = 1.0;
const PX_PER_INCH = 96;

const CONTENT_WIDTH_IN = PAGE_WIDTH_IN - LEFT_MARGIN_IN - RIGHT_MARGIN_IN;
const CONTENT_HEIGHT_IN = PAGE_HEIGHT_IN - TOP_MARGIN_IN - BOTTOM_MARGIN_IN;

export interface BrowserMeasurerOptions {
  /** Override content width in CSS pixels. Default: 6in × 96dpi = 576px. */
  contentWidthPx?: number;
  /** Override usable content height in CSS pixels. Default: 9in × 96dpi = 864px. */
  contentHeightPx?: number;
}

/** Attributes we mirror onto the measurement element so CSS that keys off them (e.g. `[data-forced="true"]`) applies correctly. */
function dataAttrsFor(element: ScreenplayElement): Record<string, string> {
  const attrs: Record<string, string> = {};
  switch (element.type) {
    case 'scene':
    case 'action':
    case 'transition':
      if (element.forced) attrs['data-forced'] = 'true';
      break;
    case 'character':
      if (element.forced) attrs['data-forced'] = 'true';
      if (element.dual) attrs['data-dual'] = 'true';
      break;
    case 'section':
      attrs['data-depth'] = String(element.depth);
      break;
  }
  return attrs;
}

/** Map ScreenplayElement → the sw-* HTML class the live editor and the measurement container both use. */
function htmlClassFor(element: ScreenplayElement): { data: string; className: string } | null {
  switch (element.type) {
    case 'scene':         return NODE_HTML.sceneHeading;
    case 'action':        return NODE_HTML.action;
    case 'character':     return NODE_HTML.character;
    case 'parenthetical': return NODE_HTML.parenthetical;
    case 'dialogue':      return NODE_HTML.dialogue;
    case 'transition':    return NODE_HTML.transition;
    case 'centered':      return NODE_HTML.centered;
    case 'note':          return NODE_HTML.note;
    case 'boneyard':      return NODE_HTML.boneyard;
    case 'section':       return NODE_HTML.section;
    case 'synopsis':      return NODE_HTML.synopsis;
    case 'lyric':         return NODE_HTML.lyric;
    case 'page-break':    return NODE_HTML.pageBreak;
    case 'title-page':    return null; // never measured
  }
}

export class BrowserMeasurer implements Measurer {
  readonly pageHeightPx: number;
  readonly lineHeightPx: number;
  readonly contentWidthPx: number;

  private container: HTMLDivElement;
  private cache = new MeasurementCache();
  private fontsReadyHooked = false;

  constructor(options: BrowserMeasurerOptions = {}) {
    this.contentWidthPx = options.contentWidthPx ?? CONTENT_WIDTH_IN * PX_PER_INCH;
    this.pageHeightPx = options.contentHeightPx ?? CONTENT_HEIGHT_IN * PX_PER_INCH;

    this.container = this.createContainer();
    document.body.appendChild(this.container);

    this.lineHeightPx = this.measureBaselineLineHeight();
    this.hookFontReady();
  }

  /** Tear down the offscreen container. Call on editor unmount. */
  dispose(): void {
    this.container.remove();
    this.cache.clear();
  }

  /** Clear the cache without tearing down the container. Useful for theme / CSS switches. */
  invalidateCache(): void {
    this.cache.clear();
  }

  measure(element: ScreenplayElement): number {
    if (element.type === 'title-page' || element.type === 'page-break') return 0;

    const cached = this.cache.get(element);
    if (cached !== null) return cached;

    const host = this.mountBlock(element);
    const height = host.getBoundingClientRect().height;
    this.container.removeChild(host);

    this.cache.set(element, height);
    return height;
  }

  findDialogueSplitPoint(
    element: ScreenplayElement,
    remainingPx: number,
  ): DialogueSplitResult | null {
    if (element.type !== 'dialogue') return null;
    const text = element.text;
    if (text.length === 0) return null;

    const host = this.mountBlock(element);
    try {
      const textNode = findFirstTextNode(host);
      if (!textNode) return null;

      // Prefer sentence boundaries, fall back to word boundaries.
      // findSentenceBoundaries/findWordBoundaries return ascending
      // indices; we walk largest-first so the first fit is the best fit.
      const candidates = [
        ...findSentenceBoundaries(text),
        ...findWordBoundaries(text),
      ].sort((a, b) => b - a);

      for (const idx of candidates) {
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, idx);
        // jsdom's Range doesn't implement getBoundingClientRect; guard
        // so the offline test environment doesn't crash. Real browsers
        // always have it.
        if (typeof range.getBoundingClientRect !== 'function') return null;
        const rect = range.getBoundingClientRect();
        if (rect.height <= remainingPx) {
          const headText = text.slice(0, idx).trim();
          const tailText = text.slice(idx).trim();
          if (headText.length === 0 || tailText.length === 0) continue;
          return { headText, tailText };
        }
      }
      return null;
    } finally {
      this.container.removeChild(host);
    }
  }

  // ── Internals ────────────────────────────────────────────────────────

  private createContainer(): HTMLDivElement {
    const div = document.createElement('div');
    div.setAttribute('data-testid', 'sw-measurement-container');
    // Positioning: offscreen but laid out. display:none does NOT let
    // us measure — layout is suppressed — so we use position:fixed far
    // off the viewport.
    Object.assign(div.style, {
      position: 'fixed',
      left: '-9999px',
      top: '0',
      width: `${this.contentWidthPx}px`,
      pointerEvents: 'none',
      visibility: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>);
    // The on-page renderer uses the `.sw-screenplay` wrapper class
    // for typography defaults; mirror it here.
    div.className = 'sw-screenplay';
    return div;
  }

  private mountBlock(element: ScreenplayElement): HTMLElement {
    const html = htmlClassFor(element);
    if (!html) throw new Error(`Cannot mount element type ${element.type}`);

    const tag = element.type === 'page-break' ? 'hr' : 'p';
    const node = document.createElement(tag);
    node.setAttribute('data-sw', html.data);
    node.className = html.className;
    for (const [k, v] of Object.entries(dataAttrsFor(element))) {
      node.setAttribute(k, v);
    }
    if ('text' in element) {
      // textContent for fidelity with the live editor (no emphasis
      // expansion in v1 — literal characters render as-is).
      node.textContent = element.text;
    }
    this.container.appendChild(node);
    return node;
  }

  private measureBaselineLineHeight(): number {
    // Measure an Action block with a single short line. Falls back to
    // ~20px (12pt Courier at 96dpi with line-height ~1.2) if the DOM
    // host can't give us a sensible number (e.g. under jsdom).
    const probe = document.createElement('p');
    probe.setAttribute('data-sw', NODE_HTML.action.data);
    probe.className = NODE_HTML.action.className;
    probe.textContent = 'x';
    this.container.appendChild(probe);
    const height = probe.getBoundingClientRect().height;
    this.container.removeChild(probe);
    return height > 0 ? height : 20;
  }

  private hookFontReady(): void {
    if (this.fontsReadyHooked) return;
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts || typeof fonts.ready !== 'object') return;
    this.fontsReadyHooked = true;
    // Initial measurements might have run against a fallback face.
    // When Courier Prime resolves, drop the cache so the next
    // paginate() call re-measures with correct metrics.
    fonts.ready.then(() => {
      this.cache.clear();
    });
  }
}

function findFirstTextNode(root: Node): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const first = walker.nextNode();
  return first as Text | null;
}
