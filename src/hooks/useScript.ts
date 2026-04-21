import { useCallback, useEffect, useState } from 'react';
import { getRepository } from '@/storage/repository';
import type { Script } from '@/types/script';

export function useScript(id: string | undefined) {
  const [script, setScript] = useState<Script | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setScript(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      const next = await getRepository().get(id);
      if (!cancelled) {
        setScript(next);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const update = useCallback(
    async (patch: Partial<Pick<Script, 'title' | 'fountain'>>) => {
      if (!id) return;
      const next = await getRepository().update(id, patch);
      setScript(next);
    },
    [id],
  );

  return { script, isLoading, update };
}
