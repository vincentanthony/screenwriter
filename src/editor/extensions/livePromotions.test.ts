import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import {
  canPromoteToParenthetical,
  canPromoteToSceneHeading,
  canPromoteToTransition,
  handleParentheticalPromotion,
  handleSceneHeadingPromotion,
  handleTransitionPromotion,
  SCENE_HEADING_TRIGGER,
  TRANSITION_TRIGGER,
} from './livePromotions';

// ──────────────────────────────────────────────────────────────────────────
// Pure predicates
// ──────────────────────────────────────────────────────────────────────────

describe('canPromoteToSceneHeading', () => {
  const inAction = { nodeName: NODE_NAMES.action, forced: false, contentSize: 0 };

  it.each([
    'INT. ',
    'EXT. ',
    'EST. ',
    'I/E. ',
    'INT./EXT. ',
    'EXT./INT. ',
    'int. ',
    'ext. ',
  ])('promotes when text is %p', (text) => {
    expect(canPromoteToSceneHeading(inAction, text)).toBe(true);
  });

  it('does NOT promote a forced action block (the `!` exists for literal INT. text)', () => {
    const forced = { ...inAction, forced: true };
    expect(canPromoteToSceneHeading(forced, 'INT. ')).toBe(false);
  });

  it('does NOT promote when the current block is not Action', () => {
    for (const nodeName of [
      NODE_NAMES.dialogue,
      NODE_NAMES.character,
      NODE_NAMES.parenthetical,
      NODE_NAMES.sceneHeading,
    ]) {
      expect(canPromoteToSceneHeading({ ...inAction, nodeName }, 'INT. ')).toBe(false);
    }
  });

  it('does NOT promote on partial prefixes or missing trailing whitespace', () => {
    expect(canPromoteToSceneHeading(inAction, 'INT')).toBe(false);
    expect(canPromoteToSceneHeading(inAction, 'INT.')).toBe(false);
    expect(canPromoteToSceneHeading(inAction, 'INTO ')).toBe(false);
    expect(canPromoteToSceneHeading(inAction, 'INTERIOR. ')).toBe(false);
  });
});

describe('canPromoteToTransition', () => {
  const inAction = { nodeName: NODE_NAMES.action, forced: false, contentSize: 0 };

  it.each(['CUT TO:', 'SMASH CUT TO:', 'FADE TO:', 'DISSOLVE TO:'])(
    'promotes when text is %p',
    (text) => {
      expect(canPromoteToTransition(inAction, text)).toBe(true);
    },
  );

  it('does NOT promote lowercase "cut to:" (uppercase-only match)', () => {
    expect(canPromoteToTransition(inAction, 'cut to:')).toBe(false);
  });

  it('does NOT promote mid-sentence "...cut to:" without starting at a letter', () => {
    expect(canPromoteToTransition(inAction, '...CUT TO:')).toBe(false);
  });

  it('does NOT promote forced blocks', () => {
    const forced = { ...inAction, forced: true };
    expect(canPromoteToTransition(forced, 'CUT TO:')).toBe(false);
  });

  it('also allows promotion from a Character block (Final Draft parity)', () => {
    expect(
      canPromoteToTransition({ nodeName: NODE_NAMES.character, forced: false, contentSize: 6 }, 'CUT TO:'),
    ).toBe(true);
  });

  it('does NOT promote from Dialogue even for all-caps "CUT TO:"', () => {
    expect(
      canPromoteToTransition({ nodeName: NODE_NAMES.dialogue, forced: false, contentSize: 0 }, 'CUT TO:'),
    ).toBe(false);
  });
});

describe('canPromoteToParenthetical', () => {
  it('promotes only when Dialogue block is EMPTY', () => {
    expect(
      canPromoteToParenthetical({
        nodeName: NODE_NAMES.dialogue,
        forced: false,
        contentSize: 0,
      }),
    ).toBe(true);
  });

  it('does NOT promote mid-dialogue (contentSize > 0)', () => {
    expect(
      canPromoteToParenthetical({
        nodeName: NODE_NAMES.dialogue,
        forced: false,
        contentSize: 5,
      }),
    ).toBe(false);
  });

  it('does NOT promote from non-dialogue blocks even when empty', () => {
    for (const nodeName of [
      NODE_NAMES.action,
      NODE_NAMES.character,
      NODE_NAMES.sceneHeading,
    ]) {
      expect(
        canPromoteToParenthetical({ nodeName, forced: false, contentSize: 0 }),
      ).toBe(false);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Handler trs — exercise the pm-inputrules handler directly
// ──────────────────────────────────────────────────────────────────────────

/**
 * Minimal schema mirroring the subset the handlers touch. Only attributes
 * we read (`forced`) are declared; others would be ignored.
 */
function buildTestSchema(): Schema {
  return new Schema({
    nodes: {
      doc: { content: 'block+' },
      text: { group: 'inline' },
      [NODE_NAMES.action]: {
        group: 'block',
        content: 'inline*',
        attrs: { forced: { default: false } },
      },
      [NODE_NAMES.sceneHeading]: {
        group: 'block',
        content: 'inline*',
        attrs: { forced: { default: false } },
      },
      [NODE_NAMES.transition]: {
        group: 'block',
        content: 'inline*',
        attrs: { forced: { default: false } },
      },
      [NODE_NAMES.character]: {
        group: 'block',
        content: 'inline*',
        attrs: { forced: { default: false } },
      },
      [NODE_NAMES.dialogue]: { group: 'block', content: 'inline*' },
      [NODE_NAMES.parenthetical]: { group: 'block', content: 'inline*' },
    },
  });
}

function stateWithOneBlock(
  schema: Schema,
  blockType: string,
  text: string,
  attrs: Record<string, unknown> = {},
): EditorState {
  const nodeAttrs =
    blockType in schema.nodes && 'forced' in (schema.nodes[blockType].spec.attrs ?? {})
      ? attrs
      : null;
  const node = schema.node(
    blockType,
    nodeAttrs,
    text ? [schema.text(text)] : [],
  );
  const doc = schema.node('doc', null, [node]);
  return EditorState.create({ schema, doc });
}

describe('sceneHeadingInputRule handler', () => {
  it('promotes an Action with "INT." to a Scene Heading and preserves the trigger space', () => {
    const schema = buildTestSchema();
    // Doc pre-trigger: "INT." in an Action block. Positions:
    //   0 = before action | 1 = start of "I" | 5 = after "." | 6 = after action
    const state = stateWithOneBlock(schema, NODE_NAMES.action, 'INT.');

    const match = SCENE_HEADING_TRIGGER.exec('INT. ') as RegExpMatchArray;
    // pm InputRule runner computes start = docPos - (match.length - triggerLen) = 5 - (5 - 1) = 1
    const tr = handleSceneHeadingPromotion(state, match, 1, 5);
    expect(tr).not.toBeNull();

    const newDoc = state.apply(tr!).doc;
    expect(newDoc.firstChild?.type.name).toBe(NODE_NAMES.sceneHeading);
    expect(newDoc.firstChild?.textContent).toBe('INT. ');
  });

  it('returns null when the block is forced action (! prefix)', () => {
    const schema = buildTestSchema();
    const state = stateWithOneBlock(schema, NODE_NAMES.action, 'INT.', { forced: true });
    const match = SCENE_HEADING_TRIGGER.exec('INT. ') as RegExpMatchArray;
    expect(handleSceneHeadingPromotion(state, match, 1, 5)).toBeNull();
  });

  it('returns null when the enclosing block is not Action', () => {
    const schema = buildTestSchema();
    const state = stateWithOneBlock(schema, NODE_NAMES.dialogue, 'INT.');
    const match = SCENE_HEADING_TRIGGER.exec('INT. ') as RegExpMatchArray;
    expect(handleSceneHeadingPromotion(state, match, 1, 5)).toBeNull();
  });
});

describe('transitionInputRule handler', () => {
  it('promotes an Action with "CUT TO" to a Transition and preserves the ":" trigger', () => {
    const schema = buildTestSchema();
    const state = stateWithOneBlock(schema, NODE_NAMES.action, 'CUT TO');

    const match = TRANSITION_TRIGGER.exec('CUT TO:') as RegExpMatchArray;
    const tr = handleTransitionPromotion(state, match, 1, 7);
    expect(tr).not.toBeNull();

    const newDoc = state.apply(tr!).doc;
    expect(newDoc.firstChild?.type.name).toBe(NODE_NAMES.transition);
    expect(newDoc.firstChild?.textContent).toBe('CUT TO:');
  });

  it('promotes from a Character block too', () => {
    const schema = buildTestSchema();
    const state = stateWithOneBlock(schema, NODE_NAMES.character, 'CUT TO');
    const match = TRANSITION_TRIGGER.exec('CUT TO:') as RegExpMatchArray;
    const tr = handleTransitionPromotion(state, match, 1, 7);
    expect(tr).not.toBeNull();
    expect(state.apply(tr!).doc.firstChild?.type.name).toBe(NODE_NAMES.transition);
  });

  it('returns null in a Dialogue block even with matching text', () => {
    const schema = buildTestSchema();
    const state = stateWithOneBlock(schema, NODE_NAMES.dialogue, 'CUT TO');
    const match = TRANSITION_TRIGGER.exec('CUT TO:') as RegExpMatchArray;
    expect(handleTransitionPromotion(state, match, 1, 7)).toBeNull();
  });
});

describe('parentheticalInputRule handler', () => {
  it('promotes an EMPTY Dialogue block to Parenthetical and swallows the "("', () => {
    const schema = buildTestSchema();
    const state = stateWithOneBlock(schema, NODE_NAMES.dialogue, '');

    const match = /^\($/.exec('(') as RegExpMatchArray;
    // pm runner: start = end = 1 (inside the empty dialogue block)
    const tr = handleParentheticalPromotion(state, match, 1, 1);
    expect(tr).not.toBeNull();

    const newDoc = state.apply(tr!).doc;
    expect(newDoc.firstChild?.type.name).toBe(NODE_NAMES.parenthetical);
    // Trigger was NOT inserted.
    expect(newDoc.firstChild?.textContent).toBe('');
  });

  it('returns null when the Dialogue already has content (mid-dialogue "(" stays literal)', () => {
    const schema = buildTestSchema();
    const state = stateWithOneBlock(schema, NODE_NAMES.dialogue, 'hello');
    const match = /^\($/.exec('(') as RegExpMatchArray;
    // start = end = 1 (cursor at start of "hello")
    expect(handleParentheticalPromotion(state, match, 1, 1)).toBeNull();
  });

  it('returns null when the block is not Dialogue', () => {
    const schema = buildTestSchema();
    const state = stateWithOneBlock(schema, NODE_NAMES.action, '');
    const match = /^\($/.exec('(') as RegExpMatchArray;
    expect(handleParentheticalPromotion(state, match, 1, 1)).toBeNull();
  });
});
