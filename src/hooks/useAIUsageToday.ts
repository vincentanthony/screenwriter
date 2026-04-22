import { useEffect, useState } from 'react';
import { USAGE_RECORDED_EVENT } from '@/ai';
import { getUsageRepository } from '@/storage/repository';

/**
 * Today's AI spend, read from the usage log.
 *
 * Returns:
 *   costCents  — total cents of AI usage since local midnight
 *   callCount  — number of calls logged today
 *   hasKey     — whether an Anthropic API key is stored. Used by the
 *                ambient indicator to decide whether to render at all;
 *                no point showing a cost readout before AI is set up.
 *   loading    — true during the initial repo read, false after
 *
 * The hook subscribes to USAGE_RECORDED_EVENT (fired by the AI
 * provider after each successful call) and re-queries. A keystorage
 * change elsewhere triggers a re-check on the next storage event
 * (for multi-tab consistency) and on mount.
 */
export function useAIUsageToday(): {
  costCents: number;
  callCount: number;
  hasKey: boolean;
  loading: boolean;
  refresh: () => void;
} {
  const [totals, setTotals] = useState<{ costCents: number; callCount: number }>({
    costCents: 0,
    callCount: 0,
  });
  const [hasKey, setHasKey] = useState<boolean>(() => hasApiKey());
  const [loading, setLoading] = useState<boolean>(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const start = startOfTodayMs();
      const t = await getUsageRepository().totalSince(start);
      if (cancelled) return;
      setTotals(t);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  // React to provider-fired events + multi-tab storage changes.
  useEffect(() => {
    const onUsage = () => setTick((n) => n + 1);
    const onStorage = (e: StorageEvent) => {
      // Key storage changes only — usage records live in IndexedDB,
      // which doesn't fire storage events. Storage events let us
      // notice key additions/removals across tabs.
      if (e.key === null || e.key.includes('anthropic:key')) {
        setHasKey(hasApiKey());
      }
    };
    window.addEventListener(USAGE_RECORDED_EVENT, onUsage);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(USAGE_RECORDED_EVENT, onUsage);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return {
    costCents: totals.costCents,
    callCount: totals.callCount,
    hasKey,
    loading,
    refresh: () => setTick((n) => n + 1),
  };
}

function hasApiKey(): boolean {
  try {
    const raw = localStorage.getItem('screenwriter:ai:anthropic:key');
    return raw !== null && raw.length > 0;
  } catch {
    return false;
  }
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
