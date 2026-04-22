import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUp, Plus } from 'lucide-react';
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
import { parseFDX } from '@/export/fdx/parseFDX';
import { serialize } from '@/fountain/serialize';
import type { ScreenplayElement } from '@/fountain/types';
import { getRepository } from '@/storage/repository';
import { ScriptsList } from '@/features/scripts-list/ScriptsList';
import { useScriptsList } from '@/hooks/useScriptsList';

/**
 * Import state surfaces two distinct failures:
 *   - A thrown parseFDX (malformed XML, wrong root, file read error)
 *     → show an error dialog, don't create a script.
 *   - A non-empty warnings array → script created normally, warnings
 *     handed off via navigate(location.state) for the editor to show
 *     as a dismissible banner.
 */
type ImportError = { message: string } | null;

export function ScriptsPage() {
  const { scripts, isLoading, create, remove, refresh } = useScriptsList();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [importError, setImportError] = useState<ImportError>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleCreate = async () => {
    const trimmed = title.trim() || 'Untitled';
    const script = await create(trimmed);
    setTitle('');
    setOpen(false);
    navigate(`/scripts/${script.id}`);
  };

  const handleImportClick = () => {
    // Reset any stale file selection so picking the SAME file twice in
    // a row still fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = '';
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const xml = await file.text();
      const parsed = parseFDX(xml);

      // Build a combined element list with the title page prepended so
      // the Fountain serializer emits it at the top of the file.
      const allElements: ScreenplayElement[] = [];
      if (parsed.titlePage && parsed.titlePage.length > 0) {
        allElements.push({ type: 'title-page', fields: parsed.titlePage });
      }
      allElements.push(...parsed.elements);
      const fountain = serialize(allElements);

      // Derive a title: prefer the title page's Title field, fall back
      // to the filename minus .fdx, fall back to "Imported Script".
      const titleFromPage =
        parsed.titlePage?.find((f) => f.key === 'Title')?.value.trim() ?? '';
      const derivedTitle =
        titleFromPage.length > 0
          ? titleFromPage
          : file.name.replace(/\.fdx$/i, '') || 'Imported Script';

      const script = await getRepository().create({
        title: derivedTitle,
        fountain,
        importedPageBreaks: parsed.recordedPageBreaks,
      });
      await refresh();

      navigate(`/scripts/${script.id}`, {
        state:
          parsed.warnings.length > 0 ? { importWarnings: parsed.warnings } : undefined,
      });
    } catch (err) {
      setImportError({ message: (err as Error).message });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="container py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Screenwriter</h1>
          <p className="text-muted-foreground">Your local scripts, stored in this browser.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleImportClick}>
            <FileUp className="h-4 w-4" />
            Import…
          </Button>
          {/* Hidden file input, triggered by the Import button. We can't
              style <input type="file"> directly, hence the button proxy. */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".fdx,application/xml,text/xml"
            className="hidden"
            onChange={handleFileSelect}
          />
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
                <DialogDescription>
                  Give it a working title — you can change it later.
                </DialogDescription>
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
        </div>
      </header>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <ScriptsList scripts={scripts} onDelete={remove} />
      )}

      {/* Import-failure dialog. Non-blocking — user can dismiss and
          try again with a different file. */}
      <Dialog
        open={importError !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setImportError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import failed</DialogTitle>
            <DialogDescription>
              The file couldn&rsquo;t be read as Final Draft XML.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{importError?.message}</p>
          <DialogFooter>
            <Button autoFocus onClick={() => setImportError(null)}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
