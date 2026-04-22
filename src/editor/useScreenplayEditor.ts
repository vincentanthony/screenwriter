import { useEffect, useRef, useState } from 'react';
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
 * nodes, plus the thirteen SCREENPLAY_NODES and SCREENPLAY_EXTENSIONS.
 *
 * Ownership model (changed in the drawer commit):
 *   - The editor still parses `initialFountain` once to build its
 *     starting doc, but it NO LONGER owns the title-page fields.
 *     ScriptEditor owns `titlePage` as React state so the drawer's
 *     Title Page panel can read/write it.
 *   - `titlePage` flows in as a prop. A ref mirrors it so the TipTap
 *     `onUpdate` callback (captured at editor-creation time) always
 *     reads the latest value without forcing editor recreation.
 *   - On every editor transaction, we serialize the body back to
 *     Fountain AND prepend whatever `titlePageRef.current` holds.
 *     When ScriptEditor's handleTitlePageUpdate fires its own
 *     serialize, it shortcuts through the same onFountainChange path.
 */

export interface UseScreenplayEditorOptions {
  /** Fountain source, or null if the script hasn't loaded yet. */
  initialFountain: string | null;
  /** Current title-page fields owned by the parent (ScriptEditor). */
  titlePage: TitlePageField[] | null;
  /** Called with the current Fountain serialization on every change. */
  onFountainChange: (fountain: string) => void;
}

export interface UseScreenplayEditorResult {
  editor: Editor | null;
  /**
   * Flips from false → true exactly once after the initial fountain is
   * parsed and applied via setContent(). Consumers that need to run
   * post-hydration work (e.g. pagination, scroll restore) should gate
   * on this instead of just `editor !== null`, because the editor
   * becomes non-null before the doc has content.
   *
   * Internally backed by both a ref (for the TipTap onUpdate closure,
   * which is captured at editor-creation time and would otherwise see
   * a stale `false`) and React state (so external effects re-run when
   * hydration completes).
   */
  hydrated: boolean;
}

export function useScreenplayEditor({
  initialFountain,
  titlePage,
  onFountainChange,
}: UseScreenplayEditorOptions): UseScreenplayEditorResult {
  const hydratedRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);

  // Mirror props into refs so TipTap's captured onUpdate always sees the
  // latest values without forcing the editor to be torn down and rebuilt.
  const titlePageRef = useRef<TitlePageField[] | null>(titlePage);
  useEffect(() => {
    titlePageRef.current = titlePage;
  }, [titlePage]);

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
    const { doc } = screenplayToDoc(elements);

    const seededDoc =
      doc.content.length > 0
        ? doc
        : { type: 'doc' as const, content: [{ type: NODE_NAMES.action }] };

    editor.commands.setContent(seededDoc, false);
    hydratedRef.current = true;
    setHydrated(true);
  }, [editor, initialFountain]);

  return { editor, hydrated };
}
