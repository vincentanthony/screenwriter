import { useEffect, useMemo, useRef } from 'react';
import { debounce, type Debounced } from '@/lib/debounce';

export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): Debounced<Args> {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const debounced = useMemo(
    () => debounce<Args>((...args) => fnRef.current(...args), waitMs),
    [waitMs],
  );

  useEffect(() => () => debounced.cancel(), [debounced]);

  return debounced;
}
