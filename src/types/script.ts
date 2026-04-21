export interface Script {
  id: string;
  title: string;
  fountain: string;
  createdAt: number;
  updatedAt: number;
}

export type ScriptMeta = Omit<Script, 'fountain'>;

export interface Draft {
  scriptId: string;
  fountain: string;
  draftUpdatedAt: number;
}

export interface Snapshot {
  entryId: number;
  scriptId: string;
  fountain: string;
  createdAt: number;
}
