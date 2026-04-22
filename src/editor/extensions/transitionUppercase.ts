import { Extension } from '@tiptap/core';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';

/**
 * Transition Uppercase — the third sibling of CharacterUppercase and
 * SceneHeadingUppercase. Uppercases the text content of any non-forced
 * Transition node in the document.
 *
 * Why it matters: the LivePromotions rule fires on lowercase "cut to:",
 * "fade to:", etc. (case-insensitive by design — writers type in flow).
 * This plugin then normalizes the display text to uppercase in the doc
 * itself, matching Final Draft behavior. Forced transitions (`> Fade Out.`)
 * carry `attrs.forced = true` and bypass uppercasing so they can preserve
 * their atmospheric mixed-case styling.
 *
 * Belt-and-suspenders: the serializer ALSO uppercases non-forced
 * transitions on write, so a plugin misfire never corrupts the Fountain
 * source.
 */

export function applyTransitionUppercase(
  doc: PMNode,
  tr: Transaction,
  schema: Schema,
): boolean {
  let changed = false;

  doc.descendants((node, pos) => {
    if (node.type.name !== NODE_NAMES.transition) return;
    if (node.attrs.forced) return;
    const text = node.textContent;
    if (text.length === 0) return;
    const upper = text.toUpperCase();
    if (text === upper) return;

    const mapped = tr.mapping.map(pos + 1);
    const mappedEnd = tr.mapping.map(pos + 1 + node.content.size);
    tr.replaceWith(mapped, mappedEnd, schema.text(upper));
    changed = true;
  });

  return changed;
}

export const TRANSITION_UPPERCASE_PLUGIN_KEY = new PluginKey('transitionUppercase');

export const TransitionUppercase = Extension.create({
  name: 'transitionUppercase',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: TRANSITION_UPPERCASE_PLUGIN_KEY,
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((t) => t.docChanged)) return null;
          const tr = newState.tr;
          const changed = applyTransitionUppercase(newState.doc, tr, newState.schema);
          return changed ? tr : null;
        },
      }),
    ];
  },
});
