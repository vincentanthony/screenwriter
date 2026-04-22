import { afterEach, describe, expect, it } from 'vitest';
import {
  clearTokens,
  isNearExpiry,
  readTokens,
  REFRESH_SKEW_MS,
  TOKEN_STORAGE_KEY,
  writeTokens,
  type StoredTokens,
} from './tokenStore';

afterEach(() => {
  localStorage.clear();
});

describe('tokenStore — round trip', () => {
  it('readTokens() returns null when nothing is stored', () => {
    expect(readTokens()).toBeNull();
  });

  it('writeTokens() then readTokens() returns the same payload', () => {
    const t: StoredTokens = {
      accessToken: 'a-token',
      refreshToken: 'r-token',
      expiresAt: 1_700_000_000_000,
      email: 'user@example.com',
    };
    writeTokens(t);
    expect(readTokens()).toEqual(t);
  });

  it('clearTokens() removes the entry', () => {
    writeTokens({
      accessToken: 'x',
      refreshToken: 'y',
      expiresAt: 1,
    });
    clearTokens();
    expect(readTokens()).toBeNull();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('returns null (does not throw) when the stored blob is malformed', () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'not json at all');
    expect(readTokens()).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    localStorage.setItem(
      TOKEN_STORAGE_KEY,
      JSON.stringify({ accessToken: 'a' }), // missing refreshToken + expiresAt
    );
    expect(readTokens()).toBeNull();
  });
});

describe('tokenStore — isNearExpiry', () => {
  const base: StoredTokens = {
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: 0,
  };

  it('is true when expiresAt is in the past', () => {
    const now = 1_000_000;
    expect(isNearExpiry({ ...base, expiresAt: now - 1 }, now)).toBe(true);
  });

  it('is true when expiresAt is within the skew window', () => {
    const now = 1_000_000;
    expect(
      isNearExpiry({ ...base, expiresAt: now + REFRESH_SKEW_MS - 1 }, now),
    ).toBe(true);
  });

  it('is false when expiresAt is safely in the future', () => {
    const now = 1_000_000;
    expect(
      isNearExpiry({ ...base, expiresAt: now + REFRESH_SKEW_MS + 60_000 }, now),
    ).toBe(false);
  });
});
