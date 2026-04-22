import { describe, expect, it } from 'vitest';
import { parse } from './parse';
import { normalize, serialize } from './serialize';

describe('serialize — casing guard', () => {
  it('uppercases non-forced character names on serialize', () => {
    expect(serialize([{ type: 'character', text: 'alice' }, { type: 'dialogue', text: 'hi.' }])).toBe(
      'ALICE\nhi.\n',
    );
  });

  it('leaves forced character names (@name) in their original case', () => {
    expect(
      serialize([
        { type: 'character', text: 'alice', forced: true },
        { type: 'dialogue', text: 'hi.' },
      ]),
    ).toBe('@alice\nhi.\n');
  });

  it('uppercases non-forced scene headings', () => {
    expect(serialize([{ type: 'scene', text: 'int. coffee shop - day' }])).toBe(
      'INT. COFFEE SHOP - DAY\n',
    );
  });

  it('preserves mixed-case in forced scene headings (.slug)', () => {
    expect(serialize([{ type: 'scene', text: 'Dreamscape - Limbo', forced: true }])).toBe(
      '.Dreamscape - Limbo\n',
    );
  });

  it('uppercases non-forced transitions', () => {
    expect(serialize([{ type: 'transition', text: 'cut to:' }])).toBe('CUT TO:\n');
  });

  it('preserves mixed-case in forced transitions (> forced)', () => {
    expect(
      serialize([{ type: 'transition', text: 'Fade Out.', forced: true }]),
    ).toBe('> Fade Out.\n');
  });

  it('serializer casing is idempotent under round-trip', () => {
    // Construct an element list with lowercase non-forced names; after
    // parse(serialize(x)) the names are uppercase and subsequent passes
    // are stable.
    const input: ReturnType<typeof parse> = [
      { type: 'character', text: 'alice' },
      { type: 'dialogue', text: 'hi.' },
    ];
    const once = serialize(input);
    const twice = serialize(parse(once));
    expect(twice).toBe(normalize(once));
  });
});

describe('serialize — title-page defensive coercion', () => {
  it('emits real string title-page values verbatim', () => {
    expect(
      serialize([
        {
          type: 'title-page',
          fields: [
            { key: 'Title', value: 'Starship' },
            { key: 'Author', value: 'Jane Doe' },
          ],
        },
      ]),
    ).toBe('Title: Starship\nAuthor: Jane Doe\n');
  });

  it('coerces non-string title-page values to empty instead of "[object Object]"', () => {
    // TitlePageField.value is typed `string`, but we've seen upstream
    // FDX imports smuggle objects through. The default template-literal
    // stringification turns them into the literal "[object Object]",
    // which then poisons the Fountain source of truth. This guard
    // contains the blast radius at the serialize boundary.
    const out = serialize([
      {
        type: 'title-page',
        fields: [
          { key: 'Title', value: 'Starship' },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { key: 'Author', value: { nested: 'oops' } as any },
        ],
      },
    ]);
    expect(out).not.toContain('[object Object]');
    expect(out).not.toContain('oops');
    expect(out).toContain('Title: Starship');
    // Non-string value becomes empty — the key is preserved so the
    // shape of the title page doesn't shift.
    expect(out).toContain('Author: \n');
  });
});
