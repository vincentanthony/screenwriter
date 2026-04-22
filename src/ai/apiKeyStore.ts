/**
 * Anthropic API key persistence.
 *
 * ⚠️ DEV-ONLY. localStorage is NOT a secure store. Any script on the
 * same origin can read the key, including browser extensions with
 * content-script access. This is acceptable pre-launch for a local
 * personal dev tool, where the user and the developer are the same
 * person.
 *
 * Before this app ships publicly, the Anthropic provider must be
 * replaced with one that routes through a backend proxy and stores
 * the API key server-side. See src/ai/anthropic.ts for the matching
 * dev-only warning.
 */

export const API_KEY_STORAGE = 'screenwriter:ai:anthropic:key';

/** `null` when nothing is stored. Empty strings are treated as unset. */
export function readApiKey(): string | null {
  try {
    const raw = localStorage.getItem(API_KEY_STORAGE);
    if (raw === null || raw.length === 0) return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeApiKey(key: string): void {
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    localStorage.removeItem(API_KEY_STORAGE);
    return;
  }
  localStorage.setItem(API_KEY_STORAGE, trimmed);
}

export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE);
}

/**
 * Produce a masked display form — shows the first 8 and last 4
 * characters of the key, hiding the middle. Used in the Settings
 * panel so the user can verify which key is stored without
 * exposing the full secret on screen.
 *
 *   maskApiKey("sk-ant-api03-xxxxxxxxxxxxxxxxABCD")
 *     → "sk-ant-a…ABCD"
 *
 * Keys shorter than 16 chars are fully masked ("…") since there's
 * not enough to safely split.
 */
export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length < 16) return '…';
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
}
