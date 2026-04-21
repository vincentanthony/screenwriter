import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ScriptMeta } from '@/types/script';

interface Props {
  scripts: ScriptMeta[];
  onDelete: (id: string) => void;
}

export function ScriptsList({ scripts, onDelete }: Props) {
  if (scripts.length === 0) {
    return <p className="text-muted-foreground">No scripts yet — create one to get started.</p>;
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {scripts.map((script) => (
        <li key={script.id}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>
                <Link to={`/scripts/${script.id}`} className="hover:underline">
                  {script.title || 'Untitled'}
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
                onClick={() => onDelete(script.id)}
                aria-label={`Delete ${script.title || 'Untitled'}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
