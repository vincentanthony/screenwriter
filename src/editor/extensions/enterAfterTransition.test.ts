import { afterEach, describe, expect, it } from 'vitest';
import { Editor, type Content } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { SCREENPLAY_NODES } from '@/editor/nodes';
import { SCREENPLAY_EXTENSIONS, resolveEnter } from '@/editor/extensions';
import { contextFromEditor, executeKeyMapAction } from './elementKeymap';
import {
  handleTransitionPromotion,
  TRANSITION_TRIGGER,
} from './livePromotions';

/**
 * Full-editor integration tests for the "Enter after Transition" path.
 *
 * These tests stand up an actual @tiptap/core Editor in jsdom so the
 * chain-of-commands semantics are real — unlike the pure-prosemirror
 * tests elsewhere, which can miss interactions between extensions,
 * appendTransaction plugins, and the default-block-type resolution that
 * pm-commands.splitBlock does via `defaultBlockAt`.
 */

let editor: Editor | null = null;

afterEach(() => {
  if (editor) {
    editor.destroy();
    editor = null;
  }
});

function buildEditor(content: Content): Editor {
  const element = document.createElement('div');
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [
      StarterKit.configure({
        paragraph: false,
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        codeBlock: false,
        horizontalRule: false,
        bold: false,
        italic: false,
        strike: false,
        code: false,
      }),
      ...SCREENPLAY_NODES,
      ...SCREENPLAY_EXTENSIONS,
    ],
    content,
  });
}

/**
 * Invoke the REAL ElementKeymap Enter binding without going through a
 * synthesized KeyboardEvent (jsdom doesn't fully exercise those). This
 * exercises the exact same `executeKeyMapAction` path the keyboard
 * shortcut does, so any regression in the keymap wiring shows up here.
 */
function runEnter(ed: Editor): boolean {
  return executeKeyMapAction(ed, resolveEnter(contextFromEditor(ed)));
}

describe('Enter after a non-empty Transition — explicit path', () => {
  it('splits into a new Scene Heading and moves the cursor there', () => {
    editor = buildEditor({
      type: 'doc',
      content: [
        {
          type: NODE_NAMES.transition,
          attrs: { forced: false },
          content: [{ type: 'text', text: 'CUT TO:' }],
        },
      ],
    });
    editor.commands.focus('end');

    const handled = runEnter(editor);
    expect(handled).toBe(true);

    const json = editor.getJSON();
    expect(json.content).toHaveLength(2);
    expect(json.content![0].type).toBe(NODE_NAMES.transition);
    expect(json.content![0].content?.[0]?.text).toBe('CUT TO:');
    expect(json.content![1].type).toBe(NODE_NAMES.sceneHeading);

    // Selection must land inside the new Scene Heading so the user can
    // keep typing the slugline immediately.
    const selectedType = editor.state.selection.$from.parent.type.name;
    expect(selectedType).toBe(NODE_NAMES.sceneHeading);
  });
});

describe('Enter after a Transition that was auto-promoted from Action', () => {
  it('full flow: Action("cut to") → InputRule → Transition("CUT TO:") → Enter → SceneHeading', () => {
    editor = buildEditor({
      type: 'doc',
      content: [
        {
          type: NODE_NAMES.action,
          attrs: { forced: false },
          content: [{ type: 'text', text: 'cut to' }],
        },
      ],
    });
    editor.commands.focus('end');

    // Simulate the InputRule firing: promote the Action → Transition with
    // the trigger char. After dispatch, the TransitionUppercase plugin's
    // appendTransaction runs automatically in the editor's normal cycle,
    // yielding "CUT TO:" in the doc.
    const state = editor.state;
    const match = TRANSITION_TRIGGER.exec('cut to:') as RegExpMatchArray;
    const promoteTr = handleTransitionPromotion(state, match, 1, 7);
    expect(promoteTr).not.toBeNull();
    editor.view.dispatch(promoteTr!);

    // After appendTransaction has a chance to uppercase.
    expect(editor.state.doc.firstChild?.type.name).toBe(NODE_NAMES.transition);
    expect(editor.state.doc.firstChild?.textContent).toBe('CUT TO:');

    // Now press Enter.
    const handled = runEnter(editor);
    expect(handled).toBe(true);

    const json = editor.getJSON();
    expect(json.content).toHaveLength(2);
    expect(json.content![0].type).toBe(NODE_NAMES.transition);
    expect(json.content![0].content?.[0]?.text).toBe('CUT TO:');
    expect(json.content![1].type).toBe(NODE_NAMES.sceneHeading);

    const selectedType = editor.state.selection.$from.parent.type.name;
    expect(selectedType).toBe(NODE_NAMES.sceneHeading);
  });
});
