import { useEffect, useRef } from 'react';
import { useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

import { parse } from '@/fountain/parse';
import { serialize } from '@/fountain/serialize';
import type { TitlePageField } from '@/fountain/types';

import { NODE_NAMES } from './serialization/nodeNames';
import type { TipTapDoc } from './serialization/types';
import { docToScreenplay } from './serialization/fromTiptap';
import { screenplayToDoc } from './serialization/toTiptap';

import { SCREENPLAY_NODES } from './nodes';
import { SCREENPLAY_EXTENSIONS } from './extensions';

/**
 * Hook that stands up a TipTap Editor configured for screenwriting:
 * StarterKit minus the blocks/marks that conflict with our screenplay
 * nodes, plus our thirteen SCREENPLAY_NODES and the two behavior
 * extensions (ElementKeymap, CharacterUppercase).
 *
 * Takes an `initialFountain` (null while the script is still loading from
 * storage) and an `onFountainChange` callback fired every time the editor's
 * content changes. Internally:
 *
 *   1. Creates the TipTap Editor once.
 *   2. When `initialFountain` first arrives, hydrates the doc via
 *      parse → screenplayToDoc → setContent — suppressing the update
 *      callback so the initial load doesn't count as a user edit.
 *   3. On every subsequent editor transaction, converts the ProseMirror
 *      JSON back to a ScreenplayElement[] (stitching the detached title
 *      page back in) and serializes to Fountain.
 *
 * Returns `{ editor, titlePageRef }`. `titlePageRef.current` is the detached
 * title-page the editor doesn't directly edit — v1 leaves it read-only.
 */

export interface UseScreenplayEditorOptions {
  /** Fountain source, or null if the script hasn't loaded yet. */
  initialFountain: string | null;
  /** Called with the current Fountain serialization on every change. */
  onFountainChange: (fountain: string) => void;
}

export interface UseScreenplayEditorResult {
  editor: Editor | null;
  titlePageRef: React.MutableRefObject<TitlePageField[] | null>;
}

export function useScreenplayEditor({
  initialFountain,
  onFountainChange,
}: UseScreenplayEditorOptions): UseScreenplayEditorResult {
  const titlePageRef = useRef<TitlePageField[] | null>(null);
  const hydratedRef = useRef(false);

  // Keep the latest onChange in a ref so TipTap's captured callback always
  // fires the newest one without forcing editor recreation on every render.
  const onChangeRef = useRef(onFountainChange);
  useEffect(() => {
    onChangeRef.current = onFountainChange;
  }, [onFountainChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Keep: document, text, hardBreak, history, dropcursor, gapcursor.
        // Drop the block nodes we have our own replacements for.
        paragraph: false,
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        codeBlock: false,
        horizontalRule: false,
        // Drop inline marks — v1 preserves Fountain emphasis markers as
        // literal characters (`**bold**` stays as asterisks in the text).
        bold: false,
        italic: false,
        strike: false,
        code: false,
      }),
      ...SCREENPLAY_NODES,
      ...SCREENPLAY_EXTENSIONS,
    ],
    editorProps: {
      attributes: {
        class: 'sw-screenplay focus:outline-none min-h-[60vh] px-4 py-6',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor }) => {
      if (!hydratedRef.current) return; // ignore the initial setContent
      const json = editor.getJSON() as unknown as TipTapDoc;
      const elements = docToScreenplay(json, titlePageRef.current);
      onChangeRef.current(serialize(elements));
    },
  });

  // Hydrate the editor from the initial Fountain source exactly once. If
  // initialFountain is empty/null, we seed a single empty Action so the
  // schema's `block+` constraint is satisfied and the user has a valid
  // cursor position.
  useEffect(() => {
    if (!editor || hydratedRef.current) return;
    if (initialFountain == null) return;

    const elements = parse(initialFountain);
    const { titlePage, doc } = screenplayToDoc(elements);
    titlePageRef.current = titlePage;

    const seededDoc = doc.content.length > 0
      ? doc
      : { type: 'doc' as const, content: [{ type: NODE_NAMES.action }] };

    editor.commands.setContent(seededDoc, false);
    hydratedRef.current = true;
  }, [editor, initialFountain]);

  return { editor, titlePageRef };
}
