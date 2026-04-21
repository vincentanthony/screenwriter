import Dexie, { type EntityTable } from 'dexie';
import type { Script, Draft, Snapshot } from '@/types/script';

export const SNAPSHOT_RING_SIZE = 5;

export class ScreenwriterDB extends Dexie {
  scripts!: EntityTable<Script, 'id'>;
  drafts!: EntityTable<Draft, 'scriptId'>;
  snapshots!: EntityTable<Snapshot, 'entryId'>;

  constructor(name = 'screenwriter') {
    super(name);
    this.version(1).stores({
      scripts: 'id, updatedAt',
      drafts: 'scriptId',
      snapshots: '++entryId, scriptId, createdAt',
    });
  }
}
