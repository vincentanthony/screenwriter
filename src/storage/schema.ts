import Dexie, { type EntityTable } from 'dexie';
import type { Script, Draft, Snapshot } from '@/types/script';
import type { UsageRecord } from '@/types/usage';

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
 *
 *   v3 (AI usage tracking): added a `usageRecords` table for the
 *                    AI-call audit log (timestamp, provider, model,
 *                    tokens, costCents, feature, scriptId, context).
 *                    Existing `scripts` / `drafts` / `snapshots`
 *                    tables are untouched — Dexie carries them over
 *                    automatically when their `.stores()` entries
 *                    are re-declared unchanged. The upgrade callback
 *                    is a no-op; new calls simply populate the new
 *                    table going forward.
 */
export class ScreenwriterDB extends Dexie {
  scripts!: EntityTable<Script, 'id'>;
  drafts!: EntityTable<Draft, 'scriptId'>;
  snapshots!: EntityTable<Snapshot, 'entryId'>;
  usageRecords!: EntityTable<UsageRecord, 'id'>;

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
    // v3: add the AI usage-tracking table. Indexes on timestamp
    // (for "today"/"last 7 days" range queries) and scriptId (for
    // future per-script cost breakdowns). `feature` is indexed too
    // so we can group by feature without a full scan.
    this.version(3)
      .stores({
        scripts: 'id, updatedAt',
        drafts: 'scriptId',
        snapshots: '++entryId, scriptId, createdAt',
        usageRecords: 'id, timestamp, scriptId, feature, provider',
      })
      .upgrade(async () => {
        // No backfill — every historical user has zero AI calls in
        // their local DB because this feature didn't exist yet.
      });
  }
}
