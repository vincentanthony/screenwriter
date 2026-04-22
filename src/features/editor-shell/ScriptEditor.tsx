import { Suspense, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { EditorContent } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
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
import { findDrawerPanel } from '@/features/drawer/panels';
import { useDrawerState } from '@/features/drawer/useDrawerState';
import { SaveIndicator } from './SaveIndicator';
import { DraftRestoreBanner } from './DraftRestoreBanner';

interface Props {
  script: Script;
}

/**
 * Session shell for a single script. Owns:
 *   - Title-page state (for the drawer's Title Page panel + the preview)
 *   - Initial-fountain resolution (script.fountain vs. any newer draft)
 *   - The TipTap editor instance (via useScreenplayEditor)
 *   - Autosave wiring
 *
 * Also acts as the "mode orchestrator": reads the drawer's active panel
 * and, if that panel declares a MainArea override, hides the editor
 * view and renders the override in its place. The editor instance is
 * NEVER destroyed on mode switch — undo history and hydration cost
 * are preserved by simply toggling a `hidden` class on the editor's
 * wrapper div.
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

  // Extract the title page from whichever Fountain we settled on.
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

  // ── Mode orchestration ───────────────────────────────────────────────
  // The drawer's active panel (if any) decides whether the main area
  // still renders the editor or swaps in an override (e.g. Title Page
  // preview). Both sides read the same drawer state from the URL so
  // there's no second source of truth.
  const { state: drawerState } = useDrawerState();
  const activePanel =
    drawerState.kind === 'panel' ? findDrawerPanel(drawerState.panelId) : null;
  const MainArea = activePanel?.MainArea ?? null;

  return (
    <div className="grid min-h-screen grid-cols-[auto_1fr]">
      <Drawer titlePage={titlePage} onTitlePageUpdate={handleTitlePageUpdate} />

      <main className="flex min-w-0 flex-col">
        {/* Top bar — visible across all modes so the writer never loses
            their "where am I / what's being saved" context. */}
        <div className="container flex-shrink-0 pb-4 pt-8">
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
        </div>

        {/* Mode-specific body. The editor-view div is ALWAYS rendered so
            the TipTap instance keeps its undo history + initial hydration
            across mode switches; when a MainArea override is active, we
            just flip `hidden` on this wrapper. See the integration test
            that asserts the same DOM reference survives the toggle. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            data-testid="editor-view"
            className={cn('container pb-8', MainArea && 'hidden')}
          >
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

          {MainArea && (
            <Suspense
              fallback={
                <div className="p-8 text-sm text-muted-foreground">
                  Loading panel view…
                </div>
              }
            >
              <div className="min-h-0 flex-1">
                <MainArea titlePage={titlePage} />
              </div>
            </Suspense>
          )}
        </div>
      </main>
    </div>
  );
}
