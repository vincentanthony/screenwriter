import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Drawer state machine — expressed as a discriminated union so every
 * call site has to consciously handle each variant:
 *
 *   - `{ kind: 'closed' }`         no drawer visible beyond the strip
 *   - `{ kind: 'list' }`           drawer shows the panel list (Layer 1)
 *   - `{ kind: 'panel', panelId }` drawer shows a specific panel (Layer 2)
 *
 * State is stored in the URL's `panel` search param so a reload
 * restores whatever the user had open. The URL is updated with
 * `replace: true` so drawer transitions don't clog the browser's
 * back-history.
 */

export type DrawerState =
  | { kind: 'closed' }
  | { kind: 'list' }
  | { kind: 'panel'; panelId: string };

const LIST_SENTINEL = 'list';

export interface DrawerController {
  state: DrawerState;
  openList(): void;
  openPanel(panelId: string): void;
  close(): void;
}

export function useDrawerState(): DrawerController {
  const [searchParams, setSearchParams] = useSearchParams();
  const panelParam = searchParams.get('panel');

  const state: DrawerState = !panelParam
    ? { kind: 'closed' }
    : panelParam === LIST_SENTINEL
      ? { kind: 'list' }
      : { kind: 'panel', panelId: panelParam };

  const update = useCallback(
    (next: DrawerState) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next.kind === 'closed') {
            params.delete('panel');
          } else if (next.kind === 'list') {
            params.set('panel', LIST_SENTINEL);
          } else {
            params.set('panel', next.panelId);
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const openList = useCallback(() => update({ kind: 'list' }), [update]);
  const openPanel = useCallback(
    (panelId: string) => update({ kind: 'panel', panelId }),
    [update],
  );
  const close = useCallback(() => update({ kind: 'closed' }), [update]);

  return { state, openList, openPanel, close };
}
