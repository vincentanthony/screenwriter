/**
 * Barrel for the screenplay editor layer. Re-exports nodes, extensions,
 * the Fountain ↔ TipTap serialization bridge, the editor hook, and the
 * pure autosave primitives so callers can pull everything from `@/editor`.
 */
export * from './nodes';
export * from './extensions';
export * from './serialization';
export { useScreenplayEditor } from './useScreenplayEditor';
export type {
  UseScreenplayEditorOptions,
  UseScreenplayEditorResult,
} from './useScreenplayEditor';
export {
  commitMainSave,
  installBeforeUnloadFlush,
  type CommitMainSaveArgs,
  type CommitMainSaveResult,
  type Flushable,
} from './autosave';
