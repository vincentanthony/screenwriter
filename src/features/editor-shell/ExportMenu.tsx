import { useState } from 'react';
import { ChevronDown, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadStringAsFile, slugifyFilename } from '@/export/download';
import { exportToFDX } from '@/export/fdx/exportToFDX';
import type { ScreenplayElement, TitlePageField } from '@/fountain/types';
import type { Page } from '@/pagination/types';

/**
 * Top-bar Export dropdown.
 *
 * One option today (Final Draft .fdx). Designed so PDF and Fountain
 * exports slot into the same dropdown later — they each become a
 * second/third <DropdownMenuItem> with their own onClick handler;
 * no UI restructuring needed.
 *
 * Build flow:
 *   1. Snapshot inputs by calling the `getExportPayload` callback
 *      provided by the parent (ScriptEditor). This isolates the
 *      "what's in the editor right now?" concern from this UI: the
 *      menu doesn't know about useScreenplayEditor or paginate().
 *   2. Run the pure exportToFDX().
 *   3. Hand the resulting string to the browser via the download
 *      helper, with a slugified filename derived from the script
 *      title (fallback "screenplay").
 *
 * The "Exporting…" spinner is briefly shown around the click so a
 * long-running export wouldn't appear silent. Today's exports are
 * synchronous and complete in microseconds, but the visual ack is
 * cheap insurance against the day exports start touching the
 * network or running heavy formatting.
 */

export interface ExportPayload {
  scriptTitle: string;
  elements: ScreenplayElement[];
  titlePage: TitlePageField[] | null;
  pages: Page[];
}

interface Props {
  /** Called at click time to capture the latest editor state. */
  getExportPayload: () => ExportPayload;
}

export function ExportMenu({ getExportPayload }: Props) {
  const [busy, setBusy] = useState(false);

  const handleFDX = async () => {
    setBusy(true);
    try {
      const payload = getExportPayload();
      const fdx = exportToFDX(payload.elements, payload.titlePage, payload.pages);
      const filename = `${slugifyFilename(payload.scriptTitle) ?? 'screenplay'}.fdx`;
      downloadStringAsFile(filename, fdx, 'application/xml');
    } finally {
      // Reset on the next paint so the brief spinner is visible even
      // for instant exports.
      requestAnimationFrame(() => setBusy(false));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy} aria-label="Export script">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Download className="h-4 w-4" aria-hidden />
          )}
          Export
          <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={handleFDX}>
          <Download className="h-4 w-4" aria-hidden />
          Final Draft (.fdx)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
