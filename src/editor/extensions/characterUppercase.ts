import { Extension } from '@tiptap/core';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';

/**
 * Character Uppercase — enforces that non-forced Character node text is
 * stored UPPERCASE in the ProseMirror document, not merely rendered that
 * way via CSS.
 *
 * Why it matters: Fountain requires character names to be all-caps in
 * order to re-parse as characters on reload (the forced `@name` syntax is
 * the only way to preserve mixed case). If we relied on CSS alone, the
 * underlying document would carry whatever the user typed and the
 * Fountain source of truth could drift.
 *
 * Belt-and-suspenders: the Fountain serializer ALSO uppercases non-forced
 * character text, so even if this plugin is buggy, the persisted file is
 * canonical. This plugin exists for live-editing UX consistency.
 */

/**
 * Walk the doc, find non-forced Character nodes whose text isn't already
 * uppercase, and queue replacement transactions onto `tr`. Returns whether
 * any changes were queued.
 *
 * Pure function: no Editor dependency, testable with a minimal Prosemirror
 * schema. Called by both the appendTransaction plugin below and tests.
 */
export function applyCharacterUppercase(
  doc: PMNode,
  tr: Transaction,
  schema: Schema,
): boolean {
  let changed = false;

  doc.descendants((node, pos) => {
    if (node.type.name !== NODE_NAMES.character) return;
    if (node.attrs.forced) return;
    const text = node.textContent;
    if (text.length === 0) return;
    const upper = text.toUpperCase();
    if (text === upper) return;

    // Replace the node's inline content wholesale. Character is a single-line
    // node so we don't need to preserve hardBreaks or anything richer.
    const mapped = tr.mapping.map(pos + 1);
    const mappedEnd = tr.mapping.map(pos + 1 + node.content.size);
    tr.replaceWith(mapped, mappedEnd, schema.text(upper));
    changed = true;
  });

  return changed;
}

export const CHARACTER_UPPERCASE_PLUGIN_KEY = new PluginKey('characterUppercase');

export const CharacterUppercase = Extension.create({
  name: 'characterUppercase',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: CHARACTER_UPPERCASE_PLUGIN_KEY,
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((t) => t.docChanged)) return null;
          const tr = newState.tr;
          const changed = applyCharacterUppercase(newState.doc, tr, newState.schema);
          return changed ? tr : null;
        },
      }),
    ];
  },
});
