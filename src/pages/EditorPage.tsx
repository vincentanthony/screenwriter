import { useParams } from 'react-router-dom';

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="container py-12">
      <p className="text-muted-foreground">Editor goes here (script id: {id})</p>
    </div>
  );
}
