import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { applyCharacterUppercase } from './characterUppercase';
import { parse } from '@/fountain/parse';
import { serialize } from '@/fountain/serialize';
import { docToScreenplay } from '@/editor/serialization/fromTiptap';
import type { TipTapDoc } from '@/editor/serialization/types';

/**
 * Build a minimal ProseMirror schema containing just the nodes this test
 * needs. Avoids the overhead of standing up a full TipTap Editor (which
 * wants a DOM host and a real editor element).
 */
function buildTestSchema(): Schema {
  return new Schema({
    nodes: {
      doc: { content: 'block+' },
      text: { group: 'inline' },
      [NODE_NAMES.character]: {
        group: 'block',
        content: 'inline*',
        attrs: { forced: { default: false }, dual: { default: false } },
      },
      [NODE_NAMES.dialogue]: {
        group: 'block',
        content: 'inline*',
      },
      [NODE_NAMES.action]: {
        group: 'block',
        content: 'inline*',
      },
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
    blocks.map((b) =>
      schema.node(
        b.type,
        b.type === NODE_NAMES.character ? { forced: !!b.forced, dual: false } : null,
        b.text ? [schema.text(b.text)] : [],
      ),
    ),
  );
}

describe('applyCharacterUppercase — in-document transformation', () => {
  it('uppercases a lowercase non-forced character', () => {
    const schema = buildTestSchema();
    const doc = docFrom(schema, [
      { type: NODE_NAMES.character, text: 'alice' },
      { type: NODE_NAMES.dialogue, text: 'hello.' },
    ]);

    const state = EditorState.create({ schema, doc });
    const tr = state.tr;
    const changed = applyCharacterUppercase(state.doc, tr, schema);
    expect(changed).toBe(true);

    const newState = state.apply(tr);
    expect(newState.doc.firstChild?.textContent).toBe('ALICE');
    // Dialogue untouched.
    expect(newState.doc.child(1).textContent).toBe('hello.');
  });

  it('preserves mixed-case text on a FORCED character (@name)', () => {
    const schema = buildTestSchema();
    const doc = docFrom(schema, [
      { type: NODE_NAMES.character, text: 'alice', forced: true },
      { type: NODE_NAMES.dialogue, text: 'hi.' },
    ]);

    const state = EditorState.create({ schema, doc });
    const tr = state.tr;
    expect(applyCharacterUppercase(state.doc, tr, schema)).toBe(false);

    const newState = state.apply(tr);
    expect(newState.doc.firstChild?.textContent).toBe('alice');
  });

  it('is a no-op when text is already uppercase', () => {
    const schema = buildTestSchema();
    const doc = docFrom(schema, [
      { type: NODE_NAMES.character, text: 'BOB' },
    ]);

    const state = EditorState.create({ schema, doc });
    const tr = state.tr;
    expect(applyCharacterUppercase(state.doc, tr, schema)).toBe(false);
  });

  it('uppercases multiple character blocks in one pass', () => {
    const schema = buildTestSchema();
    const doc = docFrom(schema, [
      { type: NODE_NAMES.character, text: 'alice' },
      { type: NODE_NAMES.dialogue, text: 'one' },
      { type: NODE_NAMES.character, text: 'bOb' },
      { type: NODE_NAMES.dialogue, text: 'two' },
    ]);

    const state = EditorState.create({ schema, doc });
    const tr = state.tr;
    expect(applyCharacterUppercase(state.doc, tr, schema)).toBe(true);

    const newState = state.apply(tr);
    expect(newState.doc.child(0).textContent).toBe('ALICE');
    expect(newState.doc.child(2).textContent).toBe('BOB');
  });

  it('does not touch non-Character nodes even when they are lowercase', () => {
    const schema = buildTestSchema();
    const doc = docFrom(schema, [
      { type: NODE_NAMES.action, text: 'she whispers softly.' },
      { type: NODE_NAMES.dialogue, text: 'whatever.' },
    ]);

    const state = EditorState.create({ schema, doc });
    const tr = state.tr;
    expect(applyCharacterUppercase(state.doc, tr, schema)).toBe(false);
  });

  it('ignores an empty Character node (avoids schema-empty-text crash)', () => {
    const schema = buildTestSchema();
    const doc = docFrom(schema, [{ type: NODE_NAMES.character, text: '' }]);

    const state = EditorState.create({ schema, doc });
    const tr = state.tr;
    expect(() => applyCharacterUppercase(state.doc, tr, schema)).not.toThrow();
  });
});

describe('applyCharacterUppercase — end-to-end through the serializer', () => {
  it('a lowercase typed character round-trips as UPPERCASE in Fountain', () => {
    const schema = buildTestSchema();
    const doc = docFrom(schema, [
      { type: NODE_NAMES.character, text: 'alice' },
      { type: NODE_NAMES.dialogue, text: 'hi.' },
    ]);

    const state = EditorState.create({ schema, doc });
    const tr = state.tr;
    applyCharacterUppercase(state.doc, tr, schema);
    const finalDoc = state.apply(tr).doc;

    // Shape into the minimal JSON our bridge consumes.
    const json: TipTapDoc = {
      type: 'doc',
      content: finalDoc.content.content.map((node) => ({
        type: node.type.name,
        attrs: node.attrs,
        content: node.textContent
          ? [{ type: 'text' as const, text: node.textContent }]
          : [],
      })),
    };

    const elements = docToScreenplay(json, null);
    expect(serialize(elements)).toBe('ALICE\nhi.\n');
    // Re-parse and confirm idempotency.
    expect(serialize(parse(serialize(elements)))).toBe('ALICE\nhi.\n');
  });

  it('a lowercase FORCED character (@alice) stays lowercase through the serializer', () => {
    const schema = buildTestSchema();
    const doc = docFrom(schema, [
      { type: NODE_NAMES.character, text: 'alice', forced: true },
      { type: NODE_NAMES.dialogue, text: 'hi.' },
    ]);

    const state = EditorState.create({ schema, doc });
    const tr = state.tr;
    applyCharacterUppercase(state.doc, tr, schema);
    const finalDoc = state.apply(tr).doc;

    const json: TipTapDoc = {
      type: 'doc',
      content: finalDoc.content.content.map((node) => ({
        type: node.type.name,
        attrs: node.attrs,
        content: node.textContent
          ? [{ type: 'text' as const, text: node.textContent }]
          : [],
      })),
    };

    const elements = docToScreenplay(json, null);
    expect(serialize(elements)).toBe('@alice\nhi.\n');
  });
});
