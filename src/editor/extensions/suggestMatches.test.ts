import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { isCharacterSuggestMatch } from './characterSuggest';
import { isScenePrefixMatch } from './scenePrefixSuggest';
import { isSceneLocationMatch } from './sceneLocationSuggest';

/**
 * Predicate tests for the three Suggestion `findSuggestionMatch`
 * functions. Builds minimal ProseMirror schemas and resolves a cursor
 * position inside a constructed doc, then asserts each predicate's
 * active/inactive decision and the range+query it reports.
 *
 * The visual popup itself (keyboard nav, React renderer, positioning)
 * requires a real browser to verify and is flagged as manual-QA-only
 * in the Block 2 commit message.
 */

function buildSchema(): Schema {
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
      [NODE_NAMES.character]: {
        group: 'block',
        content: 'inline*',
        attrs: { forced: { default: false }, dual: { default: false } },
      },
      [NODE_NAMES.dialogue]: { group: 'block', content: 'inline*' },
    },
  });
}

function resolveAtEndOf(schema: Schema, blockType: string, text: string, attrs?: Record<string, unknown>) {
  const node = schema.node(
    blockType,
    attrs ?? null,
    text.length > 0 ? [schema.text(text)] : [],
  );
  const doc = schema.node('doc', null, [node]);
  // Position at end of the single block's content: 1 (inside) + text.length
  const pos = 1 + text.length;
  return doc.resolve(pos);
}

describe('isScenePrefixMatch', () => {
  it('matches an empty Scene Heading block with zero-width range', () => {
    const schema = buildSchema();
    const $pos = resolveAtEndOf(schema, NODE_NAMES.sceneHeading, '', { forced: false });
    const match = isScenePrefixMatch($pos);
    expect(match).not.toBeNull();
    expect(match!.query).toBe('');
    expect(match!.text).toBe('');
    expect(match!.range.from).toBe(match!.range.to);
  });

  it('does NOT match once the Scene Heading has any content', () => {
    const schema = buildSchema();
    const $pos = resolveAtEndOf(schema, NODE_NAMES.sceneHeading, 'I', { forced: false });
    expect(isScenePrefixMatch($pos)).toBeNull();
  });

  it('does NOT match outside a Scene Heading block', () => {
    const schema = buildSchema();
    const $pos = resolveAtEndOf(schema, NODE_NAMES.action, '');
    expect(isScenePrefixMatch($pos)).toBeNull();
  });
});

describe('isCharacterSuggestMatch', () => {
  it('matches a Character block with at least one character, range covers the whole block', () => {
    const schema = buildSchema();
    const $pos = resolveAtEndOf(schema, NODE_NAMES.character, 'AL', {
      forced: false,
      dual: false,
    });
    const match = isCharacterSuggestMatch($pos);
    expect(match).not.toBeNull();
    expect(match!.query).toBe('AL');
    expect(match!.range.from).toBe(1); // start of character content
    expect(match!.range.to).toBe(3); // end of "AL"
  });

  it('does NOT match an empty Character block', () => {
    const schema = buildSchema();
    const $pos = resolveAtEndOf(schema, NODE_NAMES.character, '', {
      forced: false,
      dual: false,
    });
    expect(isCharacterSuggestMatch($pos)).toBeNull();
  });

  it('does NOT match outside a Character block', () => {
    const schema = buildSchema();
    const $pos = resolveAtEndOf(schema, NODE_NAMES.dialogue, 'hi');
    expect(isCharacterSuggestMatch($pos)).toBeNull();
  });
});

describe('isSceneLocationMatch', () => {
  it('matches after a prefix + space with an empty query', () => {
    const schema = buildSchema();
    const $pos = resolveAtEndOf(schema, NODE_NAMES.sceneHeading, 'INT. ', { forced: false });
    const match = isSceneLocationMatch($pos);
    expect(match).not.toBeNull();
    expect(match!.query).toBe('');
    expect(match!.text).toBe('INT. ');
    expect(match!.range.from).toBe(1 + 'INT. '.length);
  });

  it('matches after a prefix + partial location text (query = post-prefix text)', () => {
    const schema = buildSchema();
    const $pos = resolveAtEndOf(schema, NODE_NAMES.sceneHeading, 'EXT. BEA', { forced: false });
    const match = isSceneLocationMatch($pos);
    expect(match).not.toBeNull();
    expect(match!.query).toBe('BEA');
    expect(match!.range.from).toBe(1 + 'EXT. '.length);
    expect(match!.range.to).toBe(1 + 'EXT. BEA'.length);
  });

  it('accepts all the canonical prefix variants case-insensitively', () => {
    const schema = buildSchema();
    for (const prefix of ['INT.', 'EXT.', 'EST.', 'I/E.', 'INT./EXT.', 'EXT./INT.', 'int.', 'ext.']) {
      const $pos = resolveAtEndOf(schema, NODE_NAMES.sceneHeading, `${prefix} `, {
        forced: false,
      });
      expect(isSceneLocationMatch($pos), prefix).not.toBeNull();
    }
  });

  it('does NOT match before a prefix is complete', () => {
    const schema = buildSchema();
    const $pos = resolveAtEndOf(schema, NODE_NAMES.sceneHeading, 'INT', { forced: false });
    expect(isSceneLocationMatch($pos)).toBeNull();
  });

  it('does NOT match an empty Scene Heading block (Stage A territory)', () => {
    const schema = buildSchema();
    const $pos = resolveAtEndOf(schema, NODE_NAMES.sceneHeading, '', { forced: false });
    expect(isSceneLocationMatch($pos)).toBeNull();
  });

  it('does NOT match outside a Scene Heading block', () => {
    const schema = buildSchema();
    const $pos = resolveAtEndOf(schema, NODE_NAMES.action, 'INT. COFFEE');
    expect(isSceneLocationMatch($pos)).toBeNull();
  });
});
