import type {
  Script,
  ScriptMeta,
  Draft,
  Snapshot,
  RecordedPageBreak,
} from '@/types/script';
import type { UsageRecord } from '@/types/usage';
import { DexieScriptRepository, DexieUsageRepository } from './dexie';

export interface ScriptRepository {
  list(): Promise<ScriptMeta[]>;
  get(id: string): Promise<Script | null>;
  create(input: {
    title: string;
    fountain?: string;
    importedPageBreaks?: RecordedPageBreak[];
  }): Promise<Script>;
  update(
    id: string,
    patch: Partial<Pick<Script, 'title' | 'fountain'>>,
  ): Promise<Script>;
  delete(id: string): Promise<void>;

  saveDraft(scriptId: string, fountain: string): Promise<void>;
  getDraft(scriptId: string): Promise<Draft | null>;
  clearDraft(scriptId: string): Promise<void>;

  pushSnapshot(scriptId: string, fountain: string): Promise<void>;
  listSnapshots(scriptId: string): Promise<Snapshot[]>;
}

/**
 * AI usage-log repository. Lives behind its own interface so the AI
 * layer can be unit-tested against an in-memory impl without pulling
 * in Dexie, and so a future backend-routed usage log is a one-file
 * swap. Reads return newest-first.
 */
export interface UsageRepository {
  /** Persist a new record. Returns the stored row with its generated id. */
  create(record: Omit<UsageRecord, 'id'>): Promise<UsageRecord>;

  /** Most recent N records, newest first. */
  listRecent(limit: number): Promise<UsageRecord[]>;

  /** Records whose timestamp falls in [from, to). Newest first. */
  listInRange(from: number, to: number): Promise<UsageRecord[]>;

  /**
   * Aggregate totals for records with timestamp ≥ `timestamp`.
   * Single pass; used by the ambient cost indicator and the Usage
   * page's Today / 7d / 30d cards.
   */
  totalSince(
    timestamp: number,
  ): Promise<{ costCents: number; callCount: number }>;

  /** Deletes all records older than `timestamp`. Returns count deleted. */
  deleteOlderThan(timestamp: number): Promise<number>;
}

let scriptRepoInstance: ScriptRepository | null = null;
let usageRepoInstance: UsageRepository | null = null;

export function getRepository(): ScriptRepository {
  if (!scriptRepoInstance) scriptRepoInstance = new DexieScriptRepository();
  return scriptRepoInstance;
}

export function setRepositoryForTesting(repo: ScriptRepository | null): void {
  scriptRepoInstance = repo;
}

export function getUsageRepository(): UsageRepository {
  if (!usageRepoInstance) usageRepoInstance = new DexieUsageRepository();
  return usageRepoInstance;
}

export function setUsageRepositoryForTesting(repo: UsageRepository | null): void {
  usageRepoInstance = repo;
}
