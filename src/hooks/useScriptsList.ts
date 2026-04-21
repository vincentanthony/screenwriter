import { useCallback, useEffect, useState } from 'react';
import { getRepository } from '@/storage/repository';
import type { ScriptMeta } from '@/types/script';

export function useScriptsList() {
  const [scripts, setScripts] = useState<ScriptMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await getRepository().list();
    setScripts(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await getRepository().list();
      if (!cancelled) {
        setScripts(next);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const create = useCallback(
    async (title: string) => {
      const script = await getRepository().create({ title, fountain: 'UNTITLED\n' });
      await refresh();
      return script;
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await getRepository().delete(id);
      await refresh();
    },
    [refresh],
  );

  return { scripts, isLoading, create, remove, refresh };
}
