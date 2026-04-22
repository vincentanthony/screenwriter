import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { USAGE_RECORDED_EVENT } from '@/ai';
import {
  computeCostFineCents,
  formatCostCents,
  formatCostFineCents,
} from '@/ai/pricing';
import { getUsageRepository } from '@/storage/repository';
import type { UsageRecord } from '@/types/usage';

/**
 * AI usage log page.
 *
 * Three sections:
 *   1. Totals (Today / 7d / 30d) — queried from the repo at mount.
 *   2. Recent calls table — last 50 rows, newest first.
 *   3. Maintenance — delete-older-than-30-days with confirmation.
 *
 * Re-queries on USAGE_RECORDED_EVENT so if a call fires on another
 * tab (or a background navigation returns to this page) the numbers
 * stay fresh without a manual refresh.
 */

const RECENT_LIMIT = 50;
const CLEANUP_THRESHOLD_DAYS = 30;

interface Totals {
  costCents: number;
  callCount: number;
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function daysAgoMs(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

/**
 * Model-id shortener for the table. "claude-sonnet-4-5" → "Sonnet 4.5".
 * Falls back to the raw id for unrecognized shapes.
 */
function shortModel(model: string): string {
  const m = /^claude-(\w+)-(\d+)-(\d+)$/.exec(model);
  if (!m) return model;
  const family = m[1][0].toUpperCase() + m[1].slice(1);
  return `${family} ${m[2]}.${m[3]}`;
}

/**
 * Relative time label for the table.
 *
 *   - Today                 → "2:34 PM"
 *   - Yesterday             → "Yesterday 2:34 PM"
 *   - Otherwise this year   → "Apr 20, 2:34 PM"
 *   - Otherwise             → "Apr 20 2025, 2:34 PM"
 */
function formatWhen(ts: number, now = new Date()): string {
  const d = new Date(ts);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const timePart = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (d >= today) return timePart;
  if (d >= yesterday) return `Yesterday ${timePart}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const datePart = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
  return `${datePart}, ${timePart}`;
}

export function UsagePage() {
  const [today, setToday] = useState<Totals>({ costCents: 0, callCount: 0 });
  const [last7, setLast7] = useState<Totals>({ costCents: 0, callCount: 0 });
  const [last30, setLast30] = useState<Totals>({ costCents: 0, callCount: 0 });
  const [recent, setRecent] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupStatus, setCleanupStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const repo = getUsageRepository();
    const [t, w, m, r] = await Promise.all([
      repo.totalSince(startOfTodayMs()),
      repo.totalSince(daysAgoMs(7)),
      repo.totalSince(daysAgoMs(30)),
      repo.listRecent(RECENT_LIMIT),
    ]);
    setToday(t);
    setLast7(w);
    setLast30(m);
    setRecent(r);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const onEvent = () => refresh();
    window.addEventListener(USAGE_RECORDED_EVENT, onEvent);
    return () => window.removeEventListener(USAGE_RECORDED_EVENT, onEvent);
  }, [refresh]);

  const handleCleanup = useCallback(async () => {
    const cutoff = daysAgoMs(CLEANUP_THRESHOLD_DAYS);
    const removed = await getUsageRepository().deleteOlderThan(cutoff);
    setCleanupOpen(false);
    setCleanupStatus(
      removed === 0
        ? 'No records were older than 30 days.'
        : `Removed ${removed} record${removed === 1 ? '' : 's'}.`,
    );
    await refresh();
  }, [refresh]);

  return (
    <div className="container py-12">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">AI Usage</h1>
            <p className="text-sm text-muted-foreground">
              Cost and call history, recorded locally in your browser.
            </p>
          </div>
        </div>
      </header>

      {/* Totals */}
      <section
        className="mb-8 grid gap-4 sm:grid-cols-3"
        data-testid="usage-totals"
      >
        <TotalCard label="Today" totals={today} />
        <TotalCard label="Last 7 days" totals={last7} />
        <TotalCard label="Last 30 days" totals={last30} />
      </section>

      {/* Recent calls table */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Recent calls</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No AI calls yet. Configure an API key and use the Test connection
            button in the AI Settings drawer panel to try one.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Feature</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 text-right font-medium">Input</th>
                  <th className="px-3 py-2 text-right font-medium">Output</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => {
                  // Prefer fine-cents display so sub-cent calls read
                  // as "$0.0003" rather than "$0.00".
                  const fine = computeCostFineCents(
                    r.model,
                    r.inputTokens,
                    r.outputTokens,
                  );
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatWhen(r.timestamp)}
                      </td>
                      <td className="px-3 py-2">{r.feature}</td>
                      <td className="px-3 py-2">{shortModel(r.model)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.inputTokens.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.outputTokens.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCostFineCents(fine)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Maintenance */}
      <section className="border-t pt-6">
        <h2 className="mb-2 text-lg font-semibold">Maintenance</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => setCleanupOpen(true)}>
            Clear records older than 30 days
          </Button>
          {cleanupStatus && (
            <p className="text-sm text-muted-foreground">{cleanupStatus}</p>
          )}
        </div>
      </section>

      <Dialog
        open={cleanupOpen}
        onOpenChange={(open) => {
          if (!open) setCleanupOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear old usage records?</DialogTitle>
            <DialogDescription>
              Records older than 30 days will be permanently removed. Totals
              for recent windows (today / 7d / 30d) aren&rsquo;t affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              autoFocus
              onClick={() => setCleanupOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleCleanup}>
              Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TotalCard({ label, totals }: { label: string; totals: Totals }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {formatCostCents(totals.costCents)}
      </p>
      <p className="text-sm text-muted-foreground">
        {totals.callCount} call{totals.callCount === 1 ? '' : 's'}
      </p>
    </div>
  );
}
