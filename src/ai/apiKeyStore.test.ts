import { afterEach, describe, expect, it } from 'vitest';
import {
  API_KEY_STORAGE,
  clearApiKey,
  maskApiKey,
  readApiKey,
  writeApiKey,
} from './apiKeyStore';

afterEach(() => {
  localStorage.clear();
});

describe('apiKeyStore — round trip', () => {
  it('returns null when nothing is stored', () => {
    expect(readApiKey()).toBeNull();
  });

  it('writeApiKey + readApiKey round-trips a stored key', () => {
    writeApiKey('sk-ant-api03-xxxx');
    expect(readApiKey()).toBe('sk-ant-api03-xxxx');
  });

  it('writeApiKey trims surrounding whitespace', () => {
    writeApiKey('   sk-ant-abc   ');
    expect(readApiKey()).toBe('sk-ant-abc');
  });

  it('writeApiKey with empty/whitespace clears the key', () => {
    writeApiKey('sk-ant-abc');
    writeApiKey('   ');
    expect(readApiKey()).toBeNull();
    expect(localStorage.getItem(API_KEY_STORAGE)).toBeNull();
  });

  it('clearApiKey removes the entry', () => {
    writeApiKey('sk-ant-abc');
    clearApiKey();
    expect(readApiKey()).toBeNull();
  });
});

describe('apiKeyStore — maskApiKey', () => {
  it('shows first 8 + last 4 for a long key', () => {
    const key = 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234';
    // first 8 = "sk-ant-a", last 4 = "1234"
    expect(maskApiKey(key)).toBe('sk-ant-a…1234');
  });

  it('fully masks a short string', () => {
    expect(maskApiKey('short')).toBe('…');
    expect(maskApiKey('')).toBe('…');
  });
});
