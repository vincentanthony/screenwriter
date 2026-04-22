import type { ScreenplayElement } from '@/fountain/types';
import type { Measurer } from './measurer';
import type { Page, PageElement, PageElementSplit, PaginationOptions } from './types';

/**
 * The pagination engine. Pure, given a stable Measurer: same input →
 * same Page[] output, every time. Consumers (live editor decorations,
 * FDX export, PDF export) all start from this output so the drafting
 * page count and the export page count can't disagree.
 *
 * Input: a ScreenplayElement[] (typically from Fountain parse).
 * Output: Page[] where each page holds PageElements. An element may
 * appear as:
 *   - a whole page-slot (no `split` / `overflow`)
 *   - a split head + tail (dialogue split across a page break — with
 *     `(MORE)` on the head and a re-emitted Character cue bearing
 *     `(CONT'D)` on the tail)
 *   - a single over-tall page-slot (`overflow: true`, kept on its own page)
 *
 * Title-page elements are filtered out — they render separately and
 * never contribute to body page counts.
 *
 * Three flow rules (Final Draft parity) land in this commit:
 *   1. Character cue keeps with at least one line of following
 *      Dialogue/Parenthetical. If it can't, push Character to the
 *      next page.
 *   2. Scene Heading keeps with at least one line of whatever follows.
 *   3. Dialogue splits use (MORE) + (CONT'D). Prefer a sentence
 *      boundary for the split; fall back to word boundary. If
 *      remaining space is less than `minSplitLines` (default 3) of
 *      line-height, don't split — push the whole dialogue.
 *
 * Explicitly not in scope for this commit: widow/orphan control on
 * action, parenthetical splits, scene + 2-line-minimum rules.
 */

const DEFAULT_MIN_SPLIT_LINES = 3;

/**
 * A WorkItem is either a real element being placed for the first time
 * (`virtualText` and `emitContd` both undefined), or a virtual slot
 * emitted during a dialogue split:
 *
 *   - A split-tail Dialogue is queued as `{ element: <same dialogue>,
 *     virtualText: <tail portion> }` so subsequent fit-checks measure
 *     the tail, not the full original.
 *   - A re-emitted Character cue carrying `(CONT'D)` is queued as
 *     `{ element: <character>, emitContd: true }` so the next page
 *     opens with the speaker re-identified.
 *
 * Virtual items ride the same queue as real ones, so recursive splits
 * (a dialogue whose tail STILL doesn't fit) work naturally without
 * special-case recursion code.
 */
interface WorkItem {
  element: ScreenplayElement;
  originalIndex: number;
  virtualText?: string;
  emitContd?: boolean;
}

export function paginate(
  elements: ScreenplayElement[],
  measurer: Measurer,
  options: PaginationOptions = {},
): Page[] {
  const pageHeight = options.pageHeightPx ?? measurer.pageHeightPx;
  const minSplitLines = options.minSplitLines ?? DEFAULT_MIN_SPLIT_LINES;
  const lineHeight = measurer.lineHeightPx;

  // Title-page elements render separately; they don't contribute to
  // body pages. Preserve originalIndex into the CALLER'S array so
  // consumers can map back to e.g. ProseMirror positions even though
  // the title page is dropped.
  const queue: WorkItem[] = [];
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type === 'title-page') continue;
    queue.push({ element: el, originalIndex: i });
  }

  const pages: Page[] = [];
  let currentPage: PageElement[] = [];
  let usedHeight = 0;
  let pageNumber = 1;

  const flushPage = (): void => {
    if (currentPage.length === 0) return;
    pages.push({ pageNumber, elements: currentPage });
    pageNumber++;
    currentPage = [];
    usedHeight = 0;
  };

  while (queue.length > 0) {
    const item = queue.shift()!;
    const { element, originalIndex, virtualText, emitContd } = item;

    // ── Forced page break — structural signal, not something we measure.
    if (element.type === 'page-break') {
      flushPage();
      continue;
    }

    // For virtual dialogue tails, the thing we measure is the tail
    // text, not the element's original full text.
    const measurand: ScreenplayElement =
      virtualText !== undefined && element.type === 'dialogue'
        ? { ...element, text: virtualText }
        : element;

    const height = measurer.measure(measurand);
    const remaining = pageHeight - usedHeight;

    // ── Single element taller than a whole page — isolate it on its
    // own page with an overflow flag. Consumers decide what to do
    // (scroll, warn, shrink).
    if (height > pageHeight) {
      flushPage();
      currentPage.push(buildPageElement(element, originalIndex, virtualText, emitContd, true));
      flushPage();
      continue;
    }

    if (height <= remaining) {
      // Fits — but check the keep-with rules FIRST. Both rules
      // demand "at least one line of the following element" must
      // also fit, or we flush and retry on a fresh page.
      const needsFlush = shouldFlushForKeepWith(element, queue, height, remaining, lineHeight);
      if (needsFlush) {
        flushPage();
      }

      currentPage.push(buildPageElement(element, originalIndex, virtualText, emitContd, false));
      usedHeight += height;
      continue;
    }

    // ── Doesn't fit as-is on the current page. Try to split a dialogue.
    if (element.type === 'dialogue' && remaining >= minSplitLines * lineHeight) {
      const dialogueText = virtualText ?? element.text;
      const availableForDialogueHead = remaining - lineHeight; // reserve room for `(MORE)`
      const split = measurer.findDialogueSplitPoint(
        { ...element, text: dialogueText },
        availableForDialogueHead,
      );
      if (split && split.headText.length > 0 && split.tailText.length > 0) {
        currentPage.push({
          element,
          originalIndex,
          split: { portion: 'head', text: split.headText, emitMore: true },
        });
        flushPage();

        // Queue the tail first, then the CONT'D cue IN FRONT of it so
        // the cue pops off the queue first on the fresh page.
        queue.unshift({
          element,
          originalIndex,
          virtualText: split.tailText,
        });

        const precedingChar = findPrecedingCharacter(elements, originalIndex);
        if (precedingChar) {
          queue.unshift({
            element: precedingChar.element,
            originalIndex: precedingChar.index,
            emitContd: true,
          });
        }
        continue;
      }
    }

    // ── Whole element punts to the next page.
    flushPage();
    currentPage.push(buildPageElement(element, originalIndex, virtualText, emitContd, false));
    usedHeight = height;
  }

  flushPage();
  return pages;
}

function shouldFlushForKeepWith(
  element: ScreenplayElement,
  queue: readonly WorkItem[],
  elementHeight: number,
  remaining: number,
  lineHeightPx: number,
): boolean {
  if (queue.length === 0) return false;

  // Rule 1: Character must keep with at least one line of the next
  // dialogue-group element. Parenthetical counts too — it sits
  // BETWEEN Character and the actual dialogue and is also a widow
  // we don't want stranded.
  if (element.type === 'character') {
    const next = queue[0].element;
    if (next.type === 'dialogue' || next.type === 'parenthetical') {
      return elementHeight + lineHeightPx > remaining;
    }
    return false;
  }

  // Rule 2: Scene Heading must keep with at least one line of whatever
  // the first scene-body element is.
  if (element.type === 'scene') {
    return elementHeight + lineHeightPx > remaining;
  }

  return false;
}

function buildPageElement(
  element: ScreenplayElement,
  originalIndex: number,
  virtualText: string | undefined,
  emitContd: boolean | undefined,
  overflow: boolean,
): PageElement {
  const pageEl: PageElement = { element, originalIndex };
  if (overflow) pageEl.overflow = true;

  let split: PageElementSplit | undefined;
  if (virtualText !== undefined) {
    // Dialogue tail — possibly after N splits.
    split = { portion: 'tail', text: virtualText };
  } else if (emitContd && 'text' in element) {
    // Character cue re-emitted on the tail page.
    split = { portion: 'tail', text: element.text, emitContd: true };
  }
  if (split) pageEl.split = split;

  return pageEl;
}

function findPrecedingCharacter(
  elements: ScreenplayElement[],
  fromIndex: number,
): { element: ScreenplayElement; index: number } | null {
  for (let i = fromIndex - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.type === 'character') return { element: el, index: i };
    // Stop at scene/transition — different scope, different speaker context.
    if (el.type === 'scene' || el.type === 'transition') return null;
  }
  return null;
}
