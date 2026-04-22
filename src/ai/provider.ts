import type { AIResponse, Message } from './types';

/**
 * Provider-agnostic contract for any AI backend we support.
 *
 * Today there's exactly one implementation (OpenAI Codex OAuth).
 * Keeping the feature surface narrow — auth + generate — means a
 * second provider (Anthropic, local-model, etc.) is a single-file
 * drop-in without API churn through the rest of the app.
 *
 * All methods are async. Implementations MUST throw AIError (from
 * ./types) — not bare Error — so UI code can switch on kind to pick
 * the right recovery.
 */
export interface AIProvider {
  /** Human-readable name, e.g. "OpenAI (ChatGPT Plus)". Shown in UI. */
  readonly name: string;

  /**
   * Whether the user is currently signed in and we have a usable
   * (or refreshable) credential on disk. This does NOT guarantee the
   * next API call will succeed — only that we have something to try.
   */
  isAuthenticated(): Promise<boolean>;

  /**
   * Start the provider-specific sign-in flow (OAuth, API-key dialog,
   * whatever the provider needs). Resolves when the credential is
   * stored and the caller can proceed, rejects with AIError
   * 'not_authenticated' on user abort or failure.
   */
  signIn(): Promise<void>;

  /** Drop stored credentials. Safe to call when not signed in. */
  signOut(): Promise<void>;

  /**
   * Send a conversation turn to the model. The provider decides how
   * to map `systemPrompt` + `messages` onto its own API shape.
   *
   * Non-streaming in v1 — returns the full response once the model
   * is done. Streaming can be added as a separate method later.
   *
   * `feature` is a caller-supplied label (e.g. "hello-world",
   * "scene-feedback") that the provider records into the usage log
   * alongside the response. Required so every AI call is auditable
   * by origin. If a provider implementation receives an empty /
   * missing feature string it should substitute "unknown" and log
   * a warning — the app shouldn't break on an un-labeled call, but
   * it shouldn't hide it either.
   *
   * `scriptId` is optional, intended for future per-script cost
   * breakdowns; the AI layer simply stores it when present.
   */
  generateResponse(params: {
    systemPrompt?: string;
    messages: Message[];
    feature: string;
    scriptId?: string;
  }): Promise<AIResponse>;
}
