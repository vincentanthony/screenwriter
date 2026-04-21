import { Extension } from '@tiptap/core';
import { InputRule, inputRules } from '@tiptap/pm/inputrules';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';

/**
 * Live-formatting InputRules that promote the current block to a new
 * screenplay element as the user types a trigger sequence. Each
 * promotion runs inside the SAME transaction that inserted the trigger
 * text, which is what makes the whole thing a single Cmd+Z step.
 *
 * Uses ProseMirror's InputRule directly (via @tiptap/pm/inputrules)
 * rather than TipTap's wrapper because the pm signature
 *   (state, match, start, end) => Transaction | null
 * is a pure function — trivially unit-testable without any DOM or Editor.
 */

// ──────────────────────────────────────────────────────────────────────────
// Pure predicates — exported for tests and reusable by any other layer
// that wants to reason about "could this block promote?"
// ──────────────────────────────────────────────────────────────────────────

/** Matches `INT.`, `EXT.`, `EST.`, `I/E.`, `INT./EXT.`, `EXT./INT.` + whitespace. */
export const SCENE_HEADING_TRIGGER =
  /^(INT|EXT|EST|I\/E|INT\.\/EXT|EXT\.\/INT)\.\s$/i;

/** All-caps line ending in `TO:` (e.g. `CUT TO:`, `SMASH CUT TO:`). */
export const TRANSITION_TRIGGER = /^[A-Z][A-Z\s]*TO:$/;

/** Single `(` — only promotes when the block is otherwise empty. */
export const PARENTHETICAL_TRIGGER = /^\($/;

export interface PromotionContext {
  nodeName: string;
  forced: boolean;
  contentSize: number;
}

export function canPromoteToSceneHeading(ctx: PromotionContext, matchedText: string): boolean {
  if (ctx.nodeName !== NODE_NAMES.action) return false;
  if (ctx.forced) return false;
  return SCENE_HEADING_TRIGGER.test(matchedText);
}

export function canPromoteToTransition(ctx: PromotionContext, matchedText: string): boolean {
  if (ctx.nodeName !== NODE_NAMES.action && ctx.nodeName !== NODE_NAMES.character) return false;
  if (ctx.forced) return false;
  return TRANSITION_TRIGGER.test(matchedText);
}

export function canPromoteToParenthetical(ctx: PromotionContext): boolean {
  // Only when the dialogue block is empty — typing `(` mid-dialogue is literal.
  return ctx.nodeName === NODE_NAMES.dialogue && ctx.contentSize === 0;
}

// ──────────────────────────────────────────────────────────────────────────
// Shared handler helper
// ──────────────────────────────────────────────────────────────────────────

/**
 * At handler time the state reflects the doc BEFORE the trigger character
 * was inserted. `start`/`end` point at the match region in the pre-insert
 * doc, and `match[0]` is the full text INCLUDING the trigger. To end up
 * with "trigger preserved + block promoted" in one transaction:
 *
 *   1. Insert the trigger text at `end` (the remainder of `match[0]`
 *      beyond what was already in the doc).
 *   2. Change the enclosing block's type.
 *
 * If `preserveTriggerText` is false, the trigger is swallowed (e.g. `(`
 * is hidden when promoting to Parenthetical since the node renders its
 * own parens via CSS).
 */
function promoteBlock(
  state: EditorState,
  match: RegExpMatchArray,
  start: number,
  end: number,
  newTypeName: string,
  preserveTriggerText: boolean,
): Transaction {
  const tr = state.tr;

  if (preserveTriggerText) {
    const alreadyInDoc = end - start;
    const triggerText = match[0].slice(alreadyInDoc);
    if (triggerText.length > 0) tr.insertText(triggerText, end);
  }

  const newType = state.schema.nodes[newTypeName];
  // Zero-width setBlockType — affects the single block containing `start`.
  tr.setBlockType(start, start, newType);
  return tr;
}

/** For testing: expose the resolver used by the InputRules so handler logic is reachable without the pm inputrules runner. */
function resolveBlockAt(state: EditorState, pos: number): PromotionContext {
  const $pos = state.doc.resolve(pos);
  const node = $pos.parent;
  return {
    nodeName: node.type.name,
    forced: Boolean(node.attrs?.forced),
    contentSize: node.content.size,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Handler functions (exported so tests can call them directly — pm's
// InputRule class doesn't expose `handler` in its public typings).
// ──────────────────────────────────────────────────────────────────────────

export type PromotionHandler = (
  state: EditorState,
  match: RegExpMatchArray,
  start: number,
  end: number,
) => Transaction | null;

export const handleSceneHeadingPromotion: PromotionHandler = (state, match, start, end) => {
  const ctx = resolveBlockAt(state, start);
  if (!canPromoteToSceneHeading(ctx, match[0])) return null;
  return promoteBlock(state, match, start, end, NODE_NAMES.sceneHeading, true);
};

export const handleTransitionPromotion: PromotionHandler = (state, match, start, end) => {
  const ctx = resolveBlockAt(state, start);
  if (!canPromoteToTransition(ctx, match[0])) return null;
  return promoteBlock(state, match, start, end, NODE_NAMES.transition, true);
};

export const handleParentheticalPromotion: PromotionHandler = (state, match, start, end) => {
  const ctx = resolveBlockAt(state, start);
  if (!canPromoteToParenthetical(ctx)) return null;
  // Swallow the trigger `(` — Parenthetical renders its own parens.
  return promoteBlock(state, match, start, end, NODE_NAMES.parenthetical, false);
};

// ──────────────────────────────────────────────────────────────────────────
// InputRule factories (pm-inputrules, not TipTap's wrapper)
// ──────────────────────────────────────────────────────────────────────────

export const sceneHeadingInputRule = new InputRule(SCENE_HEADING_TRIGGER, handleSceneHeadingPromotion);
export const transitionInputRule = new InputRule(TRANSITION_TRIGGER, handleTransitionPromotion);
export const parentheticalInputRule = new InputRule(PARENTHETICAL_TRIGGER, handleParentheticalPromotion);

// ──────────────────────────────────────────────────────────────────────────
// TipTap Extension
// ──────────────────────────────────────────────────────────────────────────

export const LivePromotions = Extension.create({
  name: 'livePromotions',

  addProseMirrorPlugins() {
    return [
      inputRules({
        rules: [sceneHeadingInputRule, transitionInputRule, parentheticalInputRule],
      }),
    ];
  },
});
