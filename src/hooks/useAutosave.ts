import { useCallback, useEffect, useRef, useState } from 'react';
import { commitMainSave, installBeforeUnloadFlush } from '@/editor/autosave';
import { getRepository } from '@/storage/repository';
import { useDebouncedCallback } from './useDebouncedCallback';

/**
 * Autosave orchestrator for the screenplay editor.
 *
 * Wires together the four durability layers from the plan:
 *
 *   1. Main autosave (300 ms debounce) → repo.update() — the canonical
 *      write. On success: push a snapshot (dedup: skip if byte-identical
 *      to the most recent) and clear the draft row.
 *   2. Draft fast-tick (1 s interval while dirty) → repo.saveDraft().
 *      Bounds data loss to <1 s in the common case of a tab closed
 *      mid-debounce.
 *   3. beforeunload / pagehide flush → force the debounced main save to
 *      fire synchronously before tear-down.
 *   4. Last-snapshot baseline loaded once on mount so the dedup rule
 *      doesn't push a duplicate of whatever the previous session left
 *      in the ring buffer.
 *
 * State returned as `AutosaveStatus` drives the visible Save Indicator.
 */

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AutosaveState {
  status: AutosaveStatus;
  lastSavedAt: number | null;
  error: Error | null;
}

export interface UseAutosaveOptions {
  scriptId: string | undefined;
  /** Fountain of the script as loaded from storage, or null while loading. */
  initialFountain: string | null;
}

export interface UseAutosaveResult {
  state: AutosaveState;
  /** Call on every Fountain change coming out of the editor. */
  onFountainChange: (fountain: string) => void;
}

const INITIAL_STATE: AutosaveState = {
  status: 'idle',
  lastSavedAt: null,
  error: null,
};

export function useAutosave({
  scriptId,
  initialFountain,
}: UseAutosaveOptions): UseAutosaveResult {
  const [state, setState] = useState<AutosaveState>(INITIAL_STATE);

  // Refs: things the save loop needs without re-triggering effects.
  const latestFountainRef = useRef<string>(initialFountain ?? '');
  const lastSavedFountainRef = useRef<string>(initialFountain ?? '');
  const lastSnapshotFountainRef = useRef<string | null>(null);
  const snapshotBaselineLoadedRef = useRef(false);

  // Reset the baseline whenever the caller hands us a fresh script.
  useEffect(() => {
    latestFountainRef.current = initialFountain ?? '';
    lastSavedFountainRef.current = initialFountain ?? '';
    lastSnapshotFountainRef.current = null;
    snapshotBaselineLoadedRef.current = false;
    setState(INITIAL_STATE);
  }, [scriptId, initialFountain]);

  // Load the most recent snapshot once so dedup knows the baseline.
  useEffect(() => {
    if (!scriptId) return;
    if (snapshotBaselineLoadedRef.current) return;
    let cancelled = false;
    (async () => {
      const snaps = await getRepository().listSnapshots(scriptId);
      if (cancelled) return;
      lastSnapshotFountainRef.current = snaps[0]?.fountain ?? null;
      snapshotBaselineLoadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [scriptId]);

  // The actual save work. Reads latest fountain from the ref so the
  // debounced invocation always sees the newest content.
  const performSave = useCallback(async () => {
    if (!scriptId) return;
    const fountain = latestFountainRef.current;
    if (fountain === lastSavedFountainRef.current) {
      // Nothing to save — another trigger raced us or the user undid back
      // to baseline. Flip to "saved" so the indicator settles.
      setState((s) => ({ ...s, status: 'saved' }));
      return;
    }
    setState((s) => ({ ...s, status: 'saving' }));
    try {
      const result = await commitMainSave({
        id: scriptId,
        fountain,
        repo: getRepository(),
        lastSnapshotFountain: lastSnapshotFountainRef.current,
      });
      lastSavedFountainRef.current = fountain;
      lastSnapshotFountainRef.current = result.lastSnapshotFountain;
      setState({ status: 'saved', lastSavedAt: Date.now(), error: null });
    } catch (e) {
      setState((s) => ({ ...s, status: 'error', error: e as Error }));
    }
  }, [scriptId]);

  const mainSaveDebounced = useDebouncedCallback(performSave, 300);

  const onFountainChange = useCallback(
    (fountain: string) => {
      latestFountainRef.current = fountain;
      if (fountain === lastSavedFountainRef.current) {
        setState((s) => (s.status === 'saving' ? s : { ...s, status: 'saved' }));
        return;
      }
      setState((s) => (s.status === 'saving' ? s : { ...s, status: 'saving' }));
      mainSaveDebounced();
    },
    [mainSaveDebounced],
  );

  // 1-second fast-tick draft save. Independent of the debounced main save
  // so continuous typing still triggers at least one draft write per second.
  useEffect(() => {
    if (!scriptId) return;
    const tick = window.setInterval(() => {
      const fountain = latestFountainRef.current;
      if (fountain === lastSavedFountainRef.current) return;
      // Best-effort: errors here don't interrupt the main save path.
      getRepository()
        .saveDraft(scriptId, fountain)
        .catch(() => {
          // Intentionally swallow — the main save is the authoritative write.
        });
    }, 1000);
    return () => window.clearInterval(tick);
  }, [scriptId]);

  // Flush on beforeunload / pagehide so we at least attempt a synchronous
  // save when the tab closes. IndexedDB can't be guaranteed to finish in
  // these handlers, but firing the debounced save gets the write enqueued.
  useEffect(() => {
    return installBeforeUnloadFlush(mainSaveDebounced);
  }, [mainSaveDebounced]);

  return { state, onFountainChange };
}
