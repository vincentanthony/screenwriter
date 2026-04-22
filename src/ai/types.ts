/**
 * Shared types for the AI provider layer.
 *
 * Kept deliberately small: just enough for a request/response round
 * trip. Streaming, tool use, and image input are deferred — add them
 * when a concrete feature needs them, not speculatively.
 */

/** Chat-style message turn. System prompts ride alongside, not inside. */
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/** What the provider returns after a successful generation. */
export interface AIResponse {
  content: string;
  /** Optional token accounting; providers that don't report it omit it. */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Discriminator for typed AI failures. Callers should switch on `kind`
 * to decide how to recover / what to show the user.
 *
 *   not_authenticated — token missing, expired, or refresh failed.
 *                       UI prompts to sign in again.
 *   rate_limited      — HTTP 429 or equivalent. Back off and retry.
 *   network_error     — fetch() itself rejected (offline, DNS, CORS).
 *   model_error       — 5xx from the upstream API. Transient; retry ok.
 *   unknown           — anything else. Bug-report territory.
 */
export type AIErrorKind =
  | 'not_authenticated'
  | 'rate_limited'
  | 'network_error'
  | 'model_error'
  | 'unknown';

export class AIError extends Error {
  readonly kind: AIErrorKind;
  readonly cause?: unknown;

  constructor(kind: AIErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = 'AIError';
    this.kind = kind;
    this.cause = cause;
    // Preserve prototype chain across the ES5 Error target — without this,
    // `err instanceof AIError` is false after transpilation.
    Object.setPrototypeOf(this, AIError.prototype);
  }
}
