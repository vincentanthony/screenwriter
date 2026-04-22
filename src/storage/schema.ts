import Dexie, { type EntityTable } from 'dexie';
import type { Script, Draft, Snapshot } from '@/types/script';

export const SNAPSHOT_RING_SIZE = 5;

/**
 * Dexie schema history.
 *
 *   v1 (initial): scripts (id, updatedAt), drafts (scriptId),
 *                 snapshots (++entryId, scriptId, createdAt).
 *
 *   v2 (FDX import): Script gained an optional `importedPageBreaks`
 *                    field. Dexie doesn't index that field, so no
 *                    `.stores()` entries change between v1 and v2 —
 *                    but we bump the version anyway so browsers with
 *                    existing v1 databases trigger an upgrade
 *                    transaction, and so any future field-shape
 *                    migration can hang off the same .version(2)
 *                    chain later without adding a v3. The upgrade
 *                    callback is a no-op for now; existing records
 *                    just gain the ability to carry the new field.
 */
export class ScreenwriterDB extends Dexie {
  scripts!: EntityTable<Script, 'id'>;
  drafts!: EntityTable<Draft, 'scriptId'>;
  snapshots!: EntityTable<Snapshot, 'entryId'>;

  constructor(name = 'screenwriter') {
    super(name);
    this.version(1).stores({
      scripts: 'id, updatedAt',
      drafts: 'scriptId',
      snapshots: '++entryId, scriptId, createdAt',
    });
    // v2: no schema change. The `importedPageBreaks` field is
    // un-indexed optional data on Script records. An explicit version
    // bump gives us a migration hook for next time.
    this.version(2)
      .stores({
        scripts: 'id, updatedAt',
        drafts: 'scriptId',
        snapshots: '++entryId, scriptId, createdAt',
      })
      .upgrade(async () => {
        // Intentionally empty — nothing to migrate for v2.
      });
  }
}
