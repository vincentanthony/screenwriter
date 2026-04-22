import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { applyTransitionUppercase } from './transitionUppercase';
import { handleTransitionPromotion, TRANSITION_TRIGGER } from './livePromotions';
import { parse } from '@/fountain/parse';
import { normalize, serialize } from '@/fountain/serialize';

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
      [NODE_NAMES.transition]: {
        group: 'block',
        content: 'inline*',
        attrs: { forced: { default: false } },
      },
      [NODE_NAMES.dialogue]: { group: 'block', content: 'inline*' },
    },
  });
}

function docFrom(
  schema: Schema,
  blocks: { type: string; text?: string; forced?: boolean }[],
) {
  return schema.node(
    'doc',
    null,
    blocks.map((b) => {
      const hasForcedAttr =
        b.type === NODE_NAMES.transition || b.type === NODE_NAMES.action;
      return schema.node(
        b.type,
        hasForcedAttr ? { forced: !!b.forced } : null,
        b.text ? [schema.text(b.text)] : [],
      );
    }),
  );
}

describe('applyTransitionUppercase — plugin behavior', () => {
  it('uppercases a lowercase non-forced transition', () => {
    const schema = buildTestSchema();
    const doc = docFrom(schema, [{ type: NODE_NAMES.transition, text: 'cut to:' }]);
    const state = EditorState.create({ schema, doc });
    const tr = state.tr;
    expect(applyTransitionUppercase(state.doc, tr, schema)).toBe(true);
    expect(state.apply(tr).doc.firstChild?.textContent).toBe('CUT TO:');
  });

  it('uppercases other common transitions: fade to:, dissolve to:, smash cut to:', () => {
    const schema = buildTestSchema();
    for (const [input, expected] of [
      ['fade to:', 'FADE TO:'],
      ['dissolve to:', 'DISSOLVE TO:'],
      ['smash cut to:', 'SMASH CUT TO:'],
      ['MATCH cut TO:', 'MATCH CUT TO:'],
    ] as const) {
      const doc = docFrom(schema, [{ type: NODE_NAMES.transition, text: input }]);
      const state = EditorState.create({ schema, doc });
      const tr = state.tr;
      expect(applyTransitionUppercase(state.doc, tr, schema)).toBe(true);
      expect(state.apply(tr).doc.firstChild?.textContent).toBe(expected);
    }
  });

  it('preserves mixed case on a FORCED transition (> prefix)', () => {
    const schema = buildTestSchema();
    const doc = docFrom(schema, [
      { type: NODE_NAMES.transition, text: 'Slow Dissolve.', forced: true },
    ]);
    const state = EditorState.create({ schema, doc });
    const tr = state.tr;
    expect(applyTransitionUppercase(state.doc, tr, schema)).toBe(false);
    expect(state.apply(tr).doc.firstChild?.textContent).toBe('Slow Dissolve.');
  });

  it('is a no-op when text is already uppercase', () => {
    const schema = buildTestSchema();
    const doc = docFrom(schema, [{ type: NODE_NAMES.transition, text: 'CUT TO:' }]);
    const state = EditorState.create({ schema, doc });
    expect(applyTransitionUppercase(state.doc, state.tr, schema)).toBe(false);
  });

  it('leaves non-transition nodes alone', () => {
    const schema = buildTestSchema();
    const doc = docFrom(schema, [{ type: NODE_NAMES.action, text: 'she whispers.' }]);
    const state = EditorState.create({ schema, doc });
    expect(applyTransitionUppercase(state.doc, state.tr, schema)).toBe(false);
  });

  it('ignores empty transition nodes (avoids schema-empty-text crash)', () => {
    const schema = buildTestSchema();
    const doc = docFrom(schema, [{ type: NODE_NAMES.transition, text: '' }]);
    const state = EditorState.create({ schema, doc });
    expect(() => applyTransitionUppercase(state.doc, state.tr, schema)).not.toThrow();
  });
});

describe('end-to-end: lowercase Action → promoted + uppercased Transition', () => {
  // Simulates what ProseMirror does when the user types `cut to:` in an
  // Action block: the InputRule handler fires first (promotion, case
  // preserved); the TransitionUppercase plugin then runs in a follow-up
  // appendTransaction pass to normalize the casing in the document.
  it('cut to: → promotes + uppercases to CUT TO:', () => {
    const schema = buildTestSchema();
    const actionDoc = docFrom(schema, [{ type: NODE_NAMES.action, text: 'cut to' }]);
    const state = EditorState.create({ schema, doc: actionDoc });

    const match = TRANSITION_TRIGGER.exec('cut to:') as RegExpMatchArray;
    const tr1 = handleTransitionPromotion(state, match, 1, 7);
    expect(tr1).not.toBeNull();
    const afterPromote = state.apply(tr1!);
    expect(afterPromote.doc.firstChild?.type.name).toBe(NODE_NAMES.transition);
    expect(afterPromote.doc.firstChild?.textContent).toBe('cut to:');

    const tr2 = afterPromote.tr;
    expect(applyTransitionUppercase(afterPromote.doc, tr2, schema)).toBe(true);
    const afterUpper = afterPromote.apply(tr2);
    expect(afterUpper.doc.firstChild?.textContent).toBe('CUT TO:');
  });

  it('fade to: → promotes + uppercases to FADE TO:', () => {
    const schema = buildTestSchema();
    const actionDoc = docFrom(schema, [{ type: NODE_NAMES.action, text: 'fade to' }]);
    const state = EditorState.create({ schema, doc: actionDoc });

    const match = TRANSITION_TRIGGER.exec('fade to:') as RegExpMatchArray;
    const tr1 = handleTransitionPromotion(state, match, 1, 8);
    const afterPromote = state.apply(tr1!);
    const tr2 = afterPromote.tr;
    applyTransitionUppercase(afterPromote.doc, tr2, schema);
    const afterUpper = afterPromote.apply(tr2);
    expect(afterUpper.doc.firstChild?.type.name).toBe(NODE_NAMES.transition);
    expect(afterUpper.doc.firstChild?.textContent).toBe('FADE TO:');
  });

  it('dissolve to: → promotes + uppercases to DISSOLVE TO:', () => {
    const schema = buildTestSchema();
    const actionDoc = docFrom(schema, [{ type: NODE_NAMES.action, text: 'dissolve to' }]);
    const state = EditorState.create({ schema, doc: actionDoc });

    const match = TRANSITION_TRIGGER.exec('dissolve to:') as RegExpMatchArray;
    const tr1 = handleTransitionPromotion(state, match, 1, 12);
    const afterPromote = state.apply(tr1!);
    const tr2 = afterPromote.tr;
    applyTransitionUppercase(afterPromote.doc, tr2, schema);
    const afterUpper = afterPromote.apply(tr2);
    expect(afterUpper.doc.firstChild?.textContent).toBe('DISSOLVE TO:');
  });
});

describe('Fountain round-trip stays intact after uppercasing', () => {
  it('CUT TO: survives parse → serialize unchanged', () => {
    const fountain = 'CUT TO:\n';
    expect(serialize(parse(fountain))).toBe(normalize(fountain));
  });

  it('lowercase transition emits uppercase Fountain (serializer belt-and-suspenders)', () => {
    expect(serialize([{ type: 'transition', text: 'cut to:' }])).toBe('CUT TO:\n');
  });

  it('forced transition "> Slow Dissolve." round-trips with mixed case preserved', () => {
    const fountain = '> Slow Dissolve.\n';
    expect(serialize(parse(fountain))).toBe(normalize(fountain));
  });
});
