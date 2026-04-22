import { Link } from 'react-router-dom';
import { useAIUsageToday } from '@/hooks/useAIUsageToday';
import { formatCostFineCents } from '@/ai/pricing';

/**
 * Tiny "AI today" readout that lives next to Export in the top bar.
 *
 * Shows:
 *   "AI today: $0.014 (3)"   when there are calls today
 *   "AI: $0.00"              when authenticated but no calls yet
 *   (hidden)                 when no API key is configured
 *
 * Clicking navigates to /usage. Presence + always-visible cost is
 * non-negotiable once AI is configured — the whole point is that
 * writers see what calls cost in real time.
 */
export function AICostIndicator() {
  const { costCents, callCount, hasKey, loading } = useAIUsageToday();

  // Hide entirely until AI is configured — no point inviting the user
  // to a readout that means nothing.
  if (!hasKey) return null;
  // First render after mount, before the initial repo read lands.
  // Render a narrow placeholder so the bar doesn't jump when the
  // real value arrives.
  if (loading) {
    return (
      <span
        className="inline-flex items-center text-xs text-muted-foreground/60"
        aria-hidden
      >
        AI: …
      </span>
    );
  }

  const costLabel = formatCostFineCents(costCents);
  const label =
    callCount === 0 ? `AI: ${costLabel}` : `AI today: ${costLabel} (${callCount})`;

  return (
    <Link
      to="/usage"
      className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      aria-label={`AI usage today: ${costLabel}, ${callCount} calls. Click to open the Usage page.`}
      data-testid="ai-cost-indicator"
    >
      {label}
    </Link>
  );
}
