import type {
  Script,
  ScriptMeta,
  Draft,
  Snapshot,
  RecordedPageBreak,
} from '@/types/script';
import { DexieScriptRepository } from './dexie';

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

let instance: ScriptRepository | null = null;

export function getRepository(): ScriptRepository {
  if (!instance) instance = new DexieScriptRepository();
  return instance;
}

export function setRepositoryForTesting(repo: ScriptRepository | null): void {
  instance = repo;
}
