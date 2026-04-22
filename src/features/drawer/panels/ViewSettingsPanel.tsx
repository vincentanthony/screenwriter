import { Label } from '@/components/ui/label';
import type { DrawerPanelProps } from '../panels';

/**
 * View Settings — per-user preferences that don't affect the Fountain
 * source (and therefore don't sync across devices unless we add that
 * explicitly; for now, localStorage per browser).
 *
 * Additions here should stay VIEW-ONLY: anything that changes the
 * persisted script belongs in a different panel. The contract is
 * enforced by the `useViewSettings` hook — this panel only ever calls
 * `onViewSettingsChange`, never touches storage directly.
 */

export function ViewSettingsPanel({
  viewSettings,
  onViewSettingsChange,
}: DrawerPanelProps) {
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <div>
        <div className="flex items-center gap-2">
          <input
            id="vs-show-page-breaks"
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={viewSettings.showPageBreaks}
            onChange={(e) =>
              onViewSettingsChange({ showPageBreaks: e.target.checked })
            }
          />
          <Label htmlFor="vs-show-page-breaks" className="cursor-pointer">
            Show page breaks
          </Label>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Dashed "PAGE N" markers appear in the editor where pages would
          break on export. Visual only — nothing is saved to the Fountain
          source.
        </p>
      </div>
    </form>
  );
}
