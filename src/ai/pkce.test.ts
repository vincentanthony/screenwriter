import { describe, expect, it } from 'vitest';
import {
  makePkcePair,
  randomState,
  randomUrlSafe,
  sha256Base64Url,
} from './pkce';

describe('pkce — randomUrlSafe', () => {
  it('produces a base64url-alphabet string (no +, /, or = padding)', () => {
    const s = randomUrlSafe(32);
    // RFC 4648 §5 base64url alphabet only.
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s).not.toContain('=');
  });

  it('32 input bytes → 43 encoded characters (RFC 7636 verifier floor)', () => {
    // ceil(32 / 3) * 4 = 44; minus one stripped '=' pad = 43.
    expect(randomUrlSafe(32).length).toBe(43);
  });

  it('two successive calls produce distinct values (not a fixed seed)', () => {
    expect(randomUrlSafe(32)).not.toBe(randomUrlSafe(32));
  });
});

describe('pkce — sha256Base64Url', () => {
  it('matches the canonical RFC 7636 test vector', async () => {
    // From RFC 7636 Appendix B:
    //   verifier:  dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
    //   challenge: E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
    const challenge = await sha256Base64Url(
      'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    );
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('produces a base64url-alphabet string with no padding', () => {
    // Any input, any length.
    return sha256Base64Url('anything').then((d) => {
      expect(d).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(d.length).toBe(43); // 32-byte digest → 43 base64url chars
    });
  });
});

describe('pkce — makePkcePair', () => {
  it('the challenge is the S256 digest of the verifier', async () => {
    const { verifier, challenge } = await makePkcePair();
    expect(challenge).toBe(await sha256Base64Url(verifier));
  });

  it('verifier and challenge are both valid base64url-unpadded', async () => {
    const { verifier, challenge } = await makePkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verifier.length).toBe(43);
    expect(challenge.length).toBe(43);
  });
});

describe('pkce — randomState', () => {
  it('is a 64-character hex string (32 bytes)', () => {
    const s = randomState();
    expect(s).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs across calls', () => {
    expect(randomState()).not.toBe(randomState());
  });
});
