import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import { DexieUsageRepository } from './dexie';
import { ScreenwriterDB } from './schema';
import type { UsageRecord } from '@/types/usage';

function makeRepo() {
  const name = `screenwriter-usage-test-${Math.random().toString(36).slice(2)}`;
  return new DexieUsageRepository(new ScreenwriterDB(name));
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

function baseRecord(overrides: Partial<Omit<UsageRecord, 'id'>> = {}) {
  return {
    timestamp: 1_700_000_000_000,
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    inputTokens: 100,
    outputTokens: 50,
    costCents: 5,
    feature: 'hello-world',
    context: 'dev' as const,
    ...overrides,
  };
}

describe('DexieUsageRepository — create', () => {
  it('returns the stored record with a generated id', async () => {
    const repo = makeRepo();
    const created = await repo.create(baseRecord());
    expect(created.id).toBeTypeOf('string');
    expect(created.id.length).toBeGreaterThan(0);
    expect(created.costCents).toBe(5);
  });

  it('round-trips all fields including optional scriptId / sessionId', async () => {
    const repo = makeRepo();
    const created = await repo.create(
      baseRecord({
        scriptId: 'abc123',
        sessionId: 'sess-xyz',
      }),
    );
    const all = await repo.listRecent(10);
    expect(all[0]).toEqual(created);
  });
});

describe('DexieUsageRepository — listRecent', () => {
  it('returns records newest-first and honors the limit', async () => {
    const repo = makeRepo();
    await repo.create(baseRecord({ timestamp: 1000 }));
    await repo.create(baseRecord({ timestamp: 3000 }));
    await repo.create(baseRecord({ timestamp: 2000 }));

    const recent = await repo.listRecent(10);
    expect(recent.map((r) => r.timestamp)).toEqual([3000, 2000, 1000]);

    const top2 = await repo.listRecent(2);
    expect(top2.map((r) => r.timestamp)).toEqual([3000, 2000]);
  });
});

describe('DexieUsageRepository — listInRange', () => {
  it('returns records in [from, to) newest-first', async () => {
    const repo = makeRepo();
    await repo.create(baseRecord({ timestamp: 100 }));
    await repo.create(baseRecord({ timestamp: 500 }));
    await repo.create(baseRecord({ timestamp: 1000 }));
    await repo.create(baseRecord({ timestamp: 1500 }));

    const mid = await repo.listInRange(500, 1500);
    // 500 included (from is inclusive); 1500 excluded (to is exclusive).
    expect(mid.map((r) => r.timestamp)).toEqual([1000, 500]);
  });
});

describe('DexieUsageRepository — totalSince', () => {
  it('sums costCents and counts calls from timestamp onward', async () => {
    const repo = makeRepo();
    await repo.create(baseRecord({ timestamp: 500, costCents: 2 }));
    await repo.create(baseRecord({ timestamp: 1500, costCents: 7 }));
    await repo.create(baseRecord({ timestamp: 2500, costCents: 11 }));

    const totals = await repo.totalSince(1000);
    expect(totals).toEqual({ costCents: 18, callCount: 2 });
  });

  it('returns zeros for a timestamp after every record', async () => {
    const repo = makeRepo();
    await repo.create(baseRecord({ timestamp: 500, costCents: 2 }));
    const totals = await repo.totalSince(10_000);
    expect(totals).toEqual({ costCents: 0, callCount: 0 });
  });
});

describe('DexieUsageRepository — deleteOlderThan', () => {
  it('removes records strictly older than the cutoff and returns the count', async () => {
    const repo = makeRepo();
    await repo.create(baseRecord({ timestamp: 100 }));
    await repo.create(baseRecord({ timestamp: 500 }));
    await repo.create(baseRecord({ timestamp: 1000 }));

    const deleted = await repo.deleteOlderThan(500);
    expect(deleted).toBe(1); // only the timestamp=100 row

    const remaining = await repo.listRecent(10);
    expect(remaining.map((r) => r.timestamp)).toEqual([1000, 500]);
  });
});
