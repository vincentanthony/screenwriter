import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent } from '@tiptap/react';
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
import { ExportMenu, type ExportPayload } from './ExportMenu';
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
 *     plugin.
 *
 * Layout contract (see EditorPage for the outer frame):
 *   - Rendered as the two CHILDREN of EditorPage's body row
 *     (`.editor-page-body`): the Drawer element first, the <main>
 *     element second. Both are flex children.
 *   - Drawer manages its own width transition + internal scroll.
 *   - Main gets `min-h-0 flex-1 flex-col`. Its children manage their
 *     own scroll: the editor view is `overflow-y-auto`, MainArea
 *     overrides fill the remaining height and handle their own scroll
 *     internally. Neither scrolls the other — that's the fix for
 *     "drawer scrolls with editor content".
 *
 * Mode orchestrator: reads the drawer's active panel and, if that
 * panel declares a MainArea override, hides the editor view and
 * renders the override in its place. The editor instance is NEVER
 * destroyed on mode switch — the editor-view div just toggles a
 * `hidden` class.
 */
export function ScriptEditor({ script }: Props) {
  const [initialFountain, setInitialFountain] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<{
    fountain: string;
    draftUpdatedAt: number;
  } | null>(null);
  const [titlePage, setTitlePage] = useState<TitlePageField[] | null>(null);

  const { settings: viewSettings, update: updateViewSettings } = useViewSettings();

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

  const { editor, hydrated } = useScreenplayEditor({
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

  /**
   * Core pagination work. Pure from the autosave path's point of view:
   * it dispatches a setMeta-only transaction into the editor view,
   * which does NOT change the doc (no docChanged), so TipTap's
   * `update` event never fires and useAutosave doesn't see a write.
   */
  const runPagination = useCallback(() => {
    if (!editor) return;
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

  // Subscribe to editor updates.
  useEffect(() => {
    if (!editor) return;
    const handler = () => paginateDebounced();
    editor.on('update', handler);
    return () => {
      editor.off('update', handler);
    };
  }, [editor, paginateDebounced]);

  /**
   * Kick pagination once hydration completes, and whenever the
   * `showPageBreaks` preference changes. Previously this effect
   * depended only on [editor, showPageBreaks], which caused the
   * "page breaks disappear after reload" bug: when the page loaded
   * with the toggle already on, paginate ran BEFORE hydration (while
   * the doc was still empty), produced zero breaks, and nothing
   * triggered a re-paginate after hydration because
   * `setContent(doc, false)` suppresses the `update` event by design.
   *
   * Gating on `hydrated` fixes it — this effect fires exactly once
   * when hydration flips from false → true, then again on every
   * toggle flip.
   */
  useEffect(() => {
    if (!editor || !hydrated) return;
    paginateDebounced();
    paginateDebounced.flush();
  }, [editor, hydrated, showPageBreaks, paginateDebounced]);

  /**
   * Snapshot the inputs the export menu needs at click time. Captured
   * lazily (caller invokes the callback) so the snapshot is always
   * fresh — not stale from when the component last rendered.
   *
   * The export uses the SAME paginate() the live editor uses, with a
   * fresh BrowserMeasurer instance. We deliberately do NOT reuse
   * `measurerRef.current` here: an export should reflect the document
   * exactly as it stands now, with no risk of a stale measurement
   * cache entry from before a mid-session font load shifted heights.
   */
  const getExportPayload = useCallback((): ExportPayload => {
    if (!editor) {
      return { scriptTitle: script.title, elements: [], titlePage: null, pages: [] };
    }
    const json = editor.getJSON() as unknown as TipTapDoc;
    const elements = docToScreenplay(json, titlePageRef.current);

    const exportMeasurer = new BrowserMeasurer();
    try {
      const pages = paginate(elements, exportMeasurer);
      return {
        scriptTitle: script.title,
        elements,
        titlePage: titlePageRef.current,
        pages,
      };
    } finally {
      exportMeasurer.dispose();
    }
  }, [editor, script.title]);

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
    <>
      <Drawer {...drawerProps} />

      <main
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        data-testid="editor-main"
      >
        {/* Script title + Save Indicator + Export menu stay pinned above
            the scrolling body. */}
        <div className="flex-shrink-0 border-b bg-background/60 px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <h1 className="truncate text-lg font-semibold tracking-tight">
              {script.title}
            </h1>
            <div className="flex items-center gap-3">
              <SaveIndicator state={state} />
              <ExportMenu getExportPayload={getExportPayload} />
            </div>
          </div>
        </div>

        {/*
          Editor view — always mounted so the TipTap instance keeps
          its undo history and hydration across mode switches. The
          `overflow-y-auto` here makes THIS the scroll region for
          editor content; the drawer scrolls on its own.
        */}
        <div
          data-testid="editor-view"
          className={cn(
            'flex min-h-0 flex-1 flex-col overflow-y-auto',
            MainArea && 'hidden',
          )}
        >
          <div className="container pb-8 pt-6">
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
        </div>

        {MainArea && (
          <Suspense
            fallback={
              <div className="p-8 text-sm text-muted-foreground">
                Loading panel view…
              </div>
            }
          >
            {/*
              The panel's MainArea owns its own overflow behavior
              (TitlePagePreview, for example, scrolls a centered page
              inside a muted workspace). flex-1 + min-h-0 give it the
              rest of the main column's height.
            */}
            <div className="flex min-h-0 flex-1">
              <MainArea titlePage={titlePage} />
            </div>
          </Suspense>
        )}
      </main>
    </>
  );
}

function computePageBreakDocPositions(
  editor: import('@tiptap/core').Editor,
  elements: ScreenplayElement[],
  pages: import('@/pagination/types').Page[],
): number[] {
  if (pages.length <= 1) return [];

  const doc = editor.state.doc;
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
