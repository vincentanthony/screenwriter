import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { canSplit } from '@tiptap/pm/transform';
import { NODE_NAMES, type NodeName } from '@/editor/serialization/nodeNames';

/**
 * Element-cycling keymap — the Tab/Shift-Tab/Enter rules that turn raw
 * keystrokes into screenplay element transitions.
 *
 * The logic is split into pure resolver functions so the state machine is
 * unit-testable without a full editor. The Extension wrapper just:
 *   1. Reads the current node + emptiness from the editor selection
 *   2. Asks the resolver what to do
 *   3. Executes the resulting TipTap command (or returns false to let the
 *      browser's default handling run)
 */

// --- Maps (Final Draft conventions, see plan section 3) --------------------

/** Tab on a non-empty block: convert current block to this type. */
const TAB_MAP: Partial<Record<NodeName, NodeName>> = {
  [NODE_NAMES.sceneHeading]: NODE_NAMES.action,
  [NODE_NAMES.action]: NODE_NAMES.character,
  [NODE_NAMES.character]: NODE_NAMES.transition,
  [NODE_NAMES.parenthetical]: NODE_NAMES.dialogue,
  [NODE_NAMES.dialogue]: NODE_NAMES.parenthetical,
  [NODE_NAMES.transition]: NODE_NAMES.sceneHeading,
};

/** Shift+Tab on a non-empty block: reverse of TAB_MAP. */
const SHIFT_TAB_MAP: Partial<Record<NodeName, NodeName>> = {
  [NODE_NAMES.sceneHeading]: NODE_NAMES.transition,
  [NODE_NAMES.action]: NODE_NAMES.sceneHeading,
  [NODE_NAMES.character]: NODE_NAMES.action,
  [NODE_NAMES.parenthetical]: NODE_NAMES.dialogue,
  [NODE_NAMES.dialogue]: NODE_NAMES.parenthetical,
  [NODE_NAMES.transition]: NODE_NAMES.character,
};

/**
 * Empty-line Tab cycle: Action → Character → Transition → Scene Heading →
 * Action (matches Final Draft). Shift+Tab walks the same ring backwards.
 */
const EMPTY_CYCLE: readonly NodeName[] = [
  NODE_NAMES.action,
  NODE_NAMES.character,
  NODE_NAMES.transition,
  NODE_NAMES.sceneHeading,
] as const;

/**
 * Enter on a non-empty block: create a new block below of this type.
 * Action → Action (new Action block, the expected default).
 */
const ENTER_MAP: Partial<Record<NodeName, NodeName>> = {
  [NODE_NAMES.sceneHeading]: NODE_NAMES.action,
  [NODE_NAMES.action]: NODE_NAMES.action,
  [NODE_NAMES.character]: NODE_NAMES.dialogue,
  [NODE_NAMES.parenthetical]: NODE_NAMES.dialogue,
  [NODE_NAMES.dialogue]: NODE_NAMES.character,
  [NODE_NAMES.transition]: NODE_NAMES.sceneHeading,
};

// --- Pure resolvers ---------------------------------------------------------

export interface KeyMapContext {
  /** Current block's node type name. */
  current: string;
  /** Whether the current block has no text content. */
  isEmpty: boolean;
}

export type KeyMapAction =
  /** Convert the current block to another type, keep cursor in place. */
  | { kind: 'convert'; to: NodeName }
  /** Split the current block, new block below gets this type, cursor follows. */
  | { kind: 'split'; to: NodeName }
  /** Do nothing — let the browser/TipTap default handler run. */
  | { kind: 'passthrough' };

/**
 * Resolve a Tab keypress to an action. On an empty line that sits in the
 * cycle, Tab advances the cycle. On a non-empty line (or an empty
 * Parenthetical/Dialogue/etc.), Tab applies the per-element map.
 */
export function resolveTab(ctx: KeyMapContext): KeyMapAction {
  if (ctx.isEmpty) {
    const idx = EMPTY_CYCLE.indexOf(ctx.current as NodeName);
    if (idx !== -1) {
      return { kind: 'convert', to: EMPTY_CYCLE[(idx + 1) % EMPTY_CYCLE.length] };
    }
  }
  const target = TAB_MAP[ctx.current as NodeName];
  return target ? { kind: 'convert', to: target } : { kind: 'passthrough' };
}

/**
 * Resolve a Shift+Tab keypress. Same structure as resolveTab but walks the
 * cycle and per-element map in reverse.
 */
export function resolveShiftTab(ctx: KeyMapContext): KeyMapAction {
  if (ctx.isEmpty) {
    const idx = EMPTY_CYCLE.indexOf(ctx.current as NodeName);
    if (idx !== -1) {
      const prev = (idx - 1 + EMPTY_CYCLE.length) % EMPTY_CYCLE.length;
      return { kind: 'convert', to: EMPTY_CYCLE[prev] };
    }
  }
  const target = SHIFT_TAB_MAP[ctx.current as NodeName];
  return target ? { kind: 'convert', to: target } : { kind: 'passthrough' };
}

/**
 * Resolve an Enter keypress.
 *
 *   - On an empty non-Action block: convert to Action (the "Enter twice
 *     returns to Action" rule — first Enter split into e.g. Dialogue, a
 *     second Enter on that empty block converts it to Action).
 *   - On a non-empty block: split and set the new block per ENTER_MAP.
 *   - Otherwise: passthrough (default Enter handling).
 */
export function resolveEnter(ctx: KeyMapContext): KeyMapAction {
  if (ctx.isEmpty && ctx.current !== NODE_NAMES.action) {
    if ((EMPTY_CYCLE as readonly string[]).includes(ctx.current) ||
        ctx.current === NODE_NAMES.parenthetical ||
        ctx.current === NODE_NAMES.dialogue) {
      return { kind: 'convert', to: NODE_NAMES.action };
    }
  }
  const target = ENTER_MAP[ctx.current as NodeName];
  return target ? { kind: 'split', to: target } : { kind: 'passthrough' };
}

// --- TipTap wiring ----------------------------------------------------------

/**
 * Run a resolved KeyMapAction against a live editor. Returns true if the
 * command was handled (TipTap will stop propagation), false to let the
 * default handler run.
 *
 * Exported so the integration tests can drive the exact same path the
 * keyboard bindings drive, without depending on synthetic KeyboardEvents.
 */
export function executeKeyMapAction(editor: Editor, action: KeyMapAction): boolean {
  switch (action.kind) {
    case 'passthrough':
      return false;
    case 'convert':
      return editor.chain().focus().setNode(action.to).run();
    case 'split':
      return splitBlockToType(editor, action.to);
  }
}

/**
 * Split the current block and make the new (right-hand) block have
 * `targetTypeName`, all in a single ProseMirror transform step.
 *
 * Why not `chain().splitBlock().setNode(targetType).run()`? Because
 * pm-commands.splitBlock uses `defaultBlockAt` to pick the split's
 * right-hand type, which for our schema happens to be Scene Heading.
 * When the user is in a Transition and presses Enter, splitBlock already
 * produces a Scene Heading — then TipTap's `setNode` runs its
 * "can I set this type?" probe via pm-commands.setBlockType. That probe
 * treats "already this type" as NOT applicable (the `hasMarkup` check
 * short-circuits before `applicable = true`), so setNode falls through
 * to its clearNodes fallback, which then trips on stale positions with
 * "Position N out of range".
 *
 * Issuing tr.split(pos, 1, [{type: targetType}]) directly:
 *   - one pm step, one undo entry
 *   - the new block's type is whatever we ask for, independent of schema
 *     registration order or defaultBlockAt
 *   - no setNode / clearNodes / probe dance to go wrong
 */
function splitBlockToType(editor: Editor, targetTypeName: string): boolean {
  const { state } = editor;
  const targetType = state.schema.nodes[targetTypeName];
  if (!targetType) return false;

  const tr = state.tr;
  if (!state.selection.empty) tr.deleteSelection();

  const splitPos = tr.mapping.map(state.selection.$from.pos);
  const typesAfter = [{ type: targetType }];

  if (!canSplit(tr.doc, splitPos, 1, typesAfter)) {
    // Schema rejected the requested type at this position — bail rather
    // than silently mangling the doc.
    return false;
  }

  tr.split(splitPos, 1, typesAfter);
  tr.scrollIntoView();
  editor.view.dispatch(tr);
  return true;
}

/** Pull the KeyMapContext from the editor's current selection. */
export function contextFromEditor(editor: Editor): KeyMapContext {
  const { $from } = editor.state.selection;
  const parent = $from.parent;
  return { current: parent.type.name, isEmpty: parent.content.size === 0 };
}

export const ElementKeymap = Extension.create({
  name: 'elementKeymap',

  addKeyboardShortcuts() {
    return {
      Tab: () =>
        executeKeyMapAction(this.editor as Editor, resolveTab(contextFromEditor(this.editor as Editor))),
      'Shift-Tab': () =>
        executeKeyMapAction(this.editor as Editor, resolveShiftTab(contextFromEditor(this.editor as Editor))),
      Enter: () =>
        executeKeyMapAction(this.editor as Editor, resolveEnter(contextFromEditor(this.editor as Editor))),
    };
  },
});
