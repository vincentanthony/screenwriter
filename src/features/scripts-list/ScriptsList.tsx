import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import type { ScriptMeta } from '@/types/script';

interface Props {
  scripts: ScriptMeta[];
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => Promise<void> | void;
}

export function ScriptsList({ scripts, onDelete, onRename }: Props) {
  // Dialog-pending state holds the whole ScriptMeta (not just id) so
  // the dialog body can interpolate the title even while Radix plays
  // out its close animation.
  const [pendingDelete, setPendingDelete] = useState<ScriptMeta | null>(null);
  const [pendingRename, setPendingRename] = useState<ScriptMeta | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // When the rename dialog opens, focus the input and select all the
  // text so the user can just start typing to replace.
  useEffect(() => {
    if (pendingRename && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [pendingRename]);

  const confirmDelete = () => {
    if (!pendingDelete) return;
    onDelete(pendingDelete.id);
    setPendingDelete(null);
  };

  const startRename = (script: ScriptMeta) => {
    setPendingRename(script);
    setRenameValue(script.title);
  };

  const commitRename = async () => {
    if (!pendingRename) return;
    const trimmed = renameValue.trim();
    // No-op if unchanged after trim — close the dialog without a write.
    if (trimmed !== pendingRename.title.trim()) {
      await onRename(pendingRename.id, trimmed);
    }
    setPendingRename(null);
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
                <CardContent className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startRename(script)}
                    aria-label={`Rename ${displayTitle}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
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

      <Dialog
        open={pendingRename !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRename(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename script</DialogTitle>
            <DialogDescription>
              Change the display name for &ldquo;{pendingRename?.title || 'Untitled'}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <Input
            ref={renameInputRef}
            aria-label="Script title"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitRename();
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRename(null)}>
              Cancel
            </Button>
            <Button onClick={commitRename}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
