import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { EditorContent } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { useScreenplayEditor } from '@/editor';
import { docToScreenplay } from '@/editor/serialization/fromTiptap';
import type { TipTapDoc } from '@/editor/serialization/types';
import { parse } from '@/fountain/parse';
import { serialize } from '@/fountain/serialize';
import type { TitlePageField } from '@/fountain/types';
import { useAutosave } from '@/hooks/useAutosave';
import { getRepository } from '@/storage/repository';
import type { Script } from '@/types/script';
import { Drawer } from '@/features/drawer/Drawer';
import { SaveIndicator } from './SaveIndicator';
import { DraftRestoreBanner } from './DraftRestoreBanner';

interface Props {
  script: Script;
}

/**
 * The live screenplay editor for a single script. Mounts the TipTap
 * editor, wires autosave, reconciles any drift between the draft row
 * and the canonical Fountain, and owns the title-page state that the
 * drawer's Title Page panel reads and writes.
 *
 * Layout: a two-column CSS grid with the Drawer on the left and the
 * editor column on the right. The Drawer's own `grid-template-columns`
 * transition (driven by its width change) reflows the editor column,
 * so the editor actually narrows rather than being covered by an
 * overlay.
 */
export function ScriptEditor({ script }: Props) {
  const [initialFountain, setInitialFountain] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<{
    fountain: string;
    draftUpdatedAt: number;
  } | null>(null);
  const [titlePage, setTitlePage] = useState<TitlePageField[] | null>(null);

  // Resolve the starting Fountain once per script: if a newer draft row
  // exists, surface the banner and let the user pick. Otherwise boot the
  // editor straight from the script's canonical Fountain.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await getRepository().getDraft(script.id);
      if (cancelled) return;
      if (draft && draft.draftUpdatedAt > script.updatedAt) {
        setPendingDraft(draft);
        setInitialFountain(script.fountain);
      } else {
        setPendingDraft(null);
        setInitialFountain(script.fountain);
        if (draft) getRepository().clearDraft(script.id).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [script.id, script.fountain, script.updatedAt]);

  // Extract the title page from whichever Fountain we settled on. Runs
  // alongside editor hydration — both observe the same initialFountain
  // state so they stay consistent without an ordering contract.
  useEffect(() => {
    if (initialFountain == null) return;
    const elements = parse(initialFountain);
    const tp = elements.find((e) => e.type === 'title-page');
    setTitlePage(tp?.type === 'title-page' ? tp.fields : null);
  }, [initialFountain, script.id]);

  const { state, onFountainChange } = useAutosave({
    scriptId: script.id,
    initialFountain,
  });

  const { editor } = useScreenplayEditor({
    initialFountain,
    titlePage,
    onFountainChange,
  });

  /**
   * Title-page panel → autosave bridge.
   *
   * The hook serializes body transactions using whatever titlePage ref it
   * currently holds, so on pure editor edits we never need to do this.
   * But when the user edits the TITLE PAGE itself (the editor doesn't
   * fire onUpdate), we have to re-serialize explicitly using the new
   * fields + the current body and push the result into the autosave
   * pipeline.
   */
  const handleTitlePageUpdate = useCallback(
    (fields: TitlePageField[]) => {
      setTitlePage(fields);
      if (!editor) return;
      const json = editor.getJSON() as unknown as TipTapDoc;
      const elements = docToScreenplay(json, fields);
      onFountainChange(serialize(elements));
    },
    [editor, onFountainChange],
  );

  const restoreDraft = async () => {
    if (!pendingDraft) return;
    setInitialFountain(pendingDraft.fountain);
    onFountainChange(pendingDraft.fountain);
    setPendingDraft(null);
  };

  const discardDraft = async () => {
    if (!pendingDraft) return;
    await getRepository().clearDraft(script.id).catch(() => {});
    setPendingDraft(null);
  };

  return (
    <div className="grid min-h-screen grid-cols-[auto_1fr]">
      <Drawer titlePage={titlePage} onTitlePageUpdate={handleTitlePageUpdate} />

      <main className="min-w-0">
        <div className="container py-8">
          <div className="mb-6">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
                Back to scripts
              </Link>
            </Button>
          </div>

          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">{script.title}</h1>
            <SaveIndicator state={state} />
          </div>

          {pendingDraft && (
            <DraftRestoreBanner
              draftUpdatedAt={pendingDraft.draftUpdatedAt}
              onRestore={restoreDraft}
              onDiscard={discardDraft}
            />
          )}

          <div className="rounded-md border bg-card">
            <EditorContent editor={editor} />
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            Undo is per session — reloading clears the undo history. Recent saves
            are preserved in a 5-entry snapshot ring.
          </p>
        </div>
      </main>
    </div>
  );
}
