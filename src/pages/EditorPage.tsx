import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScript } from '@/hooks/useScript';
import { ScriptEditor } from '@/features/editor-shell/ScriptEditor';

/**
 * Route-level editor shell.
 *
 * Layout contract (fixes the "drawer scrolls with editor" bug):
 *   - `.editor-page`  — `h-screen flex flex-col`. Establishes a fixed
 *     viewport frame so document scroll can't bleed into the drawer.
 *   - `.editor-page-topbar` — `flex-shrink-0`. Always-visible back
 *     button, sits above everything, never scrolls.
 *   - `.editor-page-body`  — `flex-1 min-h-0 flex`. Hosts the drawer
 *     and ScriptEditor as INDEPENDENT scroll regions. `min-h-0` is
 *     the flex-child-shrinking unlock — without it, children with
 *     overflow:auto get pushed out past the container instead of
 *     clipping + scrolling.
 *
 * The loading and not-found states share the same frame so the top
 * bar is present before and after script resolution.
 */
export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const { script, isLoading, update } = useScript(id);

  // Rename callback the inline-edit widget calls on commit. Trimming +
  // no-op-if-unchanged is already handled inside TitleInlineEdit; we
  // just route the write through useScript.update so the hook's local
  // `script` state refreshes (and the header re-renders with the new
  // title) without a round-trip through the list.
  const handleRename = useCallback(
    async (newTitle: string) => {
      await update({ title: newTitle });
    },
    [update],
  );

  return (
    <div className="flex h-screen flex-col" data-testid="editor-page">
      <header
        className="flex-shrink-0 border-b bg-background px-4 py-3"
        data-testid="editor-page-topbar"
      >
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Back to scripts
          </Link>
        </Button>
      </header>

      <div className="flex min-h-0 flex-1" data-testid="editor-page-body">
        {script ? (
          /* key={script.id} forces a fresh editor instance on navigation
             so hydration + drawer state run cleanly for each script. */
          <ScriptEditor key={script.id} script={script} onRename={handleRename} />
        ) : (
          <div className="flex-1 p-8 text-sm text-muted-foreground">
            {isLoading ? 'Loading…' : 'Script not found.'}
          </div>
        )}
      </div>
    </div>
  );
}
