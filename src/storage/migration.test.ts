import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import Dexie from 'dexie';
import { DexieScriptRepository, DexieUsageRepository } from './dexie';
import { ScreenwriterDB } from './schema';

/**
 * Dexie schema migration tests.
 *
 * v1 (initial): scripts (id, updatedAt), drafts (scriptId),
 *               snapshots (++entryId, scriptId, createdAt).
 * v2 (FDX import commit): optional `importedPageBreaks` on Script.
 *     No index change — just the possibility of the field existing
 *     on new records. Existing records are untouched.
 * v3 (AI usage tracking): new `usageRecords` table. Scripts / drafts
 *     / snapshots are unchanged, so the invariant is: existing data
 *     survives the upgrade unchanged, and the new table works as a
 *     fresh empty store.
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

// Seed a v2-shaped database (scripts/drafts/snapshots, no usageRecords)
// the way it would have existed before the v3 bump.
async function seedV2Database(name: string): Promise<void> {
  const legacy = new Dexie(name);
  legacy.version(1).stores({
    scripts: 'id, updatedAt',
    drafts: 'scriptId',
    snapshots: '++entryId, scriptId, createdAt',
  });
  legacy.version(2).stores({
    scripts: 'id, updatedAt',
    drafts: 'scriptId',
    snapshots: '++entryId, scriptId, createdAt',
  });
  await legacy.open();
  await legacy.table('scripts').add({
    id: 'v2-script-1',
    title: 'Pre-AI Script',
    fountain: 'INT. OFFICE - NIGHT\n',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    importedPageBreaks: [{ pageNumber: 2, elementIndex: 3 }],
  });
  await legacy.table('drafts').add({
    scriptId: 'v2-script-1',
    fountain: 'draft body',
    draftUpdatedAt: 1700000002000,
  });
  legacy.close();
}

describe('Dexie migration — v2 → v3', () => {
  it('preserves existing Script rows (including v2 importedPageBreaks)', async () => {
    const dbName = `migrate-v3-${Math.random().toString(36).slice(2)}`;
    await seedV2Database(dbName);

    const db = new ScreenwriterDB(dbName);
    const scripts = new DexieScriptRepository(db);
    const loaded = await scripts.get('v2-script-1');
    expect(loaded?.title).toBe('Pre-AI Script');
    expect(loaded?.importedPageBreaks).toEqual([
      { pageNumber: 2, elementIndex: 3 },
    ]);
  });

  it('preserves existing Draft rows across the v3 bump', async () => {
    const dbName = `migrate-v3-${Math.random().toString(36).slice(2)}`;
    await seedV2Database(dbName);

    const db = new ScreenwriterDB(dbName);
    const scripts = new DexieScriptRepository(db);
    const draft = await scripts.getDraft('v2-script-1');
    expect(draft?.fountain).toBe('draft body');
  });

  it('new usageRecords table is empty after the upgrade', async () => {
    const dbName = `migrate-v3-${Math.random().toString(36).slice(2)}`;
    await seedV2Database(dbName);

    const db = new ScreenwriterDB(dbName);
    const usage = new DexieUsageRepository(db);
    const recent = await usage.listRecent(10);
    expect(recent).toEqual([]);
  });

  it('writes to the new usageRecords table persist alongside legacy data', async () => {
    const dbName = `migrate-v3-${Math.random().toString(36).slice(2)}`;
    await seedV2Database(dbName);

    const db = new ScreenwriterDB(dbName);
    const scripts = new DexieScriptRepository(db);
    const usage = new DexieUsageRepository(db);

    await usage.create({
      timestamp: 1_700_500_000_000,
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      inputTokens: 10,
      outputTokens: 5,
      costCents: 1,
      feature: 'hello-world',
      context: 'dev',
    });

    const recent = await usage.listRecent(10);
    expect(recent).toHaveLength(1);
    expect(recent[0].feature).toBe('hello-world');

    // Legacy script still readable after the mixed-table write.
    const loaded = await scripts.get('v2-script-1');
    expect(loaded?.title).toBe('Pre-AI Script');
  });
});
