/**
 * Token persistence for the OpenAI Codex OAuth provider.
 *
 * IMPORTANT: localStorage is NOT a secure store. Any script running
 * on the same origin can read these tokens, and browser extensions
 * can too. This is an acceptable trade-off for a local personal dev
 * tool where the app and the user are the same entity. If this app
 * ever grows a shared/multi-user surface, tokens must move behind
 * a backend proxy that holds refresh tokens server-side.
 *
 * We store everything under a single JSON blob keyed by
 * `TOKEN_STORAGE_KEY` so sign-out is a single `removeItem` call and
 * partial writes can't leave the store in an inconsistent state.
 */

export const TOKEN_STORAGE_KEY = 'screenwriter:ai:openai-codex:tokens';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** Absolute expiry time, epoch ms. */
  expiresAt: number;
  /** Optional, present when the OAuth response's id_token carried an email. */
  email?: string;
}

/**
 * Read the stored tokens. Returns null when nothing is stored or the
 * blob is malformed (treating corruption as "not signed in" rather
 * than throwing — any recovery path is identical to a fresh install).
 */
export function readTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isStoredTokens(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeTokens(tokens: StoredTokens): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/**
 * Window within which a token is considered "about to expire" and
 * should be refreshed before use. Five minutes gives plenty of slack
 * for clock skew and for the API call itself to finish before the
 * real expiry.
 */
export const REFRESH_SKEW_MS = 5 * 60 * 1000;

/** `true` if the token is expired or will expire inside the skew window. */
export function isNearExpiry(tokens: StoredTokens, now: number = Date.now()): boolean {
  return tokens.expiresAt - now <= REFRESH_SKEW_MS;
}

function isStoredTokens(value: unknown): value is StoredTokens {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.accessToken === 'string' &&
    typeof v.refreshToken === 'string' &&
    typeof v.expiresAt === 'number' &&
    (v.email === undefined || typeof v.email === 'string')
  );
}
