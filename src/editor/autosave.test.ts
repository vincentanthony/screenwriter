import { describe, expect, it, vi } from 'vitest';
import type { ScriptRepository } from '@/storage/repository';
import { commitMainSave, installBeforeUnloadFlush } from './autosave';

/**
 * Builds a fully-mocked ScriptRepository. Only the methods commitMainSave
 * actually calls are asserted on; the rest are vi.fn() for type completeness.
 */
function makeMockRepo(): ScriptRepository & { [K in keyof ScriptRepository]: ReturnType<typeof vi.fn> } {
  return {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    saveDraft: vi.fn().mockResolvedValue(undefined),
    getDraft: vi.fn().mockResolvedValue(null),
    clearDraft: vi.fn().mockResolvedValue(undefined),
    pushSnapshot: vi.fn().mockResolvedValue(undefined),
    listSnapshots: vi.fn().mockResolvedValue([]),
  } as never;
}

describe('commitMainSave — snapshot dedup', () => {
  it('pushes a snapshot on the first save (lastSnapshotFountain === null)', async () => {
    const repo = makeMockRepo();
    const result = await commitMainSave({
      id: 's1',
      fountain: 'ALICE\nHi.\n',
      repo,
      lastSnapshotFountain: null,
    });

    expect(repo.pushSnapshot).toHaveBeenCalledTimes(1);
    expect(repo.pushSnapshot).toHaveBeenCalledWith('s1', 'ALICE\nHi.\n');
    expect(result.snapshotPushed).toBe(true);
    expect(result.lastSnapshotFountain).toBe('ALICE\nHi.\n');
  });

  it('SKIPS pushSnapshot when Fountain is byte-identical to the most recent', async () => {
    const repo = makeMockRepo();
    const result = await commitMainSave({
      id: 's1',
      fountain: 'ALICE\nHi.\n',
      repo,
      lastSnapshotFountain: 'ALICE\nHi.\n',
    });

    expect(repo.pushSnapshot).not.toHaveBeenCalled();
    expect(result.snapshotPushed).toBe(false);
    // Baseline carries forward unchanged.
    expect(result.lastSnapshotFountain).toBe('ALICE\nHi.\n');
  });

  it('pushes when even one byte differs', async () => {
    const repo = makeMockRepo();
    const result = await commitMainSave({
      id: 's1',
      fountain: 'ALICE\nHi!\n',
      repo,
      lastSnapshotFountain: 'ALICE\nHi.\n',
    });

    expect(repo.pushSnapshot).toHaveBeenCalledTimes(1);
    expect(result.snapshotPushed).toBe(true);
    expect(result.lastSnapshotFountain).toBe('ALICE\nHi!\n');
  });

  it('always calls repo.update regardless of snapshot dedup', async () => {
    const repo = makeMockRepo();
    await commitMainSave({
      id: 's1',
      fountain: 'x',
      repo,
      lastSnapshotFountain: 'x',
    });
    expect(repo.update).toHaveBeenCalledWith('s1', { fountain: 'x' });
  });

  it('clears the draft row after a successful save', async () => {
    const repo = makeMockRepo();
    await commitMainSave({
      id: 's1',
      fountain: 'x',
      repo,
      lastSnapshotFountain: null,
    });
    expect(repo.clearDraft).toHaveBeenCalledWith('s1');
  });

  it('runs in update → snapshot → clearDraft order', async () => {
    const calls: string[] = [];
    const repo = makeMockRepo();
    repo.update.mockImplementation(async () => {
      calls.push('update');
    });
    repo.pushSnapshot.mockImplementation(async () => {
      calls.push('pushSnapshot');
    });
    repo.clearDraft.mockImplementation(async () => {
      calls.push('clearDraft');
    });

    await commitMainSave({
      id: 's1',
      fountain: 'y',
      repo,
      lastSnapshotFountain: null,
    });

    expect(calls).toEqual(['update', 'pushSnapshot', 'clearDraft']);
  });
});

describe('installBeforeUnloadFlush', () => {
  it('calls debounced.flush() when beforeunload fires', () => {
    const debounced = { flush: vi.fn() };
    const cleanup = installBeforeUnloadFlush(debounced);
    try {
      window.dispatchEvent(new Event('beforeunload'));
      expect(debounced.flush).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it('also calls flush() on pagehide (mobile Safari / bfcache)', () => {
    const debounced = { flush: vi.fn() };
    const cleanup = installBeforeUnloadFlush(debounced);
    try {
      window.dispatchEvent(new Event('pagehide'));
      expect(debounced.flush).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it('removes both listeners when the cleanup is run', () => {
    const debounced = { flush: vi.fn() };
    const cleanup = installBeforeUnloadFlush(debounced);
    cleanup();
    window.dispatchEvent(new Event('beforeunload'));
    window.dispatchEvent(new Event('pagehide'));
    expect(debounced.flush).not.toHaveBeenCalled();
  });
});
