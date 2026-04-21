import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  draftUpdatedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
}

/**
 * Shown at the top of the editor when a draft row exists whose
 * draftUpdatedAt is newer than the script's updatedAt — i.e. the last
 * session ended mid-debounce and the fast-tick draft has content the
 * main save never got. User picks which copy wins.
 */
export function DraftRestoreBanner({ draftUpdatedAt, onRestore, onDiscard }: Props) {
  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <span>
          Unsaved changes from your last session ({new Date(draftUpdatedAt).toLocaleString()})
          — restore or discard?
        </span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onDiscard}>
          Discard
        </Button>
        <Button size="sm" onClick={onRestore}>
          Restore
        </Button>
      </div>
    </div>
  );
}
