import { describe, expect, it } from 'vitest';
import { slugifyFilename } from './download';

describe('slugifyFilename', () => {
  it('replaces whitespace with single underscores', () => {
    expect(slugifyFilename('Hello World')).toBe('Hello_World');
    expect(slugifyFilename('a   b   c')).toBe('a_b_c');
  });

  it('trims leading/trailing whitespace and underscores', () => {
    expect(slugifyFilename('  Spaced Out  ')).toBe('Spaced_Out');
  });

  it('strips characters illegal on common filesystems', () => {
    expect(slugifyFilename('Bad: <name>?|"*')).toBe('Bad_name');
  });

  it('replaces slashes (path separators) with underscores', () => {
    expect(slugifyFilename('a/b\\c')).toBe('a_b_c');
  });

  it('returns null for empty / whitespace-only input', () => {
    expect(slugifyFilename('')).toBeNull();
    expect(slugifyFilename('   ')).toBeNull();
  });

  it('returns null when stripping leaves nothing', () => {
    expect(slugifyFilename('<<>>')).toBeNull();
  });

  it('caps the slug at 80 characters', () => {
    const long = 'A'.repeat(200);
    expect(slugifyFilename(long)).toHaveLength(80);
  });

  it('keeps unicode letters, digits, and most punctuation', () => {
    expect(slugifyFilename("Schrödinger's Cat - Vol. 1")).toBe(
      "Schrödinger's_Cat_-_Vol._1",
    );
  });
});
