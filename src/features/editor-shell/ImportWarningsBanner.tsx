import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  warnings: string[];
  onDismiss: () => void;
}

/**
 * Non-blocking banner shown above the editor when parseFDX returned
 * warnings during import. Displayed once per import, dismissible.
 * Capped at 5 warnings with a "+N more" tail so a file with dozens
 * of warnings doesn't blow up the editor chrome.
 *
 * The dismiss path clears the router location.state so the banner
 * doesn't re-appear on back/forward navigation after a refresh.
 */

const MAX_VISIBLE = 5;

export function ImportWarningsBanner({ warnings, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (warnings.length === 0) return null;

  const visible = expanded ? warnings : warnings.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, warnings.length - MAX_VISIBLE);

  return (
    <div
      role="alert"
      className="mb-4 flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="font-medium">
          Imported with {warnings.length} warning{warnings.length === 1 ? '' : 's'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Dismiss import warnings"
          className="ml-auto h-6 w-6 text-amber-900 hover:bg-amber-100 hover:text-amber-900"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ul className="list-disc space-y-1 pl-6 text-xs">
        {visible.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
      {!expanded && overflow > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="self-start text-xs underline hover:no-underline"
        >
          Show {overflow} more
        </button>
      )}
    </div>
  );
}
