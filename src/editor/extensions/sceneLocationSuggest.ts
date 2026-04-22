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
 * Stage B — Scene location autocomplete.
 *
 * Active inside a Scene Heading block once the user has typed a
 * recognized prefix + whitespace (e.g. "INT. ", "EXT. "). Filters the
 * location set from the current doc by what the user has typed after
 * the prefix; accept replaces the post-prefix text with the full
 * location, leaving the prefix intact.
 *
 * Stage C (time-of-day tokens after a second " - ") is not wired in
 * this commit — see the commit message. The trigger to swap dictionaries
 * would land on top of this same findSuggestionMatch.
 */

export const SCENE_LOCATION_PLUGIN_KEY = new PluginKey('sceneLocationSuggest');

/**
 * Regex matching any natural scene prefix followed by one-or-more
 * spaces. Captures the prefix so we can measure where the post-prefix
 * text begins.
 */
const SCENE_PREFIX_WITH_SPACE =
  /^(INT\.\/EXT\.|EXT\.\/INT\.|I\/E\.|INT\.|EXT\.|EST\.)\s+/i;

export function isSceneLocationMatch($position: ResolvedPos): {
  range: Range;
  query: string;
  text: string;
} | null {
  if ($position.parent.type.name !== NODE_NAMES.sceneHeading) return null;
  const block = $position.parent;
  const text = block.textContent;
  const match = SCENE_PREFIX_WITH_SPACE.exec(text);
  if (!match) return null;

  const prefixLen = match[0].length;
  const blockStart = $position.start();
  const afterPrefix = blockStart + prefixLen;
  const blockEnd = blockStart + block.content.size;

  // Active when cursor is within or after the post-prefix region.
  if ($position.pos < afterPrefix) return null;

  return {
    range: { from: afterPrefix, to: blockEnd },
    query: text.slice(prefixLen),
    text,
  };
}

function locationItems(editor: Editor, query: string): string[] {
  const json = editor.getJSON() as unknown as TipTapDoc;
  const elements = docToScreenplay(json, null);
  const { locations } = extractAutocompleteSets(elements);
  const q = query.trim().toUpperCase();
  const pool = q.length > 0 ? locations.filter((loc) => loc.startsWith(q)) : locations;
  // Don't suggest verbatim what the user already has.
  return pool.filter((loc) => loc !== q);
}

export const SceneLocationSuggest = Extension.create({
  name: 'sceneLocationSuggest',

  addProseMirrorPlugins() {
    const options: SuggestionOptions<string, string> = {
      pluginKey: SCENE_LOCATION_PLUGIN_KEY,
      editor: this.editor,
      decorationClass: 'sw-autocomplete-decoration',
      findSuggestionMatch: ({ $position }) => isSceneLocationMatch($position),
      items: ({ query, editor }) => locationItems(editor, query),
      command: ({ editor, range, props }) => {
        // Replace the post-prefix text with the full location. The
        // prefix (and its trailing space) is preserved because `range`
        // starts after it.
        editor.chain().focus().insertContentAt(range, props).run();
      },
      render: createAutocompleteRender(),
    };
    return [Suggestion(options)];
  },
});
