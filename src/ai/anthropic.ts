/**
 * ⚠️ DEV-ONLY PROVIDER. This file makes DIRECT browser-to-Anthropic
 * API calls. It stores the user's Anthropic API key in localStorage
 * (see ./apiKeyStore.ts) and sends it on every request with the
 * `anthropic-dangerous-direct-browser-access: true` header that
 * Anthropic itself requires before it will accept a browser origin
 * on the Messages API.
 *
 * Why that header exists: Anthropic's API is designed to be called
 * from a backend with the key never touching end-user hardware. The
 * "dangerous" header is the opt-in that says "yes, I know, I'm
 * shipping my key to a browser." It's acceptable here because:
 *
 *   1. The app is local-only; there is no distribution channel.
 *   2. The user and the developer are the same person.
 *   3. The AIProvider abstraction makes swapping this whole file
 *      for a backend-proxy provider a one-file change.
 *
 * BEFORE this app ships publicly — or is shared with anyone else —
 * this file must be replaced with a provider that routes requests
 * through a backend that holds the key. The settings UI will need
 * to change accordingly (auth handshake rather than key paste).
 *
 * Do not remove this warning. Do not bypass it with "just for testing".
 */

import { computeCost } from './pricing';
import type { AIProvider } from './provider';
import { clearApiKey, readApiKey, writeApiKey } from './apiKeyStore';
import { AIError, type AIResponse, type Message } from './types';
import type { UsageRecord } from '@/types/usage';
import { getUsageRepository } from '@/storage/repository';

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

export const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Default Claude model for this app. The string is the API-facing
 * model id (see https://docs.claude.com/en/docs/about-claude/models).
 * Hardcoded here rather than UI-selectable — one file change to swap
 * until a "model" setting actually earns its keep.
 */
export const DEFAULT_MODEL = 'claude-sonnet-4-5';

/**
 * Max tokens the model is allowed to emit per response. Scene-level
 * feedback (the largest v2 workload) doesn't benefit from anything
 * larger; raising this only raises worst-case cost.
 */
export const DEFAULT_MAX_TOKENS = 2048;

/**
 * Anthropic's published API version. Bumping this is an explicit
 * opt-in to schema changes — don't track "latest" silently.
 */
const API_VERSION = '2023-06-01';

// ──────────────────────────────────────────────────────────────────────────
// Request/response shapes (permissive — extra fields ignored)
// ──────────────────────────────────────────────────────────────────────────

interface MessagesApiBody {
  id?: string;
  model?: string;
  role?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

/**
 * Build the Anthropic Messages API request body. Exported so unit
 * tests can assert the wire shape without network.
 */
export function buildRequestBody(params: {
  model: string;
  maxTokens: number;
  systemPrompt?: string;
  messages: Message[];
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.maxTokens,
    messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
  };
  const sys = params.systemPrompt?.trim();
  if (sys && sys.length > 0) {
    body.system = sys;
  }
  return body;
}

/**
 * Pull the assistant's text out of a Messages API response.
 * Walks `content[]` concatenating every `text` block in order; skips
 * any non-text block types (tool use, etc.) so future feature work
 * doesn't have to rewrite this.
 */
export function extractText(body: MessagesApiBody): string {
  const parts: string[] = [];
  for (const c of body.content ?? []) {
    if (c.type && c.type !== 'text') continue;
    if (typeof c.text === 'string') parts.push(c.text);
  }
  return parts.join('');
}

// ──────────────────────────────────────────────────────────────────────────
// Provider implementation
// ──────────────────────────────────────────────────────────────────────────

class AnthropicProvider implements AIProvider {
  readonly name = 'Anthropic (Claude)';

  async isAuthenticated(): Promise<boolean> {
    return readApiKey() !== null;
  }

  /**
   * No OAuth dance for API keys — the Settings panel handles key
   * entry directly via `setApiKey()`. `signIn()` is a no-op kept
   * for AIProvider conformance. Resolved, not rejected, so callers
   * that await it don't break.
   */
  async signIn(): Promise<void> {
    // Intentionally empty. See AISettingsPanel for the real flow.
  }

  async signOut(): Promise<void> {
    clearApiKey();
  }

  async generateResponse(params: {
    systemPrompt?: string;
    messages: Message[];
    feature: string;
    scriptId?: string;
  }): Promise<AIResponse> {
    const apiKey = readApiKey();
    if (!apiKey) {
      throw new AIError(
        'not_authenticated',
        'No Anthropic API key stored. Add one in the AI Settings panel.',
      );
    }

    const feature = normalizeFeature(params.feature);

    const body = buildRequestBody({
      model: DEFAULT_MODEL,
      maxTokens: DEFAULT_MAX_TOKENS,
      systemPrompt: params.systemPrompt,
      messages: params.messages,
    });

    let res: Response;
    try {
      res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
          // Required for browser calls; see top-of-file warning.
          'anthropic-dangerous-direct-browser-access': 'true',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new AIError('network_error', 'Could not reach api.anthropic.com', err);
    }

    if (res.status === 401 || res.status === 403) {
      throw new AIError(
        'not_authenticated',
        'Anthropic rejected the API key. Verify it in the AI Settings panel.',
      );
    }
    if (res.status === 429) {
      throw new AIError('rate_limited', 'Anthropic is rate-limiting this session.');
    }
    if (res.status >= 500) {
      throw new AIError('model_error', `Anthropic returned HTTP ${res.status}.`);
    }
    if (!res.ok) {
      // Read the body but do NOT log the request — headers contain
      // the API key. Error bodies are Anthropic-generated text,
      // safe to surface.
      const text = await res.text().catch(() => '');
      throw new AIError('unknown', `Anthropic returned HTTP ${res.status}: ${text}`);
    }

    let parsed: MessagesApiBody;
    try {
      parsed = (await res.json()) as MessagesApiBody;
    } catch (err) {
      throw new AIError('unknown', 'Anthropic response was not valid JSON', err);
    }

    const content = extractText(parsed);
    const inputTokens = parsed.usage?.input_tokens ?? 0;
    const outputTokens = parsed.usage?.output_tokens ?? 0;
    const model = parsed.model ?? DEFAULT_MODEL;

    // Record the call before returning. Failures to write the log
    // are non-fatal — the response itself already succeeded and the
    // user has a right to see it; losing an audit row beats losing
    // the generation. We do log the repo error, though, because
    // silent corruption of the cost ledger would be worse.
    const costCents = computeCost(model, inputTokens, outputTokens);
    try {
      await getUsageRepository().create({
        timestamp: Date.now(),
        provider: 'anthropic',
        model,
        inputTokens,
        outputTokens,
        costCents,
        feature,
        scriptId: params.scriptId,
        context: 'dev',
      } satisfies Omit<UsageRecord, 'id'>);
      notifyUsageRecorded();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[ai/anthropic] Failed to write usage record:', err);
    }

    return {
      content,
      usage:
        parsed.usage?.input_tokens !== undefined &&
        parsed.usage.output_tokens !== undefined
          ? { inputTokens, outputTokens }
          : undefined,
    };
  }
}

function normalizeFeature(feature: string | undefined): string {
  const trimmed = feature?.trim();
  if (!trimmed) {
    // eslint-disable-next-line no-console
    console.warn(
      '[ai/anthropic] generateResponse called without a `feature` label — ' +
        'recording as "unknown". Every call site should name its feature.',
    );
    return 'unknown';
  }
  return trimmed;
}

// ──────────────────────────────────────────────────────────────────────────
// Usage-recording notifier — lets the ambient indicator react
// ──────────────────────────────────────────────────────────────────────────

/**
 * The cost indicator in the top bar needs to refresh right after an
 * AI call completes. Rather than thread a state setter through every
 * feature that might one day make AI calls, we publish a simple
 * "usage recorded" event on the window and let the indicator
 * subscribe. DOM CustomEvent keeps the AI layer decoupled from React.
 */
export const USAGE_RECORDED_EVENT = 'screenwriter:usage-recorded';

function notifyUsageRecorded(): void {
  try {
    window.dispatchEvent(new CustomEvent(USAGE_RECORDED_EVENT));
  } catch {
    // In non-DOM environments (should never happen in the app, but
    // can happen in some test setups) we swallow — the event is a
    // notification, not a correctness requirement.
  }
}

/** Test-only: overwrite the stored API key directly. */
export function setApiKey(key: string): void {
  writeApiKey(key);
}

export const anthropicProvider: AIProvider = new AnthropicProvider();
