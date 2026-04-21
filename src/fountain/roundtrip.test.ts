import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from './parse';
import { normalize, serialize } from './serialize';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '__fixtures__', 'reference.fountain');
const fixture = readFileSync(fixturePath, 'utf8');

describe('fountain round-trip (parse → serialize)', () => {
  it('reference.fountain is already in canonical (normalized) form', () => {
    expect(fixture).toBe(normalize(fixture));
  });

  it('serialize(parse(fixture)) === fixture (byte-exact after normalize)', () => {
    const out = serialize(parse(fixture));
    expect(out).toBe(normalize(fixture));
  });

  it('is idempotent: running parse/serialize twice produces identical output', () => {
    const once = serialize(parse(fixture));
    const twice = serialize(parse(once));
    expect(twice).toBe(once);
  });

  it('covers every element type in the support matrix', () => {
    const elements = parse(fixture);
    const types = new Set(elements.map((e) => e.type));
    for (const required of [
      'title-page',
      'scene',
      'action',
      'character',
      'parenthetical',
      'dialogue',
      'transition',
      'centered',
      'note',
      'boneyard',
      'section',
      'synopsis',
      'lyric',
      'page-break',
    ] as const) {
      expect(types, `fixture should contain ${required}`).toContain(required);
    }
  });

  it('fixture exercises forced markers (.scene, !action, @character, >transition)', () => {
    const elements = parse(fixture);
    expect(elements.some((e) => e.type === 'scene' && e.forced)).toBe(true);
    expect(elements.some((e) => e.type === 'action' && e.forced)).toBe(true);
    expect(elements.some((e) => e.type === 'character' && e.forced)).toBe(true);
    expect(elements.some((e) => e.type === 'transition' && e.forced)).toBe(true);
  });

  it('fixture exercises a dual-dialogue character', () => {
    const elements = parse(fixture);
    expect(elements.some((e) => e.type === 'character' && e.dual)).toBe(true);
  });

  it('round-trips each constructed case from the support matrix', () => {
    const cases: { label: string; fountain: string }[] = [
      { label: 'standard scene', fountain: 'INT. ROOM - DAY\n' },
      { label: 'forced scene', fountain: '.DREAMSCAPE\n' },
      { label: 'action', fountain: 'She walks in.\n' },
      { label: 'forced action', fountain: '!INT. NOT A SCENE\n' },
      { label: 'character + dialogue', fountain: 'ALICE\nHello.\n' },
      { label: 'forced character', fountain: '@alice\nhello.\n' },
      { label: 'parenthetical', fountain: 'BOB\n(softly)\nOK.\n' },
      { label: 'dual dialogue', fountain: 'BOB ^\nNow.\n' },
      { label: 'transition', fountain: 'CUT TO:\n' },
      { label: 'forced transition', fountain: '> FADE OUT.\n' },
      { label: 'centered', fountain: '> THE END <\n' },
      { label: 'standalone note', fountain: '[[A standalone note.]]\n' },
      { label: 'single-line boneyard', fountain: '/* inline */\n' },
      { label: 'multi-line boneyard', fountain: '/*\nA\nB\n*/\n' },
      { label: 'section depth 1', fountain: '# Act One\n' },
      { label: 'section depth 2', fountain: '## Act Two\n' },
      { label: 'synopsis', fountain: '= pivotal\n' },
      { label: 'consecutive lyrics', fountain: '~one\n~two\n' },
      { label: 'page break', fountain: '===\n' },
    ];

    for (const { label, fountain } of cases) {
      const out = serialize(parse(fountain));
      expect(out, label).toBe(normalize(fountain));
    }
  });
});
