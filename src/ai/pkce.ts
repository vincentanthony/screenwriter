/**
 * RFC 7636-compliant PKCE helpers.
 *
 * No external dependency — Web Crypto is available in all browsers
 * we target and in Node 20+. The only surface we expose is:
 *
 *   - randomUrlSafe(byteLength): base64url-encoded random bytes
 *   - sha256Base64Url(input):    base64url(sha256(utf8(input)))
 *   - makePkcePair():            { verifier, challenge } convenience
 *   - randomState():             cryptographically random hex string
 *
 * Base64URL encoding per RFC 4648 §5: standard base64, then
 * `+` → `-`, `/` → `_`, and padding `=` stripped.
 */

function base64UrlEncode(bytes: Uint8Array): string {
  // btoa() operates on binary strings, so we have to hand it one.
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Return `byteLength` cryptographically-random bytes encoded as a
 * base64url string without padding. RFC 7636 requires the code
 * verifier to be between 43 and 128 characters from the URL-safe
 * alphabet — 32 bytes → 43 base64url characters, right at the floor
 * of the spec and matches what OpenCode / Codex CLI use.
 */
export function randomUrlSafe(byteLength: number): string {
  const buf = new Uint8Array(byteLength);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

/**
 * SHA-256 digest of the input, encoded base64url-unpadded. Used to
 * derive the PKCE code_challenge from the verifier.
 */
export async function sha256Base64Url(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return base64UrlEncode(new Uint8Array(digest));
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/**
 * Generate a 32-byte verifier and its S256 challenge in one call.
 * The caller stores the verifier across the OAuth redirect and sends
 * it with the token-exchange request.
 */
export async function makePkcePair(): Promise<PkcePair> {
  const verifier = randomUrlSafe(32);
  const challenge = await sha256Base64Url(verifier);
  return { verifier, challenge };
}

/**
 * Random hex state parameter for OAuth CSRF protection. 32 bytes →
 * 64 hex chars is well past any brute-force concern.
 */
export function randomState(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    out += buf[i].toString(16).padStart(2, '0');
  }
  return out;
}
