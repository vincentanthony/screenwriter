import type {
  Script,
  ScriptMeta,
  Draft,
  Snapshot,
  RecordedPageBreak,
} from '@/types/script';
import type { UsageRecord } from '@/types/usage';
import type { ScriptRepository, UsageRepository } from './repository';
import { ScreenwriterDB, SNAPSHOT_RING_SIZE } from './schema';
import { newId } from '@/lib/id';

/**
 * Both repositories share a single Dexie database instance so
 * migrations stay consistent and transactions can span tables later
 * if needed. Kept as module-level state rather than a full singleton
 * class so unit tests can construct their own ScreenwriterDB and
 * inject it into either repo.
 */
let sharedDb: ScreenwriterDB | null = null;
function defaultDb(): ScreenwriterDB {
  if (!sharedDb) sharedDb = new ScreenwriterDB();
  return sharedDb;
}

export class DexieScriptRepository implements ScriptRepository {
  private db: ScreenwriterDB;

  constructor(db: ScreenwriterDB = defaultDb()) {
    this.db = db;
  }

  async list(): Promise<ScriptMeta[]> {
    const rows = await this.db.scripts.orderBy('updatedAt').reverse().toArray();
    return rows.map(({ fountain: _fountain, ...meta }) => meta);
  }

  async get(id: string): Promise<Script | null> {
    return (await this.db.scripts.get(id)) ?? null;
  }

  async create(input: {
    title: string;
    fountain?: string;
    importedPageBreaks?: RecordedPageBreak[];
  }): Promise<Script> {
    const now = Date.now();
    const script: Script = {
      id: newId(),
      title: input.title,
      fountain: input.fountain ?? '',
      createdAt: now,
      updatedAt: now,
      ...(input.importedPageBreaks && input.importedPageBreaks.length > 0
        ? { importedPageBreaks: input.importedPageBreaks }
        : {}),
    };
    await this.db.scripts.add(script);
    return script;
  }

  async update(
    id: string,
    patch: Partial<Pick<Script, 'title' | 'fountain'>>,
  ): Promise<Script> {
    const existing = await this.db.scripts.get(id);
    if (!existing) throw new Error(`Script not found: ${id}`);
    const next: Script = { ...existing, ...patch, updatedAt: Date.now() };
    await this.db.scripts.put(next);
    return next;
  }

  async delete(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.scripts, this.db.drafts, this.db.snapshots, async () => {
      await this.db.scripts.delete(id);
      await this.db.drafts.delete(id);
      await this.db.snapshots.where('scriptId').equals(id).delete();
    });
  }

  async saveDraft(scriptId: string, fountain: string): Promise<void> {
    const draft: Draft = { scriptId, fountain, draftUpdatedAt: Date.now() };
    await this.db.drafts.put(draft);
  }

  async getDraft(scriptId: string): Promise<Draft | null> {
    return (await this.db.drafts.get(scriptId)) ?? null;
  }

  async clearDraft(scriptId: string): Promise<void> {
    await this.db.drafts.delete(scriptId);
  }

  async pushSnapshot(scriptId: string, fountain: string): Promise<void> {
    await this.db.transaction('rw', this.db.snapshots, async () => {
      await this.db.snapshots.add({
        scriptId,
        fountain,
        createdAt: Date.now(),
      } as Snapshot);

      const forScript = await this.db.snapshots
        .where('scriptId')
        .equals(scriptId)
        .sortBy('createdAt');

      const excess = forScript.length - SNAPSHOT_RING_SIZE;
      if (excess > 0) {
        const toDelete = forScript.slice(0, excess).map((s) => s.entryId);
        await this.db.snapshots.bulkDelete(toDelete);
      }
    });
  }

  async listSnapshots(scriptId: string): Promise<Snapshot[]> {
    const rows = await this.db.snapshots.where('scriptId').equals(scriptId).sortBy('createdAt');
    return rows.reverse();
  }
}

export class DexieUsageRepository implements UsageRepository {
  private db: ScreenwriterDB;

  constructor(db: ScreenwriterDB = defaultDb()) {
    this.db = db;
  }

  async create(record: Omit<UsageRecord, 'id'>): Promise<UsageRecord> {
    const full: UsageRecord = { id: newId(), ...record };
    await this.db.usageRecords.add(full);
    return full;
  }

  async listRecent(limit: number): Promise<UsageRecord[]> {
    // Dexie's reverse+limit on an indexed field gives a newest-first
    // read without loading the whole table. Indexed on `timestamp`.
    return this.db.usageRecords
      .orderBy('timestamp')
      .reverse()
      .limit(limit)
      .toArray();
  }

  async listInRange(from: number, to: number): Promise<UsageRecord[]> {
    // [from, to) — half-open to match how callers specify windows
    // (e.g. "today" = [startOfDay, startOfTomorrow)).
    const rows = await this.db.usageRecords
      .where('timestamp')
      .between(from, to, true, false)
      .toArray();
    // between() doesn't preserve order; sort newest-first explicitly.
    rows.sort((a, b) => b.timestamp - a.timestamp);
    return rows;
  }

  async totalSince(
    timestamp: number,
  ): Promise<{ costCents: number; callCount: number }> {
    let costCents = 0;
    let callCount = 0;
    await this.db.usageRecords
      .where('timestamp')
      .aboveOrEqual(timestamp)
      .each((rec) => {
        costCents += rec.costCents;
        callCount += 1;
      });
    return { costCents, callCount };
  }

  async deleteOlderThan(timestamp: number): Promise<number> {
    return this.db.usageRecords
      .where('timestamp')
      .below(timestamp)
      .delete();
  }
}
