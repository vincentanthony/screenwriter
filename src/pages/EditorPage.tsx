import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScript } from '@/hooks/useScript';

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const { script, isLoading } = useScript(id);

  return (
    <div className="container py-12">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Back to scripts
          </Link>
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {!isLoading && !script && (
        <p className="text-muted-foreground">Script not found.</p>
      )}

      {script && (
        <>
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">{script.title}</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Raw Fountain preview — the TipTap editor lands in the next commit.
          </p>
          <pre className="whitespace-pre-wrap rounded-md border bg-muted p-4 font-screenplay text-sm">
            {script.fountain || '(empty)'}
          </pre>
        </>
      )}
    </div>
  );
}
