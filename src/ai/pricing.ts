/**
 * Anthropic model pricing (USD per million tokens).
 *
 * As of April 2026 — verify against https://www.anthropic.com/pricing
 * before shipping anywhere cost-sensitive.
 *
 * Prices are split into input and output rates; Anthropic publishes
 * both and they diverge materially (output is always more expensive).
 */
export interface ModelRates {
  /** USD per 1,000,000 input tokens. */
  input: number;
  /** USD per 1,000,000 output tokens. */
  output: number;
}

export const MODEL_RATES: Record<string, ModelRates> = {
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-opus-4-7': { input: 5.0, output: 25.0 },
};

/**
 * Compute the cost of a single API call in integer cents.
 *
 * Why integer cents: floating-point dollars bite at aggregation time
 * ($0.01 + $0.02 !== $0.03 on many budgets). Integer cents keep all
 * totals exact; conversion to dollars happens at display-time.
 *
 * For an unknown model we return 0 and warn — a new model landing in
 * the wild shouldn't crash the app, it just shows $0 cost until the
 * rate table is updated.
 */
export function computeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = MODEL_RATES[model];
  if (!rate) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ai/pricing] Unknown model "${model}" — costs recorded as 0 cents. ` +
        `Update MODEL_RATES in src/ai/pricing.ts.`,
    );
    return 0;
  }
  // USD/1e6 tokens × tokens = USD. × 100 → cents. Round once at the end.
  const inputCents = (rate.input * inputTokens * 100) / 1_000_000;
  const outputCents = (rate.output * outputTokens * 100) / 1_000_000;
  return Math.round(inputCents + outputCents);
}

/**
 * Format a cost in integer cents as a dollar string. Small amounts
 * (< $0.01) get four decimals so sub-cent calls don't look free;
 * $0.01 and up round to two decimals.
 *
 * Examples:
 *   formatCostCents(0)      → "$0.00"
 *   formatCostCents(1)      → "$0.01"
 *   formatCostCents(12)     → "$0.12"
 *   formatCostCents(1234)   → "$12.34"
 *   formatCostFractional(0.32)   → "$0.0032"  (via computeCostFractional helper)
 *
 * For the "< 1 cent" case we need sub-cent precision, so
 * formatCostCents is wrapped by formatCostExact which takes raw
 * fractional cents from a separate code path. In practice: the Usage
 * page cares about two-decimal totals; the ambient indicator and
 * per-call rows want sub-cent precision when relevant.
 */
export function formatCostCents(costCents: number): string {
  if (costCents === 0) return '$0.00';
  // $0.01 and above — normal two-decimal format.
  const dollars = costCents / 100;
  return `$${dollars.toFixed(2)}`;
}

/**
 * Four-decimal format for sub-cent display. Used in per-row and
 * per-indicator contexts where rounding to $0.01 would make tiny
 * calls look free. Takes fractional cents (a plain number) so the
 * caller can pass the un-rounded value when they have it.
 */
export function formatCostFineCents(fineCents: number): string {
  if (fineCents === 0) return '$0.0000';
  const dollars = fineCents / 100;
  // Four decimals for anything below a full cent; two decimals when
  // the amount is $0.01 or more (avoid $0.1200 noise).
  return dollars < 0.01 ? `$${dollars.toFixed(4)}` : `$${dollars.toFixed(2)}`;
}

/**
 * Pre-rounding cost in fractional cents. Useful when formatting a
 * single row whose integer-cent value is 0 but the real cost isn't —
 * e.g. 150 input tokens of Sonnet is 0.045 cents, which rounds to 0
 * but reads as "$0.0005" in the table.
 */
export function computeCostFineCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = MODEL_RATES[model];
  if (!rate) return 0;
  const inputCents = (rate.input * inputTokens * 100) / 1_000_000;
  const outputCents = (rate.output * outputTokens * 100) / 1_000_000;
  return inputCents + outputCents;
}
