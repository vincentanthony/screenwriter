import { useEffect, useState } from 'react';
import { EditorContent } from '@tiptap/react';
import { useScreenplayEditor } from '@/editor';
import { useAutosave } from '@/hooks/useAutosave';
import { getRepository } from '@/storage/repository';
import type { Script } from '@/types/script';
import { SaveIndicator } from './SaveIndicator';
import { DraftRestoreBanner } from './DraftRestoreBanner';

interface Props {
  script: Script;
}

/**
 * The live screenplay editor for a single script. Mounts the TipTap
 * editor, wires autosave, reconciles any drift between the draft row
 * and the canonical Fountain, and shows the Save Indicator.
 *
 * This component takes a `Script` already loaded from the repo and owns
 * everything from hydration forward. The parent (EditorPage) is
 * responsible for loading + passing it in with a `key={script.id}` so
 * we get a fresh editor when the user navigates to a different script.
 */
export function ScriptEditor({ script }: Props) {
  const [initialFountain, setInitialFountain] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<{
    fountain: string;
    draftUpdatedAt: number;
  } | null>(null);

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
        // A stale draft (<= script.updatedAt) is just leftover noise.
        if (draft) getRepository().clearDraft(script.id).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [script.id, script.fountain, script.updatedAt]);

  const { state, onFountainChange } = useAutosave({
    scriptId: script.id,
    initialFountain,
  });

  const { editor } = useScreenplayEditor({
    initialFountain,
    onFountainChange,
  });

  const restoreDraft = async () => {
    if (!pendingDraft) return;
    setInitialFountain(pendingDraft.fountain);
    // Trigger onFountainChange so the main save picks it up.
    onFountainChange(pendingDraft.fountain);
    setPendingDraft(null);
  };

  const discardDraft = async () => {
    if (!pendingDraft) return;
    await getRepository().clearDraft(script.id).catch(() => {});
    setPendingDraft(null);
  };

  return (
    <div>
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
  );
}
