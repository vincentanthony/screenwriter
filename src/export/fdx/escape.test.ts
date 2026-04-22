import { describe, expect, it } from 'vitest';
import { escapeXml } from './escape';

describe('escapeXml', () => {
  it('escapes the five predefined XML entities', () => {
    expect(escapeXml('&')).toBe('&amp;');
    expect(escapeXml('<')).toBe('&lt;');
    expect(escapeXml('>')).toBe('&gt;');
    expect(escapeXml('"')).toBe('&quot;');
    expect(escapeXml("'")).toBe('&apos;');
  });

  it('escapes all of them inside a single string', () => {
    expect(escapeXml(`<a href="x">&lt;'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;lt;&apos;&lt;/a&gt;',
    );
  });

  it('passes through plain text untouched', () => {
    expect(escapeXml('INT. COFFEE SHOP - DAY')).toBe('INT. COFFEE SHOP - DAY');
  });

  it('handles an empty string', () => {
    expect(escapeXml('')).toBe('');
  });

  it('preserves newlines (FDX accepts literal LF in <Text> content)', () => {
    expect(escapeXml('line one\nline two')).toBe('line one\nline two');
  });
});
