import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseFDX } from '@/export/fdx/parseFDX';
import { BrowserMeasurer } from '@/pagination/browserMeasurer';
import { paginate } from '@/pagination/paginate';
import type { Page } from '@/pagination/types';

/**
 * Calibration harness — iterates every FDX fixture in
 * src/pagination/__fixtures__/fdx/ and reports the diff between:
 *
 *   - `recordedPageBreaks`: the page breaks the source FDX asserted
 *     (ground truth from Final Draft's own paginator)
 *   - breaks implied by `paginate()`'s Page[] output on the same
 *     elements
 *
 * This commit REPORTS only — no tolerance assertions yet. The next
 * commit uses these reports to calibrate line heights, margins,
 * keep-with rules, etc., then adds assertions with real tolerances.
 *
 * Drop any real .fdx file into the fixture directory and this loop
 * picks it up automatically. The placeholder fixture is a small
 * hand-crafted 3-scene, 3-page file so the pipeline has something
 * to exercise until real fixtures arrive.
 *
 * Measurement runs via BrowserMeasurer under jsdom. jsdom returns 0
 * height for every layout query, so `paginate()` will report a
 * single page regardless of the source's actual page count. That's
 * expected for v1 of this harness — the REPORT still exercises the
 * parseFDX → paginate pipeline end-to-end, and the measurement
 * gap gets addressed in the calibration commit (likely via a real
 * browser test runner or a jsdom-enriched height shim).
 */

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, '__fixtures__/fdx');

function listFixtures(): string[] {
  try {
    return readdirSync(fixturesDir).filter((f) => f.endsWith('.fdx'));
  } catch {
    return [];
  }
}

interface CalibrationReport {
  file: string;
  recordedPageCount: number;
  paginatePageCount: number;
  recordedBreakIndices: number[];
  paginateBreakIndices: number[];
  matchingBreakIndices: number;
  parseWarnings: string[];
}

function paginateBreakIndices(pages: Page[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < pages.length; i++) {
    const slot = pages[i].elements[0];
    if (!slot) continue;
    out.push(slot.originalIndex);
  }
  return out;
}

describe('pagination calibration — FDX fixture diff report', () => {
  const fixtures = listFixtures();

  if (fixtures.length === 0) {
    it('has at least one fixture (placeholder or real)', () => {
      expect(fixtures.length).toBeGreaterThan(0);
    });
    return;
  }

  for (const file of fixtures) {
    it(`${file}: reports diff between recorded and paginate() breaks`, () => {
      const xml = readFileSync(join(fixturesDir, file), 'utf8');
      const parsed = parseFDX(xml);

      const measurer = new BrowserMeasurer();
      let pages: Page[] = [];
      try {
        pages = paginate(parsed.elements, measurer);
      } finally {
        measurer.dispose();
      }

      const recordedIndices = parsed.recordedPageBreaks.map((b) => b.elementIndex);
      const paginateIndices = paginateBreakIndices(pages);
      const matchingCount = recordedIndices.filter((i) =>
        paginateIndices.includes(i),
      ).length;

      const recordedPageCount =
        parsed.recordedPageBreaks.length > 0
          ? parsed.recordedPageBreaks[parsed.recordedPageBreaks.length - 1].pageNumber
          : 1;

      const report: CalibrationReport = {
        file,
        recordedPageCount,
        paginatePageCount: pages.length,
        recordedBreakIndices: recordedIndices,
        paginateBreakIndices: paginateIndices,
        matchingBreakIndices: matchingCount,
        parseWarnings: parsed.warnings,
      };

      // eslint-disable-next-line no-console
      console.log(`\n[calibration] ${file}:\n${JSON.stringify(report, null, 2)}`);

      // The only hard assertions right now: the pipeline ran, the
      // parser didn't throw, and the fixture contains SOMETHING. The
      // actual numeric calibration lands in the follow-up commit.
      expect(parsed.elements.length).toBeGreaterThan(0);
      expect(pages.length).toBeGreaterThanOrEqual(1);
    });
  }
});
