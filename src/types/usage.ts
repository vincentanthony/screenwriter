/**
 * One row in the AI-call audit log.
 *
 * Written by the AI provider layer on every successful generateResponse
 * call. Read by the Usage page and the ambient cost indicator. Kept
 * intentionally flat — no nested objects — so Dexie can index on fields
 * like timestamp or scriptId without wrapper gymnastics.
 *
 * `costCents` is an INTEGER. All arithmetic on cost values happens in
 * integer cents; display-layer formatters convert to dollars at render
 * time. See src/ai/pricing.ts for the math.
 */
export interface UsageRecord {
  id: string;

  /** Epoch ms. Indexed. */
  timestamp: number;

  /** Provider key, e.g. "anthropic". Indexed. */
  provider: string;

  /** Model id as sent to the provider, e.g. "claude-sonnet-4-5". */
  model: string;

  inputTokens: number;
  outputTokens: number;

  /** Integer cents. Authoritative; never store fractional dollars. */
  costCents: number;

  /**
   * Caller-provided feature label — "hello-world", "scene-feedback",
   * etc. Indexed so the Usage page can group by feature later.
   */
  feature: string;

  /** Optional script association for per-script cost breakdowns. Indexed. */
  scriptId?: string;

  /**
   * Whether the call was made directly from the browser (dev only)
   * or routed through a backend proxy ("user"). Recorded so that when
   * we ship publicly we can distinguish real user traffic from the
   * pre-launch dev mode's footprint.
   */
  context: 'dev' | 'user';

  /** Reserved for future backend use. Not indexed today. */
  sessionId?: string;
}
