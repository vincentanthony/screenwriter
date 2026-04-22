import type { Page } from '@/pagination/types';

/**
 * Build a map from original ScreenplayElement index → 1-indexed page
 * number it lands on. Used by the body emitter to set the
 * `<SceneProperties Page="…">` attribute on Scene Heading paragraphs.
 *
 * For elements that get split across page boundaries (long dialogue
 * with a `(MORE)` head and a `(CONT'D)` tail), only the FIRST page
 * an originalIndex appears on is recorded — that's the page the
 * scene "starts on" and the value FD wants in the SceneProperties.
 */
export function buildPageMap(pages: Page[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const page of pages) {
    for (const slot of page.elements) {
      if (!map.has(slot.originalIndex)) {
        map.set(slot.originalIndex, page.pageNumber);
      }
    }
  }
  return map;
}
