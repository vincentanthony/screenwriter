import { Check, CircleAlert, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { AutosaveState } from '@/hooks/useAutosave';

interface Props {
  state: AutosaveState;
  className?: string;
}

/**
 * Tiny status chip that reflects the current AutosaveState. Lives in the
 * editor chrome so the filmmaker can tell at a glance that persistence is
 * keeping up.
 */
export function SaveIndicator({ state, className }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)}
    >
      {state.status === 'saving' && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          <span>Saving…</span>
        </>
      )}
      {state.status === 'saved' && (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
          <span>
            Saved
            {state.lastSavedAt && (
              <span className="ml-1 opacity-70">
                · {formatRelative(state.lastSavedAt)}
              </span>
            )}
          </span>
        </>
      )}
      {state.status === 'error' && (
        <>
          <CircleAlert className="h-3.5 w-3.5 text-destructive" aria-hidden />
          <span className="text-destructive">
            Save failed{state.error?.message ? ` — ${state.error.message}` : ''}
          </span>
        </>
      )}
      {state.status === 'idle' && <span className="opacity-0">Idle</span>}
    </div>
  );
}

function formatRelative(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 5_000) return 'just now';
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}
