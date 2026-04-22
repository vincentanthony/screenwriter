import type {
  Script,
  ScriptMeta,
  Draft,
  Snapshot,
  RecordedPageBreak,
} from '@/types/script';
import type { ScriptRepository } from './repository';
import { ScreenwriterDB, SNAPSHOT_RING_SIZE } from './schema';
import { newId } from '@/lib/id';

export class DexieScriptRepository implements ScriptRepository {
  private db: ScreenwriterDB;

  constructor(db: ScreenwriterDB = new ScreenwriterDB()) {
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
