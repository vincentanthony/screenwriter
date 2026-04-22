import { ReactRenderer } from '@tiptap/react';
import type { Editor, Range } from '@tiptap/core';
import type { SuggestionOptions } from '@tiptap/suggestion';
import {
  SuggestionList,
  type SuggestionListHandle,
  type SuggestionListProps,
} from '@/features/editor-shell/SuggestionList';

/**
 * Glue layer between `@tiptap/suggestion`'s render lifecycle and our
 * React SuggestionList. Returns a `render` function suitable for
 * passing into the Suggestion plugin.
 *
 * Popup positioning:
 *   - Primary: the DOMRect of the plugin's own decoration element (what
 *     `props.clientRect()` returns). This tracks the matched text.
 *   - Fallback: when the match is a zero-width range (Stage A, where
 *     the scene heading block is empty), the decoration has no rendered
 *     DOM, so we compute the rect from `editor.view.coordsAtPos(range.from)`
 *     instead.
 *
 * The popup is a fixed-position <div> in document.body, so it escapes
 * any overflow: hidden containers. That simplifies positioning at the
 * cost of not scrolling with the editor — which is fine because typing
 * keeps the cursor visible, and onUpdate reruns positioning on every
 * keystroke.
 *
 * The accept path goes through the Suggestion plugin's `command`. We
 * NEVER auto-accept on blur or click-outside — the popup is destroyed
 * by onExit, not by a synthesized selection.
 */

export function createAutocompleteRender(): NonNullable<
  SuggestionOptions<string, string>['render']
> {
  return () => {
    let component: ReactRenderer<SuggestionListHandle, SuggestionListProps> | null = null;
    let popup: HTMLDivElement | null = null;

    const mount = () => {
      if (popup) return;
      popup = document.createElement('div');
      popup.dataset.swAutocompletePopup = 'true';
      popup.style.position = 'fixed';
      popup.style.zIndex = '50';
      popup.style.pointerEvents = 'auto';
      popup.style.visibility = 'hidden';
      document.body.appendChild(popup);
    };

    const reposition = (
      clientRect: (() => DOMRect | null) | null | undefined,
      editor: Editor,
      range: Range,
    ) => {
      if (!popup) return;
      let rect: DOMRect | null = null;
      if (clientRect) rect = clientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        // Fallback for empty-range matches (Stage A): anchor at the cursor.
        try {
          const coords = editor.view.coordsAtPos(range.from);
          rect = new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
        } catch {
          popup.style.visibility = 'hidden';
          return;
        }
      }
      popup.style.visibility = 'visible';
      popup.style.left = `${Math.round(rect.left)}px`;
      popup.style.top = `${Math.round(rect.bottom + 4)}px`;
    };

    return {
      onStart: (props) => {
        mount();
        component = new ReactRenderer<SuggestionListHandle, SuggestionListProps>(SuggestionList, {
          props: {
            items: props.items,
            onSelect: (item: string) => props.command(item),
          },
          editor: props.editor,
        });
        popup!.appendChild(component.element);
        reposition(props.clientRect, props.editor, props.range);
      },

      onUpdate: (props) => {
        if (!component) return;
        component.updateProps({
          items: props.items,
          onSelect: (item: string) => props.command(item),
        });
        reposition(props.clientRect, props.editor, props.range);
      },

      onKeyDown: (props) => {
        if (props.event.key === 'Escape') {
          // Let the suggestion plugin exit naturally by swallowing the
          // key — but also tear down locally in case the host plugin
          // doesn't fire onExit synchronously.
          teardown();
          return true;
        }
        return component?.ref?.onKeyDown(props.event) ?? false;
      },

      onExit: () => {
        teardown();
      },
    };

    function teardown() {
      component?.destroy();
      component = null;
      popup?.remove();
      popup = null;
    }
  };
}
