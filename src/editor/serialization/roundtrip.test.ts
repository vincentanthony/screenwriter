import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { parse } from '@/fountain/parse';
import { normalize, serialize } from '@/fountain/serialize';
import type { ScreenplayElement } from '@/fountain/types';

import { docToScreenplay, inlineToText } from './fromTiptap';
import { screenplayToDoc, textToInline } from './toTiptap';
import { NODE_NAMES } from './nodeNames';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '../../fountain/__fixtures__/reference.fountain');
const fixture = readFileSync(fixturePath, 'utf8');

describe('editor serialization — textToInline / inlineToText', () => {
  const cases: { label: string; text: string }[] = [
    { label: 'empty', text: '' },
    { label: 'single line', text: 'Hello world' },
    { label: 'two lines', text: 'A\nB' },
    { label: 'leading newline', text: '\nA' },
    { label: 'trailing newline', text: 'A\n' },
    { label: 'leading + trailing newline (boneyard shape)', text: '\nA\nB\n' },
    { label: 'double newline (blank line inside a block)', text: 'A\n\nB' },
    { label: 'only newline', text: '\n' },
  ];

  for (const { label, text } of cases) {
    it(`round-trips ${label}`, () => {
      const inline = textToInline(text);
      expect(inlineToText(inline)).toBe(text);
    });
  }
});

describe('editor serialization — screenplayToDoc / docToScreenplay', () => {
  it('splits title page out of the doc and reattaches it on the way back', () => {
    const elements: ScreenplayElement[] = [
      {
        type: 'title-page',
        fields: [
          { key: 'Title', value: 'X' },
          { key: 'Author', value: 'Y' },
        ],
      },
      { type: 'scene', text: 'INT. ROOM - DAY' },
    ];
    const { titlePage, doc } = screenplayToDoc(elements);
    expect(titlePage).toEqual([
      { key: 'Title', value: 'X' },
      { key: 'Author', value: 'Y' },
    ]);
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].type).toBe(NODE_NAMES.sceneHeading);

    const restored = docToScreenplay(doc, titlePage);
    expect(restored).toEqual(elements);
  });

  it('preserves forced flags through the doc', () => {
    const elements: ScreenplayElement[] = [
      { type: 'scene', text: 'DREAMSCAPE', forced: true },
      { type: 'action', text: 'Looks like a slug.', forced: true },
      { type: 'character', text: 'alice', forced: true },
      { type: 'dialogue', text: 'Hi.' },
      { type: 'transition', text: 'FADE OUT.', forced: true },
    ];
    const { doc } = screenplayToDoc(elements);
    const restored = docToScreenplay(doc, null);
    expect(restored).toEqual(elements);
  });

  it('preserves the dual-dialogue caret', () => {
    const elements: ScreenplayElement[] = [
      { type: 'character', text: 'BOB', dual: true },
      { type: 'dialogue', text: 'Now.' },
    ];
    const { doc } = screenplayToDoc(elements);
    expect(doc.content[0].attrs).toEqual({ forced: false, dual: true });
    expect(docToScreenplay(doc, null)).toEqual(elements);
  });

  it('preserves section depth', () => {
    const elements: ScreenplayElement[] = [
      { type: 'section', depth: 1, text: 'Act One' },
      { type: 'section', depth: 3, text: 'Sub-sub' },
    ];
    const { doc } = screenplayToDoc(elements);
    expect(doc.content[0].attrs).toEqual({ depth: 1 });
    expect(doc.content[1].attrs).toEqual({ depth: 3 });
    expect(docToScreenplay(doc, null)).toEqual(elements);
  });

  it('handles multi-line action and multi-line boneyard via hardBreaks', () => {
    const elements: ScreenplayElement[] = [
      { type: 'action', text: 'Line one.\nLine two.\nLine three.' },
      { type: 'boneyard', text: '\nA\nB\n' },
    ];
    const { doc } = screenplayToDoc(elements);
    expect(docToScreenplay(doc, null)).toEqual(elements);
  });

  it('unknown node types fall back to action (content preserved)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const doc = {
        type: 'doc' as const,
        content: [
          { type: 'somethingFromV2', content: [{ type: 'text' as const, text: 'hello' }] },
        ],
      };
      expect(docToScreenplay(doc, null)).toEqual([{ type: 'action', text: 'hello' }]);
    } finally {
      warn.mockRestore();
    }
  });

  it('warns in dev when an unknown node falls back', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const doc = {
        type: 'doc' as const,
        content: [{ type: 'mysteryNode', content: [{ type: 'text' as const, text: 'x' }] }],
      };
      docToScreenplay(doc, null);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/mysteryNode/);
      expect(warn.mock.calls[0][0]).toMatch(/falling back to action/);
    } finally {
      warn.mockRestore();
    }
  });

  it('does not warn for known node types', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { doc } = screenplayToDoc([
        { type: 'scene', text: 'INT. ROOM - DAY' },
        { type: 'action', text: 'A walks.' },
      ]);
      docToScreenplay(doc, null);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('full pipeline round-trip (fountain → elements → doc → elements → fountain)', () => {
  it('reference.fountain survives a full editor-bridge round-trip', () => {
    const elements = parse(fixture);
    const { titlePage, doc } = screenplayToDoc(elements);
    const restored = docToScreenplay(doc, titlePage);
    expect(serialize(restored)).toBe(normalize(fixture));
  });

  it('is idempotent — two full passes produce identical Fountain', () => {
    const once = (() => {
      const e = parse(fixture);
      const { titlePage, doc } = screenplayToDoc(e);
      return serialize(docToScreenplay(doc, titlePage));
    })();
    const twice = (() => {
      const e = parse(once);
      const { titlePage, doc } = screenplayToDoc(e);
      return serialize(docToScreenplay(doc, titlePage));
    })();
    expect(twice).toBe(once);
  });
});
