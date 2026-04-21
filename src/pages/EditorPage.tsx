import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScript } from '@/hooks/useScript';
import { ScriptEditor } from '@/features/editor-shell/ScriptEditor';

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const { script, isLoading } = useScript(id);

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

      {!isLoading && !script && <p className="text-muted-foreground">Script not found.</p>}

      {/* key={script.id} forces a fresh editor instance on navigation so
          hydration runs cleanly for each script. */}
      {script && <ScriptEditor key={script.id} script={script} />}
    </div>
  );
}
