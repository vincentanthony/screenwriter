import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { applySceneHeadingUppercase } from './sceneHeadingUppercase';

function buildTestSchema(): Schema {
  return new Schema({
    nodes: {
      doc: { content: 'block+' },
      text: { group: 'inline' },
      [NODE_NAMES.sceneHeading]: {
        group: 'block',
        content: 'inline*',
        attrs: { forced: { default: false } },
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
        b.type === NODE_NAMES.sceneHeading ? { forced: !!b.forced } : null,
        b.text ? [schema.text(b.text)] : [],
      ),
    ),
  );
}

describe('applySceneHeadingUppercase', () => {
  it('uppercases a lowercase non-forced scene heading', () => {
    const schema = buildTestSchema();
    const doc = docFrom(schema, [
      { type: NODE_NAMES.sceneHeading, text: 'int. coffee shop - day' },
    ]);

    const state = EditorState.create({ schema, doc });
    const tr = state.tr;
    expect(applySceneHeadingUppercase(state.doc, tr, schema)).toBe(true);
    expect(state.apply(tr).doc.firstChild?.textContent).toBe('INT. COFFEE SHOP - DAY');
  });

  it('preserves mixed-case text on a FORCED scene heading (.slug)', () => {
    const schema = buildTestSchema();
    const doc = docFrom(schema, [
      { type: NODE_NAMES.sceneHeading, text: 'Dreamscape - Limbo', forced: true },
    ]);

    const state = EditorState.create({ schema, doc });
    const tr = state.tr;
    expect(applySceneHeadingUppercase(state.doc, tr, schema)).toBe(false);
    expect(state.apply(tr).doc.firstChild?.textContent).toBe('Dreamscape - Limbo');
  });

  it('is a no-op when text is already uppercase', () => {
    const schema = buildTestSchema();
    const doc = docFrom(schema, [
      { type: NODE_NAMES.sceneHeading, text: 'EXT. STREET - NIGHT' },
    ]);

    const state = EditorState.create({ schema, doc });
    const tr = state.tr;
    expect(applySceneHeadingUppercase(state.doc, tr, schema)).toBe(false);
  });

  it('leaves non-scene-heading nodes alone', () => {
    const schema = buildTestSchema();
    const doc = docFrom(schema, [{ type: NODE_NAMES.action, text: 'she whispers.' }]);

    const state = EditorState.create({ schema, doc });
    const tr = state.tr;
    expect(applySceneHeadingUppercase(state.doc, tr, schema)).toBe(false);
  });

  it('uppercases multiple scene heading blocks in one pass', () => {
    const schema = buildTestSchema();
    const doc = docFrom(schema, [
      { type: NODE_NAMES.sceneHeading, text: 'int. a' },
      { type: NODE_NAMES.action, text: 'filler' },
      { type: NODE_NAMES.sceneHeading, text: 'ext. b' },
    ]);

    const state = EditorState.create({ schema, doc });
    const tr = state.tr;
    expect(applySceneHeadingUppercase(state.doc, tr, schema)).toBe(true);

    const result = state.apply(tr).doc;
    expect(result.child(0).textContent).toBe('INT. A');
    expect(result.child(1).textContent).toBe('filler');
    expect(result.child(2).textContent).toBe('EXT. B');
  });

  it('ignores empty scene heading nodes (avoids schema-empty-text crash)', () => {
    const schema = buildTestSchema();
    const doc = docFrom(schema, [{ type: NODE_NAMES.sceneHeading, text: '' }]);

    const state = EditorState.create({ schema, doc });
    const tr = state.tr;
    expect(() => applySceneHeadingUppercase(state.doc, tr, schema)).not.toThrow();
    expect(applySceneHeadingUppercase(state.doc, tr, schema)).toBe(false);
  });
});
