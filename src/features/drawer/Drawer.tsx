import { Suspense, useEffect } from 'react';
import { ArrowLeft, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { DrawerPanelList } from './DrawerPanelList';
import { findDrawerPanel, type DrawerPanelProps } from './panels';
import { useDrawerState } from './useDrawerState';

/**
 * Reusable left-side drawer. The chassis is panel-agnostic — it reads
 * DRAWER_PANELS from ./panels for the Layer-1 list and renders whichever
 * panel the URL names for Layer 2.
 *
 * Widths:
 *   - closed: 48px — just the cog-icon strip
 *   - open:   320px — list or active panel
 *
 * Layout: the parent places this drawer as one column of a CSS grid
 * (see ScriptEditor). The transition on `grid-template-columns`
 * animates both the drawer width AND the editor column's width in
 * lockstep, so the editor doesn't overlap with the drawer — it
 * actually reflows.
 */

interface Props extends DrawerPanelProps {}

const CLOSED_WIDTH = 48;
const OPEN_WIDTH = 320;

export function Drawer(props: Props) {
  const { state, openList, openPanel, close } = useDrawerState();
  const isOpen = state.kind !== 'closed';
  const activePanel =
    state.kind === 'panel' ? findDrawerPanel(state.panelId) : null;

  // Esc closes the drawer — but we don't want to hijack Esc while the
  // user is typing in the editor (suggestion popups, undo, etc. already
  // claim it). Guard by checking the event's target: if it's inside the
  // ProseMirror contenteditable, let the editor handle it.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target as Element | null;
      if (target?.closest('.ProseMirror')) return;
      close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close]);

  return (
    <aside
      aria-label="Script drawer"
      style={{ width: isOpen ? `${OPEN_WIDTH}px` : `${CLOSED_WIDTH}px` }}
      className={cn(
        'flex h-full flex-col overflow-hidden border-r bg-muted/30',
        'transition-[width] duration-200 ease-out',
      )}
    >
      <header className="flex items-center gap-1 border-b p-2">
        {state.kind === 'panel' && (
          <Button
            variant="ghost"
            size="icon"
            onClick={openList}
            aria-label="Back to drawer panels"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={isOpen ? close : openList}
          aria-label={isOpen ? 'Close drawer' : 'Open drawer'}
          aria-expanded={isOpen}
        >
          <Settings className="h-4 w-4" />
        </Button>
        {activePanel && (
          <div className="ml-1 truncate text-sm font-medium">
            {activePanel.label}
          </div>
        )}
      </header>

      {/* Hide body content entirely when closed so the 48px strip is
          clean. We keep the header rendered so the cog stays clickable. */}
      {isOpen && state.kind === 'list' && <DrawerPanelList onPanelClick={openPanel} />}

      {isOpen && activePanel && (
        <Suspense
          fallback={
            <div className="flex-1 p-4 text-sm text-muted-foreground">Loading panel…</div>
          }
        >
          <div className="flex-1 overflow-auto p-4">
            <activePanel.Component {...props} />
          </div>
        </Suspense>
      )}
    </aside>
  );
}
