import { Extension } from '@tiptap/core';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';

/**
 * Scene Heading Uppercase — the same appendTransaction dance the
 * CharacterUppercase plugin does, but for Scene Heading blocks.
 *
 * Natural scene headings must be ALL CAPS for Fountain to re-parse them
 * (e.g. `INT. COFFEE SHOP - DAY`). Forced scene headings (`.Dreamscape`)
 * are explicitly mixed-case atmospheric slugs and bypass this rule.
 *
 * Belt-and-suspenders: the serializer ALSO uppercases non-forced scene
 * text, so a plugin misfire never corrupts the Fountain source.
 */

export function applySceneHeadingUppercase(
  doc: PMNode,
  tr: Transaction,
  schema: Schema,
): boolean {
  let changed = false;

  doc.descendants((node, pos) => {
    if (node.type.name !== NODE_NAMES.sceneHeading) return;
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

export const SCENE_HEADING_UPPERCASE_PLUGIN_KEY = new PluginKey('sceneHeadingUppercase');

export const SceneHeadingUppercase = Extension.create({
  name: 'sceneHeadingUppercase',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: SCENE_HEADING_UPPERCASE_PLUGIN_KEY,
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((t) => t.docChanged)) return null;
          const tr = newState.tr;
          const changed = applySceneHeadingUppercase(newState.doc, tr, newState.schema);
          return changed ? tr : null;
        },
      }),
    ];
  },
});
