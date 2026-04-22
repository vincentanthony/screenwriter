import { Extension } from '@tiptap/core';
import type { Range } from '@tiptap/core';
import type { ResolvedPos } from '@tiptap/pm/model';
import { PluginKey } from '@tiptap/pm/state';
import { Suggestion, type SuggestionOptions } from '@tiptap/suggestion';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { SCENE_HEADING_PREFIXES } from '@/editor/autocomplete';
import { createAutocompleteRender } from './autocompleteRender';

/**
 * Stage A — Scene Heading prefix picker.
 *
 * Active while the Scene Heading block is EMPTY. Offers INT. / EXT. /
 * I/E. as a static dropdown. Accepting inserts "PREFIX " (with trailing
 * space) so the cursor lands ready for the location, handing off
 * silently to Stage B (sceneLocationSuggest) on the next keystroke.
 *
 * The instant the block has ANY content, this suggestion deactivates.
 * Partial prefixes like "IN" fall into a no-dropdown gap until the user
 * finishes the prefix + space — matches the plan's explicit two-state
 * model.
 */

export const SCENE_PREFIX_PLUGIN_KEY = new PluginKey('scenePrefixSuggest');

export function isScenePrefixMatch($position: ResolvedPos): {
  range: Range;
  query: string;
  text: string;
} | null {
  if ($position.parent.type.name !== NODE_NAMES.sceneHeading) return null;
  if ($position.parent.content.size !== 0) return null;
  const pos = $position.pos;
  return { range: { from: pos, to: pos }, query: '', text: '' };
}

export const ScenePrefixSuggest = Extension.create({
  name: 'scenePrefixSuggest',

  addProseMirrorPlugins() {
    const options: SuggestionOptions<string, string> = {
      pluginKey: SCENE_PREFIX_PLUGIN_KEY,
      editor: this.editor,
      decorationClass: 'sw-autocomplete-decoration',
      findSuggestionMatch: ({ $position }) => isScenePrefixMatch($position),
      items: () => [...SCENE_HEADING_PREFIXES],
      command: ({ editor, range, props }) => {
        // Insert `PREFIX ` (trailing space) so the user is immediately
        // in Stage B's "location" zone.
        editor.chain().focus().insertContentAt(range, `${props} `).run();
      },
      render: createAutocompleteRender(),
    };
    return [Suggestion(options)];
  },
});
