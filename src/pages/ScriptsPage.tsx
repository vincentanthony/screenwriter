import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScriptsList } from '@/features/scripts-list/ScriptsList';
import { useScriptsList } from '@/hooks/useScriptsList';

export function ScriptsPage() {
  const { scripts, isLoading, create, remove } = useScriptsList();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const navigate = useNavigate();

  const handleCreate = async () => {
    const trimmed = title.trim() || 'Untitled';
    const script = await create(trimmed);
    setTitle('');
    setOpen(false);
    navigate(`/scripts/${script.id}`);
  };

  return (
    <div className="container py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Screenwriter</h1>
          <p className="text-muted-foreground">Your local scripts, stored in this browser.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              New Script
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Script</DialogTitle>
              <DialogDescription>Give it a working title — you can change it later.</DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              placeholder="Working title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <ScriptsList scripts={scripts} onDelete={remove} />
      )}
    </div>
  );
}
