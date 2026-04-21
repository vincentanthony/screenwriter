/**
 * Barrel for the screenplay editor layer. Re-exports nodes, extensions,
 * and the Fountain ↔ TipTap serialization bridge so callers can pull
 * everything from `@/editor`.
 *
 * No `Editor` factory yet — that lands with the EditorPage wiring so the
 * editor lifecycle is scoped to the component that mounts it.
 */
export * from './nodes';
export * from './extensions';
export * from './serialization';
