import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScript } from '@/hooks/useScript';
import { ScriptEditor } from '@/features/editor-shell/ScriptEditor';

/**
 * Route-level editor shell. While the script is loading or missing, we
 * render a narrow container. Once the script is loaded, ScriptEditor
 * takes over the whole viewport — it owns its own drawer + container
 * layout so the drawer sits flush against the viewport edge rather
 * than inside a centered content container.
 */
export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const { script, isLoading } = useScript(id);

  if (script) {
    // key={script.id} forces a fresh editor instance on navigation so
    // hydration + drawer state run cleanly for each script.
    return <ScriptEditor key={script.id} script={script} />;
  }

  return (
    <div className="container py-8">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Back to scripts
          </Link>
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {!isLoading && <p className="text-muted-foreground">Script not found.</p>}
    </div>
  );
}
