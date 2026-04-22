import { makePkcePair, randomState } from './pkce';
import type { AIProvider } from './provider';
import {
  clearTokens,
  isNearExpiry,
  readTokens,
  writeTokens,
  type StoredTokens,
} from './tokenStore';
import { AIError, type AIResponse, type Message } from './types';

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

/**
 * OpenAI's public OAuth client id for the Codex app. Taken from the
 * OpenCode `openai-codex` auth plugin (numman-ali/opencode-openai-codex-auth)
 * and OpenAI's Codex CLI app-server. This is NOT a secret — it's the
 * equivalent of a public API key identifying which app is requesting
 * authorization. No secret exists for this flow; PKCE stands in for it.
 */
const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const RESPONSES_URL = 'https://api.openai.com/v1/responses';

const SCOPES = 'openid profile email offline_access';

/**
 * The Codex model used for generation. Easy to swap without a UI —
 * change the constant and rebuild. The Codex CLI currently defaults
 * to `gpt-5.2` for subscription-auth callers; if this returns 404
 * or "model not found", check what OpenCode is shipping.
 */
const CODEX_MODEL = 'gpt-5.2';

/**
 * Required system-prompt prefix for Codex OAuth callers. Without it
 * the Responses API rejects requests with 401 ("not authorized for
 * this client") even when the OAuth token is valid. Reverse-engineered
 * from OpenCode's openai-codex provider — if hello-world starts failing
 * with an "invalid system prompt" error, this constant is the first
 * thing to update. Source: OpenCode (numman-ali fork) + Codex CLI.
 */
const REQUIRED_CODEX_PREFIX =
  "You are Codex, based on GPT-5. You are running as a coding agent in the Codex CLI on a user's machine.";

/**
 * Redirect URI. This MUST match byte-for-byte between the /authorize
 * and /token calls. Vite serves the app on :5173 by default; we mount
 * a React route at /oauth/callback (see App.tsx + OAuthCallbackPage).
 *
 * In production (or a non-5173 dev environment) this needs to be
 * derived from window.location.origin — exported as a function so
 * tests can exercise the flow deterministically.
 */
export function getRedirectUri(): string {
  return `${window.location.origin}/oauth/callback`;
}

// ──────────────────────────────────────────────────────────────────────────
// Session-scoped state for a pending OAuth flow
// ──────────────────────────────────────────────────────────────────────────

const PENDING_KEY = 'screenwriter:ai:openai-codex:pending-oauth';

/**
 * Data persisted across the OAuth redirect so /oauth/callback can
 * finish the exchange. Lives in sessionStorage: auto-cleared when
 * the window closes, and survives the full-page nav back from
 * auth.openai.com.
 */
interface PendingOAuth {
  verifier: string;
  state: string;
  redirectUri: string;
}

function writePending(p: PendingOAuth): void {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
}

function readPending(): PendingOAuth | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingOAuth;
  } catch {
    return null;
  }
}

export function clearPending(): void {
  sessionStorage.removeItem(PENDING_KEY);
}

// ──────────────────────────────────────────────────────────────────────────
// OAuth callback handoff — callback page ↔ initiating tab
// ──────────────────────────────────────────────────────────────────────────

/**
 * When the provider's signIn() resolves, the actual token exchange
 * has already happened in /oauth/callback. The callback page writes
 * a completion record to sessionStorage and dispatches a storage
 * event; signIn()'s Promise resolves/rejects based on that record.
 *
 * Why this scheme over window.opener.postMessage:
 *   - Works whether the user lands in a new tab, the same tab, or
 *     a popup. No reliance on the window hierarchy surviving the
 *     redirect.
 *   - sessionStorage is per-origin, so the callback and the editor
 *     share it. (The `storage` event only fires in OTHER tabs, so
 *     the callback tab closes itself and the editor tab wakes up.)
 */
const COMPLETION_KEY = 'screenwriter:ai:openai-codex:oauth-result';

export interface OAuthCompletion {
  ok: boolean;
  error?: string;
}

export function writeOAuthCompletion(result: OAuthCompletion): void {
  sessionStorage.setItem(COMPLETION_KEY, JSON.stringify(result));
}

export function readAndClearOAuthCompletion(): OAuthCompletion | null {
  try {
    const raw = sessionStorage.getItem(COMPLETION_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(COMPLETION_KEY);
    return JSON.parse(raw) as OAuthCompletion;
  } catch {
    sessionStorage.removeItem(COMPLETION_KEY);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Token exchange / refresh
// ──────────────────────────────────────────────────────────────────────────

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in: number; // seconds
  token_type: string;
  scope?: string;
}

function isTokenResponse(value: unknown): value is TokenResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.access_token === 'string' &&
    typeof v.refresh_token === 'string' &&
    typeof v.expires_in === 'number'
  );
}

/**
 * Best-effort email extraction from an OIDC id_token. We don't
 * verify the signature — we already trust the issuer (we just
 * received this over TLS from auth.openai.com in response to our
 * own PKCE flow) and the email is cosmetic (shown in the Settings
 * dialog, nothing more). If parsing fails, we just don't show it.
 */
function emailFromIdToken(idToken: string | undefined): string | undefined {
  if (!idToken) return undefined;
  try {
    const parts = idToken.split('.');
    if (parts.length < 2) return undefined;
    // JWT payload is base64url without padding.
    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
    const json = atob(padded);
    const parsed = JSON.parse(json) as { email?: unknown };
    return typeof parsed.email === 'string' ? parsed.email : undefined;
  } catch {
    return undefined;
  }
}

function toStoredTokens(resp: TokenResponse, now: number = Date.now()): StoredTokens {
  return {
    accessToken: resp.access_token,
    refreshToken: resp.refresh_token,
    expiresAt: now + resp.expires_in * 1000,
    email: emailFromIdToken(resp.id_token),
  };
}

/**
 * Exchange an authorization `code` for tokens. Exported so
 * OAuthCallbackPage (which holds the verifier/state) can finish the
 * flow without the provider object.
 */
export async function exchangeCodeForTokens(params: {
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<StoredTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    client_id: OPENAI_CLIENT_ID,
    redirect_uri: params.redirectUri,
    code_verifier: params.verifier,
  });

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch (err) {
    throw new AIError('network_error', 'Could not reach auth.openai.com', err);
  }

  if (!res.ok) {
    throw new AIError(
      'not_authenticated',
      `OAuth token exchange failed (HTTP ${res.status})`,
    );
  }

  const json = (await res.json()) as unknown;
  if (!isTokenResponse(json)) {
    throw new AIError('unknown', 'OAuth token response was missing required fields');
  }
  return toStoredTokens(json);
}

async function refreshTokens(refreshToken: string): Promise<StoredTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: OPENAI_CLIENT_ID,
  });

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch (err) {
    throw new AIError('network_error', 'Could not reach auth.openai.com', err);
  }

  if (!res.ok) {
    throw new AIError('not_authenticated', `Token refresh failed (HTTP ${res.status})`);
  }

  const json = (await res.json()) as unknown;
  if (!isTokenResponse(json)) {
    throw new AIError('unknown', 'Refresh response was missing required fields');
  }
  return toStoredTokens(json);
}

/**
 * Return a currently-valid access token, refreshing first if we're
 * near expiry. Updates the persisted store as a side effect. Throws
 * AIError 'not_authenticated' when there's nothing to work with.
 */
async function getFreshAccessToken(): Promise<StoredTokens> {
  const stored = readTokens();
  if (!stored) {
    throw new AIError('not_authenticated', 'No stored credentials. Please sign in.');
  }
  if (!isNearExpiry(stored)) {
    return stored;
  }
  const refreshed = await refreshTokens(stored.refreshToken);
  writeTokens(refreshed);
  return refreshed;
}

// ──────────────────────────────────────────────────────────────────────────
// Responses API call + response parsing
// ──────────────────────────────────────────────────────────────────────────

/**
 * Shape of the pieces of the Responses API response we actually care
 * about. Permissive — extra fields are ignored, missing fields fall
 * back to reasonable defaults so upstream shape drift surfaces as
 * empty content rather than a crash.
 */
interface ResponsesApiBody {
  output?: Array<{
    type?: string;
    role?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

/**
 * Extract the assistant's text from a Responses API body. Tries,
 * in order:
 *   1. The convenience `output_text` field (when present).
 *   2. The assistant message in the `output[]` array, concatenating
 *      any `output_text` / `text` content items.
 * Returns '' if nothing matched — the caller decides whether that's
 * an error for their use case.
 */
export function extractAssistantText(body: ResponsesApiBody): string {
  if (typeof body.output_text === 'string' && body.output_text.length > 0) {
    return body.output_text;
  }
  const output = body.output ?? [];
  const parts: string[] = [];
  for (const item of output) {
    // Assistant messages carry type="message" and role="assistant".
    // Tool calls and reasoning items have different types — skip them.
    if (item.type && item.type !== 'message') continue;
    if (item.role && item.role !== 'assistant') continue;
    for (const c of item.content ?? []) {
      if (typeof c.text === 'string') parts.push(c.text);
    }
  }
  return parts.join('');
}

/**
 * Build the Responses API request body. Exported for unit tests so
 * we can assert the wire shape without network.
 */
export function buildRequestBody(params: {
  model: string;
  systemPrompt?: string;
  messages: Message[];
}): Record<string, unknown> {
  const finalInstructions = composeInstructions(params.systemPrompt);
  const input = params.messages.map((m) => ({
    role: m.role,
    content: [
      {
        // "input_text" for user turns, "output_text" for assistant turns
        // when echoing prior turns back into the conversation.
        type: m.role === 'assistant' ? 'output_text' : 'input_text',
        text: m.content,
      },
    ],
  }));
  return {
    model: params.model,
    instructions: finalInstructions,
    input,
  };
}

/**
 * Compose the final `instructions` string sent to the Responses API.
 * Always prefixes the Codex-required preamble; appends the caller's
 * own system prompt (if any) after a blank line.
 */
export function composeInstructions(userPrompt?: string): string {
  const trimmed = userPrompt?.trim();
  if (!trimmed) return REQUIRED_CODEX_PREFIX;
  return `${REQUIRED_CODEX_PREFIX}\n\n${trimmed}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Provider implementation
// ──────────────────────────────────────────────────────────────────────────

class OpenAICodexProvider implements AIProvider {
  readonly name = 'OpenAI (ChatGPT Plus)';

  async isAuthenticated(): Promise<boolean> {
    const stored = readTokens();
    return stored !== null;
  }

  /**
   * Kick off the PKCE flow. The flow spans a full-page redirect:
   * this call navigates the window to auth.openai.com, the user
   * signs in there, and the browser returns to /oauth/callback.
   * The callback route exchanges the code for tokens and writes a
   * completion record; we resolve/reject based on that record.
   *
   * A caller that awaits this Promise will typically never see it
   * resolve — the window navigates away first. That's intentional:
   * the completion handshake happens in /oauth/callback, and the
   * UI picks up the result when the editor tab reloads. The Promise
   * is kept so tests can drive the flow against a mocked redirect.
   */
  async signIn(): Promise<void> {
    const { verifier, challenge } = await makePkcePair();
    const state = randomState();
    const redirectUri = getRedirectUri();

    writePending({ verifier, state, redirectUri });

    // Clear any stale completion record before redirecting.
    sessionStorage.removeItem(COMPLETION_KEY);

    const authorizeUrl = new URL(AUTHORIZE_URL);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', OPENAI_CLIENT_ID);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('scope', SCOPES);
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('code_challenge', challenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');

    window.location.href = authorizeUrl.toString();

    // Unreachable in a real browser (location assignment navigates
    // away before the Promise can settle). Kept resolved so that in
    // a test environment that stubs window.location.href=, callers
    // can `await signIn()` without hanging.
    return;
  }

  async signOut(): Promise<void> {
    clearTokens();
    clearPending();
  }

  async generateResponse(params: {
    systemPrompt?: string;
    messages: Message[];
  }): Promise<AIResponse> {
    // First attempt with current (possibly refreshed) token. On 401,
    // force one refresh-and-retry — covers the case where the server
    // considers the token expired before our local clock does.
    let tokens = await getFreshAccessToken();

    let res = await callResponsesApi(tokens.accessToken, params);
    if (res.status === 401) {
      tokens = await refreshTokens(tokens.refreshToken);
      writeTokens(tokens);
      res = await callResponsesApi(tokens.accessToken, params);
    }

    if (res.status === 401) {
      // Both tries rejected — credential is dead, make the user re-auth.
      throw new AIError(
        'not_authenticated',
        'OpenAI rejected the credential. Please sign in again.',
      );
    }
    if (res.status === 429) {
      throw new AIError('rate_limited', 'OpenAI is rate-limiting this session.');
    }
    if (res.status >= 500) {
      throw new AIError('model_error', `OpenAI returned HTTP ${res.status}.`);
    }
    if (!res.ok) {
      // Read the body WITHOUT logging tokens. The body itself may
      // contain debug info useful for bug reports but does not echo
      // the Authorization header.
      const text = await res.text().catch(() => '');
      throw new AIError('unknown', `OpenAI returned HTTP ${res.status}: ${text}`);
    }

    let body: ResponsesApiBody;
    try {
      body = (await res.json()) as ResponsesApiBody;
    } catch (err) {
      throw new AIError('unknown', 'OpenAI response was not valid JSON', err);
    }

    const content = extractAssistantText(body);
    const usage =
      body.usage?.input_tokens !== undefined && body.usage.output_tokens !== undefined
        ? {
            inputTokens: body.usage.input_tokens,
            outputTokens: body.usage.output_tokens,
          }
        : undefined;
    return { content, usage };
  }
}

async function callResponsesApi(
  accessToken: string,
  params: { systemPrompt?: string; messages: Message[] },
): Promise<Response> {
  const body = buildRequestBody({
    model: CODEX_MODEL,
    systemPrompt: params.systemPrompt,
    messages: params.messages,
  });
  try {
    return await fetch(RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new AIError('network_error', 'Could not reach api.openai.com', err);
  }
}

/**
 * Singleton provider instance. Exported so the callback page can
 * call its helpers; application code should import from
 * `@/ai` (which re-exports this as the default provider).
 */
export const openaiCodexProvider: AIProvider = new OpenAICodexProvider();

/**
 * Finish a redirect-based OAuth flow. Called by /oauth/callback
 * with the querystring from OpenAI. Returns nothing on success,
 * throws AIError on failure — the caller is responsible for writing
 * an OAuthCompletion record.
 */
export async function finishOAuthRedirect(query: URLSearchParams): Promise<void> {
  const pending = readPending();
  if (!pending) {
    throw new AIError('not_authenticated', 'No pending OAuth flow — cannot complete.');
  }

  const errorParam = query.get('error');
  if (errorParam) {
    clearPending();
    const desc = query.get('error_description') ?? errorParam;
    throw new AIError('not_authenticated', `Sign-in declined: ${desc}`);
  }

  const returnedState = query.get('state');
  if (returnedState !== pending.state) {
    clearPending();
    throw new AIError('not_authenticated', 'OAuth state mismatch. Please try again.');
  }

  const code = query.get('code');
  if (!code) {
    clearPending();
    throw new AIError('not_authenticated', 'No authorization code in callback.');
  }

  const tokens = await exchangeCodeForTokens({
    code,
    verifier: pending.verifier,
    redirectUri: pending.redirectUri,
  });
  writeTokens(tokens);
  clearPending();
}
