import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { EditorContent } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useScreenplayEditor } from '@/editor';
import { dispatchPageBreakPositions } from '@/editor/extensions/pageBreakDecoration';
import { docToScreenplay } from '@/editor/serialization/fromTiptap';
import type { TipTapDoc } from '@/editor/serialization/types';
import { parse } from '@/fountain/parse';
import { serialize } from '@/fountain/serialize';
import type { ScreenplayElement, TitlePageField } from '@/fountain/types';
import { useAutosave } from '@/hooks/useAutosave';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { useViewSettings } from '@/hooks/useViewSettings';
import { BrowserMeasurer } from '@/pagination/browserMeasurer';
import { paginate } from '@/pagination/paginate';
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

const PAGINATION_DEBOUNCE_MS = 100;

/**
 * Session shell for a single script. Owns:
 *   - Title-page state (for the drawer's Title Page panel + the preview)
 *   - Initial-fountain resolution (script.fountain vs. any newer draft)
 *   - The TipTap editor instance (via useScreenplayEditor)
 *   - Autosave wiring (300 ms debounced main save)
 *   - View settings (localStorage-backed preferences)
 *   - Pagination wiring: a BrowserMeasurer singleton tied to this
 *     shell's lifetime, plus a 100 ms debounced paginate() that
 *     dispatches page-break positions into the editor's decoration
 *     plugin. The plugin never touches the document — breaks are
 *     visual-only so the Fountain source stays byte-stable.
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

  const { settings: viewSettings, update: updateViewSettings } = useViewSettings();

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

  // ── Pagination wiring ────────────────────────────────────────────────
  // The BrowserMeasurer owns an offscreen measurement container; it's
  // created once per ScriptEditor mount and disposed on unmount so we
  // don't leak DOM nodes when the user navigates between scripts.
  const measurerRef = useRef<BrowserMeasurer | null>(null);
  useEffect(() => {
    measurerRef.current = new BrowserMeasurer();
    return () => {
      measurerRef.current?.dispose();
      measurerRef.current = null;
    };
  }, []);

  const titlePageRef = useRef(titlePage);
  useEffect(() => {
    titlePageRef.current = titlePage;
  }, [titlePage]);

  const showPageBreaks = viewSettings.showPageBreaks;
  const showPageBreaksRef = useRef(showPageBreaks);
  useEffect(() => {
    showPageBreaksRef.current = showPageBreaks;
  }, [showPageBreaks]);

  // Core pagination work. Debounced at 100 ms (shorter than the 300 ms
  // autosave because pagination is cheap thanks to the measurement
  // cache and writers want the visual break to track their typing).
  const runPagination = useCallback(() => {
    if (!editor) return;
    // Feature-off: dispatch empty positions to clear any stale markers.
    if (!showPageBreaksRef.current) {
      dispatchPageBreakPositions(editor.view, []);
      return;
    }
    const measurer = measurerRef.current;
    if (!measurer) return;

    const json = editor.getJSON() as unknown as TipTapDoc;
    const elements = docToScreenplay(json, titlePageRef.current);
    const pages = paginate(elements, measurer);

    const positions = computePageBreakDocPositions(editor, elements, pages);
    dispatchPageBreakPositions(editor.view, positions);
  }, [editor]);

  const paginateDebounced = useDebouncedCallback(runPagination, PAGINATION_DEBOUNCE_MS);

  // Fire pagination whenever the editor's content changes.
  useEffect(() => {
    if (!editor) return;
    const handler = () => paginateDebounced();
    editor.on('update', handler);
    // Kick once so markers land on initial load without waiting for
    // the first keystroke.
    paginateDebounced();
    return () => {
      editor.off('update', handler);
    };
  }, [editor, paginateDebounced]);

  // Re-run (synchronously via flush so the effect doesn't drift into
  // the next tick) whenever the "show page breaks" toggle flips.
  useEffect(() => {
    if (!editor) return;
    paginateDebounced();
    paginateDebounced.flush();
  }, [showPageBreaks, editor, paginateDebounced]);

  // ── Mode orchestration ───────────────────────────────────────────────
  const { state: drawerState } = useDrawerState();
  const activePanel =
    drawerState.kind === 'panel' ? findDrawerPanel(drawerState.panelId) : null;
  const MainArea = activePanel?.MainArea ?? null;

  const drawerProps = useMemo(
    () => ({
      titlePage,
      onTitlePageUpdate: handleTitlePageUpdate,
      viewSettings,
      onViewSettingsChange: updateViewSettings,
    }),
    [titlePage, handleTitlePageUpdate, viewSettings, updateViewSettings],
  );

  return (
    <div className="grid min-h-screen grid-cols-[auto_1fr]">
      <Drawer {...drawerProps} />

      <main className="flex min-w-0 flex-col">
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

/**
 * Translate pagination output into ProseMirror doc positions suitable
 * for widget decorations.
 *
 * For each page after the first, we emit one break indicator BEFORE
 * the block that opens that page. Block index in the TipTap doc is
 * the count of non-title-page elements up to (but not including) the
 * first PageElement's originalIndex, because screenplayToDoc filters
 * title-page out when it builds the doc.
 */
function computePageBreakDocPositions(
  editor: import('@tiptap/core').Editor,
  elements: ScreenplayElement[],
  pages: import('@/pagination/types').Page[],
): number[] {
  if (pages.length <= 1) return [];

  const doc = editor.state.doc;
  // Precompute cumulative top-level node starts so we don't rewalk
  // from the beginning for each boundary.
  const blockStarts: number[] = [];
  let offset = 0;
  doc.forEach((child) => {
    blockStarts.push(offset);
    offset += child.nodeSize;
  });

  const positions: number[] = [];
  for (let p = 1; p < pages.length; p++) {
    const firstSlot = pages[p].elements[0];
    if (!firstSlot) continue;
    const blockIndex = originalIndexToBlockIndex(elements, firstSlot.originalIndex);
    // Defensive: if the element array and the doc disagree (e.g. an
    // unfinished transaction mid-render), skip rather than crash.
    if (blockIndex < 0 || blockIndex >= blockStarts.length) continue;
    positions.push(blockStarts[blockIndex]);
  }
  return positions;
}

function originalIndexToBlockIndex(
  elements: ScreenplayElement[],
  originalIndex: number,
): number {
  let blockIndex = 0;
  for (let i = 0; i < originalIndex; i++) {
    if (elements[i].type !== 'title-page') blockIndex++;
  }
  return blockIndex;
}
