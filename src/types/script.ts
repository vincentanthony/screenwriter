export interface Script {
  id: string;
  title: string;
  fountain: string;
  createdAt: number;
  updatedAt: number;
  /**
   * Page breaks as RECORDED IN THE SOURCE FDX at import time. Used as
   * calibration reference for paginate() — the live editor still
   * shows whatever our engine computes, but these frozen breaks are
   * the ground truth we compare against.
   *
   * Set exactly once, by the FDX import path. Never overwritten by
   * later edits or re-exports. A re-imported script is a new record
   * with its own importedPageBreaks.
   */
  importedPageBreaks?: RecordedPageBreak[];
}

/**
 * A page boundary as asserted by the source of truth (currently only
 * FDX's `SceneProperties Page=…` attribute). Shared between the
 * importer, the stored Script record, and the calibration harness.
 */
export interface RecordedPageBreak {
  /** 1-indexed page number this break opens onto. */
  pageNumber: number;
  /**
   * Index into the Script's `elements` array (the Fountain parse
   * output) where this page starts. This is the paragraph/element
   * the source's page N begins with.
   */
  elementIndex: number;
}

export type ScriptMeta = Omit<Script, 'fountain' | 'importedPageBreaks'>;

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
