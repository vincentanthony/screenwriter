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

  const rename = useCallback(
    async (id: string, newTitle: string) => {
      // Trim here so the UI layer never has to care. An empty string
      // is allowed — the list row renders "Untitled" for empty titles,
      // matching how we already handle titleless scripts.
      const trimmed = newTitle.trim();
      await getRepository().update(id, { title: trimmed });
      await refresh();
    },
    [refresh],
  );

  return { scripts, isLoading, create, remove, rename, refresh };
}
