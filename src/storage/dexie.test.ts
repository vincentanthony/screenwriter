import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import { DexieScriptRepository } from './dexie';
import { ScreenwriterDB, SNAPSHOT_RING_SIZE } from './schema';

function makeRepo() {
  // Fresh database per test via a unique name on the shared in-memory factory.
  const name = `screenwriter-test-${Math.random().toString(36).slice(2)}`;
  return new DexieScriptRepository(new ScreenwriterDB(name));
}

beforeEach(() => {
  // Reset fake-indexeddb between tests so no state leaks across cases.
  globalThis.indexedDB = new IDBFactory();
});

describe('DexieScriptRepository — scripts', () => {
  it('creates, lists (meta only, newest first), gets, updates, and deletes', async () => {
    const repo = makeRepo();

    const a = await repo.create({ title: 'First', fountain: 'hello' });
    await new Promise((r) => setTimeout(r, 2));
    const b = await repo.create({ title: 'Second' });

    const list = await repo.list();
    expect(list.map((s) => s.id)).toEqual([b.id, a.id]);
    expect(list[0]).not.toHaveProperty('fountain');

    const got = await repo.get(a.id);
    expect(got?.fountain).toBe('hello');

    const updated = await repo.update(a.id, { fountain: 'world' });
    expect(updated.fountain).toBe('world');
    expect(updated.updatedAt).toBeGreaterThanOrEqual(a.updatedAt);

    await repo.delete(a.id);
    expect(await repo.get(a.id)).toBeNull();
    expect((await repo.list()).map((s) => s.id)).toEqual([b.id]);
  });

  it('throws when updating a missing script', async () => {
    const repo = makeRepo();
    await expect(repo.update('nope', { title: 'x' })).rejects.toThrow(/not found/i);
  });
});

describe('DexieScriptRepository — drafts', () => {
  it('saves, gets, and clears a single draft row per script', async () => {
    const repo = makeRepo();
    const script = await repo.create({ title: 'Draft test' });

    expect(await repo.getDraft(script.id)).toBeNull();

    await repo.saveDraft(script.id, 'v1');
    const first = await repo.getDraft(script.id);
    expect(first?.fountain).toBe('v1');

    await repo.saveDraft(script.id, 'v2');
    const second = await repo.getDraft(script.id);
    expect(second?.fountain).toBe('v2');
    expect(second?.draftUpdatedAt).toBeGreaterThanOrEqual(first?.draftUpdatedAt ?? 0);

    await repo.clearDraft(script.id);
    expect(await repo.getDraft(script.id)).toBeNull();
  });

  it('deleting a script also clears its draft and snapshots', async () => {
    const repo = makeRepo();
    const script = await repo.create({ title: 'Cascade' });
    await repo.saveDraft(script.id, 'draft');
    await repo.pushSnapshot(script.id, 'snap');

    await repo.delete(script.id);

    expect(await repo.getDraft(script.id)).toBeNull();
    expect(await repo.listSnapshots(script.id)).toEqual([]);
  });
});

describe('DexieScriptRepository — snapshots ring buffer', () => {
  it('retains only the N most recent snapshots per script', async () => {
    const repo = makeRepo();
    const script = await repo.create({ title: 'Snap test' });

    for (let i = 0; i < SNAPSHOT_RING_SIZE + 3; i++) {
      await repo.pushSnapshot(script.id, `rev-${i}`);
      // Ensure monotonically increasing createdAt on fake timers.
      await new Promise((r) => setTimeout(r, 1));
    }

    const snapshots = await repo.listSnapshots(script.id);
    expect(snapshots).toHaveLength(SNAPSHOT_RING_SIZE);
    // Newest first.
    expect(snapshots[0].fountain).toBe(`rev-${SNAPSHOT_RING_SIZE + 2}`);
    expect(snapshots.at(-1)?.fountain).toBe(`rev-3`);
  });

  it('scopes snapshots per script', async () => {
    const repo = makeRepo();
    const a = await repo.create({ title: 'A' });
    const b = await repo.create({ title: 'B' });

    await repo.pushSnapshot(a.id, 'a1');
    await repo.pushSnapshot(b.id, 'b1');
    await repo.pushSnapshot(a.id, 'a2');

    const aSnaps = await repo.listSnapshots(a.id);
    const bSnaps = await repo.listSnapshots(b.id);
    expect(aSnaps.map((s) => s.fountain)).toEqual(['a2', 'a1']);
    expect(bSnaps.map((s) => s.fountain)).toEqual(['b1']);
  });
});
