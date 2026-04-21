import type { ScriptRepository } from '@/storage/repository';

/**
 * Pure autosave primitives used by src/hooks/useAutosave.ts.
 *
 * Kept pure on purpose so the snapshot-dedup rule and the beforeunload
 * wiring are testable without mounting the editor or a React tree.
 */

export interface CommitMainSaveArgs {
  id: string;
  fountain: string;
  repo: ScriptRepository;
  /** Fountain of the most recent snapshot, or null if none yet. */
  lastSnapshotFountain: string | null;
}

export interface CommitMainSaveResult {
  /** Carry forward so the next commit sees the up-to-date dedup baseline. */
  lastSnapshotFountain: string | null;
  /** True iff we actually pushed a new snapshot row. */
  snapshotPushed: boolean;
}

/**
 * Persist a fountain string as the script's canonical save. Runs the three
 * things that should happen together on every successful main save:
 *
 *   1. `repo.update(id, { fountain })` — the main write.
 *   2. `repo.pushSnapshot(id, fountain)` — ONLY if the fountain differs
 *      byte-for-byte from the most recent snapshot. This is the dedup rule:
 *      a user pressing save repeatedly without changes shouldn't fill the
 *      ring buffer with duplicates.
 *   3. `repo.clearDraft(id)` — drafts exist to cover mid-debounce crashes.
 *      Once the main save lands, the draft row is stale and should go.
 *
 * Returns the dedup baseline for the next call.
 */
export async function commitMainSave(
  args: CommitMainSaveArgs,
): Promise<CommitMainSaveResult> {
  const { id, fountain, repo, lastSnapshotFountain } = args;

  await repo.update(id, { fountain });

  let nextLastSnapshot = lastSnapshotFountain;
  let snapshotPushed = false;
  if (fountain !== lastSnapshotFountain) {
    await repo.pushSnapshot(id, fountain);
    nextLastSnapshot = fountain;
    snapshotPushed = true;
  }

  await repo.clearDraft(id);

  return { lastSnapshotFountain: nextLastSnapshot, snapshotPushed };
}

/**
 * Minimal shape we need from a debounced function. Avoids coupling this
 * helper to our specific debounce implementation (or to TipTap).
 */
export interface Flushable {
  flush: () => void;
}

/**
 * Install a best-effort flush on both `beforeunload` (desktop) and
 * `pagehide` (mobile Safari, bfcache). IndexedDB writes can't be
 * guaranteed to complete in these handlers, but calling flush() at least
 * makes the debounced save fire synchronously so the write is in-flight
 * before the page is torn down. The real safety net is the 1s draft tick.
 *
 * Returns a cleanup function that removes both listeners.
 */
export function installBeforeUnloadFlush(debounced: Flushable): () => void {
  const handler = () => {
    debounced.flush();
  };
  window.addEventListener('beforeunload', handler);
  window.addEventListener('pagehide', handler);
  return () => {
    window.removeEventListener('beforeunload', handler);
    window.removeEventListener('pagehide', handler);
  };
}
