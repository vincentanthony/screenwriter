import { describe, expect, it } from 'vitest';
import { parse } from '@/fountain/parse';
import { serialize } from '@/fountain/serialize';
import type { TitlePageField } from '@/fountain/types';
import { getTitlePageFieldValue, upsertTitlePageField } from './titlePageFields';

describe('upsertTitlePageField', () => {
  it('replaces the value of an existing key in place', () => {
    const fields: TitlePageField[] = [
      { key: 'Title', value: 'Original' },
      { key: 'Author', value: 'Someone' },
    ];
    expect(upsertTitlePageField(fields, 'Title', 'Renamed')).toEqual([
      { key: 'Title', value: 'Renamed' },
      { key: 'Author', value: 'Someone' },
    ]);
  });

  it('appends a new key when not present', () => {
    const fields: TitlePageField[] = [{ key: 'Title', value: 'X' }];
    expect(upsertTitlePageField(fields, 'Credit', 'Written by')).toEqual([
      { key: 'Title', value: 'X' },
      { key: 'Credit', value: 'Written by' },
    ]);
  });

  it('preserves UNKNOWN keys that sit between known keys', () => {
    const fields: TitlePageField[] = [
      { key: 'Title', value: 'Orig' },
      { key: 'Language', value: 'French' }, // unknown / unrecognized
      { key: 'Author', value: 'Me' },
    ];
    const next = upsertTitlePageField(fields, 'Title', 'New');
    expect(next).toEqual([
      { key: 'Title', value: 'New' },
      { key: 'Language', value: 'French' },
      { key: 'Author', value: 'Me' },
    ]);
  });

  it('returns a new array (no in-place mutation)', () => {
    const fields: TitlePageField[] = [{ key: 'Title', value: 'X' }];
    const next = upsertTitlePageField(fields, 'Title', 'Y');
    expect(next).not.toBe(fields);
    expect(fields[0].value).toBe('X'); // original untouched
  });
});

describe('getTitlePageFieldValue', () => {
  const fields: TitlePageField[] = [{ key: 'Title', value: 'X' }];

  it('returns the value for a present key', () => {
    expect(getTitlePageFieldValue(fields, 'Title')).toBe('X');
  });

  it('returns empty string for a missing key', () => {
    expect(getTitlePageFieldValue(fields, 'Credit')).toBe('');
  });

  it('returns empty string when fields is null', () => {
    expect(getTitlePageFieldValue(null, 'Title')).toBe('');
  });
});

describe('title-page round-trip through fountain parse + upsert + serialize', () => {
  it('editing a known field preserves unknown keys like "Language"', () => {
    const input =
      'Title: Original\nLanguage: French\nAuthor: Claude\n\nINT. ROOM - DAY\n';
    const elements = parse(input);

    const titlePage = elements.find((e) => e.type === 'title-page');
    expect(titlePage?.type).toBe('title-page');
    if (titlePage?.type !== 'title-page') throw new Error('expected title-page element');

    const updatedFields = upsertTitlePageField(titlePage.fields, 'Title', 'Renamed');
    const patched = elements.map((e) =>
      e.type === 'title-page' ? { ...e, fields: updatedFields } : e,
    );
    const out = serialize(patched);

    // The new title lands, the unknown-to-our-form key survives, and the
    // body (Scene Heading) round-trips untouched.
    expect(out).toContain('Title: Renamed');
    expect(out).toContain('Language: French');
    expect(out).toContain('Author: Claude');
    expect(out).toContain('INT. ROOM - DAY');
  });

  it('adding a new known field appends it and leaves others intact', () => {
    const input = 'Title: X\n\nINT. ROOM - DAY\n';
    const elements = parse(input);
    const titlePage = elements.find((e) => e.type === 'title-page');
    if (titlePage?.type !== 'title-page') throw new Error('expected title-page element');

    const updated = upsertTitlePageField(titlePage.fields, 'Copyright', '© 2026');
    const patched = elements.map((e) =>
      e.type === 'title-page' ? { ...e, fields: updated } : e,
    );
    const out = serialize(patched);

    expect(out).toContain('Title: X');
    expect(out).toContain('Copyright: © 2026');
    // Copyright appears AFTER Title (append semantics).
    expect(out.indexOf('Copyright: © 2026')).toBeGreaterThan(out.indexOf('Title: X'));
  });
});
