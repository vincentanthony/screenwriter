import { Extension } from '@tiptap/core';
import type { Editor, Range } from '@tiptap/core';
import type { ResolvedPos } from '@tiptap/pm/model';
import { PluginKey } from '@tiptap/pm/state';
import { Suggestion, type SuggestionOptions } from '@tiptap/suggestion';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { extractAutocompleteSets } from '@/editor/autocomplete';
import type { TipTapDoc } from '@/editor/serialization/types';
import { docToScreenplay } from '@/editor/serialization/fromTiptap';
import { createAutocompleteRender } from './autocompleteRender';

/**
 * Character-name autocomplete. Active whenever the cursor is inside a
 * Character block that has at least one character of text.
 *
 * Filter: case-insensitive prefix match against the set of distinct
 * character names already in the document. Accepting replaces the
 * entire block content with the selected name and moves the cursor to
 * the end.
 *
 * Hide when there are zero matches — the popup never shows an empty
 * list, per the plan's UX contract.
 */

export const CHARACTER_SUGGEST_PLUGIN_KEY = new PluginKey('characterSuggest');

export function isCharacterSuggestMatch($position: ResolvedPos): {
  range: Range;
  query: string;
  text: string;
} | null {
  if ($position.parent.type.name !== NODE_NAMES.character) return null;
  const block = $position.parent;
  if (block.content.size === 0) return null;
  const blockStart = $position.start();
  const blockEnd = blockStart + block.content.size;
  const text = block.textContent;
  return { range: { from: blockStart, to: blockEnd }, query: text, text };
}

function characterItems(editor: Editor, query: string): string[] {
  const json = editor.getJSON() as unknown as TipTapDoc;
  const elements = docToScreenplay(json, null);
  const { characters } = extractAutocompleteSets(elements);
  const q = query.trim().toUpperCase();
  const pool = q.length > 0 ? characters.filter((c) => c.startsWith(q)) : characters;
  // Don't suggest the name the user is currently typing verbatim.
  return pool.filter((c) => c !== q);
}

export const CharacterSuggest = Extension.create({
  name: 'characterSuggest',

  addProseMirrorPlugins() {
    const options: SuggestionOptions<string, string> = {
      pluginKey: CHARACTER_SUGGEST_PLUGIN_KEY,
      editor: this.editor,
      decorationClass: 'sw-autocomplete-decoration',
      findSuggestionMatch: ({ $position }) => isCharacterSuggestMatch($position),
      items: ({ query, editor }) => characterItems(editor, query),
      command: ({ editor, range, props }) => {
        // Replace the whole Character block text with the chosen name.
        editor.chain().focus().insertContentAt(range, props).run();
      },
      render: createAutocompleteRender(),
    };
    return [Suggestion(options)];
  },
});
