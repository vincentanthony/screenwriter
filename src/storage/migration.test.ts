import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import Dexie from 'dexie';
import { DexieScriptRepository } from './dexie';
import { ScreenwriterDB } from './schema';

/**
 * Dexie schema migration tests.
 *
 * v1 (initial): scripts (id, updatedAt), drafts (scriptId),
 *               snapshots (++entryId, scriptId, createdAt).
 * v2 (FDX import commit): optional `importedPageBreaks` on Script.
 *     No index change — just the possibility of the field existing
 *     on new records. Existing records are untouched.
 *
 * What these tests care about: opening a v1-shaped database with
 * our v2 schema doesn't drop anything; existing scripts stay
 * readable; and new writes under v2 can carry the new field.
 */

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

// Build a v1-shaped database the way it would have existed before the
// commit that introduced v2. We can't rely on our ScreenwriterDB class
// (it's post-v2) so we declare a minimal Dexie directly pinned at v1.
async function seedV1Database(name: string): Promise<void> {
  const legacy = new Dexie(name);
  legacy.version(1).stores({
    scripts: 'id, updatedAt',
    drafts: 'scriptId',
    snapshots: '++entryId, scriptId, createdAt',
  });
  await legacy.open();
  await legacy.table('scripts').add({
    id: 'v1-script-1',
    title: 'Legacy Script',
    fountain: 'INT. ROOM - DAY\n\nShe walks in.\n',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  });
  await legacy.table('drafts').add({
    scriptId: 'v1-script-1',
    fountain: 'draft text',
    draftUpdatedAt: 1700000001000,
  });
  legacy.close();
}

describe('Dexie migration — v1 → v2', () => {
  it('preserves existing Script rows when opened with the v2 schema', async () => {
    const dbName = `migrate-test-${Math.random().toString(36).slice(2)}`;
    await seedV1Database(dbName);

    // Open with the current (v2) schema.
    const repo = new DexieScriptRepository(new ScreenwriterDB(dbName));
    const loaded = await repo.get('v1-script-1');

    expect(loaded).not.toBeNull();
    expect(loaded?.title).toBe('Legacy Script');
    expect(loaded?.fountain).toBe('INT. ROOM - DAY\n\nShe walks in.\n');
    // Old records have no importedPageBreaks — should be undefined,
    // not an empty array or a thrown error.
    expect(loaded?.importedPageBreaks).toBeUndefined();
  });

  it('preserves existing Draft rows through the migration', async () => {
    const dbName = `migrate-test-${Math.random().toString(36).slice(2)}`;
    await seedV1Database(dbName);

    const repo = new DexieScriptRepository(new ScreenwriterDB(dbName));
    const draft = await repo.getDraft('v1-script-1');
    expect(draft).not.toBeNull();
    expect(draft?.fountain).toBe('draft text');
  });

  it('new writes under v2 can carry the new importedPageBreaks field', async () => {
    const dbName = `migrate-test-${Math.random().toString(36).slice(2)}`;
    const repo = new DexieScriptRepository(new ScreenwriterDB(dbName));
    const created = await repo.create({
      title: 'Imported',
      fountain: 'INT. ROOM - DAY\n',
      importedPageBreaks: [{ pageNumber: 2, elementIndex: 5 }],
    });
    expect(created.importedPageBreaks).toEqual([{ pageNumber: 2, elementIndex: 5 }]);

    const reloaded = await repo.get(created.id);
    expect(reloaded?.importedPageBreaks).toEqual([{ pageNumber: 2, elementIndex: 5 }]);
  });

  it('omits the field entirely when no importedPageBreaks is supplied', async () => {
    const dbName = `migrate-test-${Math.random().toString(36).slice(2)}`;
    const repo = new DexieScriptRepository(new ScreenwriterDB(dbName));
    const created = await repo.create({ title: 'No imports' });
    expect(created.importedPageBreaks).toBeUndefined();
    const reloaded = await repo.get(created.id);
    expect(reloaded?.importedPageBreaks).toBeUndefined();
  });
});
