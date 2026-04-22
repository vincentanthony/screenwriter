import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ScriptMeta } from '@/types/script';

interface Props {
  scripts: ScriptMeta[];
  onDelete: (id: string) => void;
}

export function ScriptsList({ scripts, onDelete }: Props) {
  // The script queued for deletion. Null = no dialog. Holding the whole
  // ScriptMeta (not just id) so the dialog body can interpolate the title
  // even while Radix plays out its close animation.
  const [pendingDelete, setPendingDelete] = useState<ScriptMeta | null>(null);

  const confirmDelete = () => {
    if (!pendingDelete) return;
    onDelete(pendingDelete.id);
    setPendingDelete(null);
  };

  if (scripts.length === 0) {
    return <p className="text-muted-foreground">No scripts yet — create one to get started.</p>;
  }

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {scripts.map((script) => {
          const displayTitle = script.title || 'Untitled';
          return (
            <li key={script.id}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>
                    <Link to={`/scripts/${script.id}`} className="hover:underline">
                      {displayTitle}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    Updated {new Date(script.updatedAt).toLocaleString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPendingDelete(script)}
                    aria-label={`Delete ${displayTitle}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this script?</DialogTitle>
            <DialogDescription>
              &ldquo;{pendingDelete?.title || 'Untitled'}&rdquo; will be permanently deleted.
              This can&rsquo;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {/*
              Cancel is first in the DOM and receives autoFocus so reflexive
              Enter presses dismiss the dialog safely. Delete requires an
              explicit Tab-then-Enter or an explicit click.
            */}
            <Button
              variant="outline"
              autoFocus
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
