import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';

/**
 * Page break visual indicators, rendered as ProseMirror widget
 * decorations. Pure visual — the document itself is NEVER modified,
 * which is the only way to guarantee we don't leak page breaks into
 * the Fountain serialization.
 *
 * The plugin is stateful in a narrow sense: it holds a list of doc
 * positions at which to render a break, plus the DecorationSet
 * derived from them. Positions are updated by meta messages
 * dispatched from ScriptEditor after pagination finishes:
 *
 *   view.dispatch(
 *     view.state.tr.setMeta(PAGE_BREAK_PLUGIN_KEY, {
 *       type: 'update-positions', positions: [54, 198, 430, ...],
 *     })
 *   );
 *
 * Between updates, the plugin maps its positions forward through
 * every docChanged transaction so existing break markers stay
 * attached to the right blocks while the user types — the full
 * recompute via paginate() is debounced separately (100ms) in
 * ScriptEditor. During that debounce window the positions drift
 * slightly (only relative to actual page boundaries); the next
 * debounced recompute snaps them back.
 */

interface PluginState {
  positions: number[];
  set: DecorationSet;
}

interface UpdatePositionsMeta {
  type: 'update-positions';
  positions: number[];
}

export const PAGE_BREAK_PLUGIN_KEY = new PluginKey<PluginState>('pageBreakDecoration');

export function dispatchPageBreakPositions(view: EditorView, positions: number[]): void {
  const tr = view.state.tr.setMeta(PAGE_BREAK_PLUGIN_KEY, {
    type: 'update-positions',
    positions,
  } satisfies UpdatePositionsMeta);
  view.dispatch(tr);
}

function buildDecorationSet(
  doc: import('@tiptap/pm/model').Node,
  positions: number[],
): DecorationSet {
  const docEnd = doc.content.size;
  const valid = positions.filter((p) => p > 0 && p <= docEnd);
  const decorations = valid.map((pos, i) =>
    Decoration.widget(pos, () => renderPageBreakWidget(i + 2), {
      // Negative side means the widget attaches to the block FOLLOWING
      // it — so when the user inserts content right before a break,
      // the marker stays with the "next page" block as the cursor pushes
      // past. The literal numeric value matters less than the sign.
      side: -1,
      // Keep the cursor from ever landing inside the widget.
      ignoreSelection: true,
      key: `pb-${i}-${pos}`,
    }),
  );
  return DecorationSet.create(doc, decorations);
}

function renderPageBreakWidget(pageNumber: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sw-page-break-widget';
  wrap.setAttribute('contenteditable', 'false');
  wrap.setAttribute('data-sw-page-break', String(pageNumber));

  const line = document.createElement('span');
  line.className = 'sw-page-break-widget__line';
  wrap.appendChild(line);

  const label = document.createElement('span');
  label.className = 'sw-page-break-widget__label';
  label.textContent = `PAGE ${pageNumber}`;
  wrap.appendChild(label);

  return wrap;
}

export const PageBreakDecoration = Extension.create({
  name: 'pageBreakDecoration',

  addProseMirrorPlugins() {
    return [
      new Plugin<PluginState>({
        key: PAGE_BREAK_PLUGIN_KEY,
        state: {
          init(_config, state) {
            return { positions: [], set: DecorationSet.create(state.doc, []) };
          },
          apply(tr, prev, _oldState, newState) {
            const meta = tr.getMeta(PAGE_BREAK_PLUGIN_KEY) as
              | UpdatePositionsMeta
              | undefined;

            if (meta?.type === 'update-positions') {
              return {
                positions: meta.positions,
                set: buildDecorationSet(newState.doc, meta.positions),
              };
            }

            if (tr.docChanged && prev.positions.length > 0) {
              // Map positions forward so existing markers stay glued to
              // their blocks until the next debounced recompute lands.
              const mapped = prev.positions
                .map((p) => tr.mapping.map(p))
                .filter((p) => p > 0 && p <= newState.doc.content.size);
              return {
                positions: mapped,
                set: buildDecorationSet(newState.doc, mapped),
              };
            }

            return prev;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)?.set ?? null;
          },
        },
      }),
    ];
  },
});
