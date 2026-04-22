import type { ScreenplayElement, TitlePageField } from '@/fountain/types';
import type { Page } from '@/pagination/types';
import { emitBody } from './body';
import { buildPageMap } from './pageMap';
import { emitTitlePage } from './titlePage';

/**
 * Pure: ScreenplayElement[] + TitlePageField[] + Page[] → a complete
 * .fdx file as a string.
 *
 * The Page[] argument is the SAME data the live editor draws its
 * page-break decorations from — so the page count an exported FDX
 * shows when opened in Final Draft is mathematically identical to the
 * page count the writer saw drafting in the editor.
 *
 * No DOM, no I/O, no side effects. The download plumbing (Blob +
 * <a download>) lives in src/export/download.ts.
 *
 * VERIFY against Final Draft (flagged for follow-up):
 *
 *   - DOCTYPE: modern FD exports often omit it. We follow that
 *     convention. If FD ever complains "this file is not a valid
 *     FinalDraft document", add the DOCTYPE referencing
 *     FinalDraftDocument9.dtd.
 *
 *   - <FinalDraft Version="…">: we emit "5", which is what most
 *     real-world FDX files in the wild use (FD 5+ all read it).
 *     If FD warns about version mismatch, bump to match the host.
 *
 *   - We don't emit <ElementSettings>, <HeaderAndFooter>,
 *     <PageLayout>, <SmartType>, <MoresAndContinueds>, or other
 *     "settings" blocks. FD applies sensible defaults when these are
 *     absent. If exports look mis-styled in FD, those are the next
 *     blocks to add.
 */

export interface FDXExportOptions {
  /**
   * The version string that goes in `<FinalDraft Version="…">`.
   * Default "5" matches the broadest range of FD versions in the
   * wild. Bump to e.g. "6" if writers report "this file is from a
   * newer version of Final Draft" warnings.
   */
  version?: string;
  /**
   * Whether the output is pretty-printed with newlines between
   * paragraphs. Default true. Set false for byte-tight output (still
   * well-formed; just one long line).
   */
  pretty?: boolean;
}

const DEFAULT_VERSION = '5';

export function exportToFDX(
  elements: ScreenplayElement[],
  titlePage: TitlePageField[] | null,
  pages: Page[],
  options: FDXExportOptions = {},
): string {
  const version = options.version ?? DEFAULT_VERSION;
  const pageMap = buildPageMap(pages);

  const body = emitBody(elements, {
    pageOf: (originalIndex: number) => pageMap.get(originalIndex) ?? 1,
  });
  const titlePageBlock = emitTitlePage(titlePage);

  const xmlProlog = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>';
  const openTag = `<FinalDraft DocumentType="Script" Template="No" Version="${version}">`;

  const inner = titlePageBlock ? `${body}\n${titlePageBlock}` : body;

  const document = `${xmlProlog}
${openTag}
${inner}
</FinalDraft>
`;

  return options.pretty === false ? document.replace(/\n+/g, '') : document;
}
