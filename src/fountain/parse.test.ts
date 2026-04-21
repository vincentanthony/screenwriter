import { describe, expect, it } from 'vitest';
import { parse } from './parse';

describe('parse — scene headings', () => {
  it('parses standard INT./EXT./EST./I/E. prefixes', () => {
    expect(parse('INT. ROOM - DAY')).toEqual([{ type: 'scene', text: 'INT. ROOM - DAY' }]);
    expect(parse('EXT. STREET - NIGHT')).toEqual([
      { type: 'scene', text: 'EXT. STREET - NIGHT' },
    ]);
    expect(parse('EST. SPACE STATION')).toEqual([{ type: 'scene', text: 'EST. SPACE STATION' }]);
    expect(parse('I/E. CAR - DUSK')).toEqual([{ type: 'scene', text: 'I/E. CAR - DUSK' }]);
  });

  it('parses forced scene headings with leading `.`', () => {
    expect(parse('.DREAMSCAPE')).toEqual([
      { type: 'scene', text: 'DREAMSCAPE', forced: true },
    ]);
  });

  it('does not mistake ellipsis for a forced scene', () => {
    expect(parse('...and then')).toEqual([{ type: 'action', text: '...and then' }]);
  });
});

describe('parse — action and forced action', () => {
  it('parses a plain action block', () => {
    expect(parse('She walks in.')).toEqual([{ type: 'action', text: 'She walks in.' }]);
  });

  it('parses forced action with leading `!`', () => {
    expect(parse('!INT. FAKE SCENE.')).toEqual([
      { type: 'action', text: 'INT. FAKE SCENE.', forced: true },
    ]);
  });

  it('collects multi-line action into one element', () => {
    expect(parse('Line one.\nLine two.')).toEqual([
      { type: 'action', text: 'Line one.\nLine two.' },
    ]);
  });
});

describe('parse — character/dialogue/parenthetical', () => {
  it('parses a basic character block', () => {
    expect(parse('ALICE\nHello.')).toEqual([
      { type: 'character', text: 'ALICE' },
      { type: 'dialogue', text: 'Hello.' },
    ]);
  });

  it('parses forced lowercase character with `@`', () => {
    expect(parse('@alice\nhello.')).toEqual([
      { type: 'character', text: 'alice', forced: true },
      { type: 'dialogue', text: 'hello.' },
    ]);
  });

  it('parses parenthetical between character and dialogue', () => {
    expect(parse('BOB\n(leaning in)\nBelieve it.')).toEqual([
      { type: 'character', text: 'BOB' },
      { type: 'parenthetical', text: 'leaning in' },
      { type: 'dialogue', text: 'Believe it.' },
    ]);
  });

  it('parses dual-dialogue caret', () => {
    expect(parse('BOB ^\nSimultaneously.')).toEqual([
      { type: 'character', text: 'BOB', dual: true },
      { type: 'dialogue', text: 'Simultaneously.' },
    ]);
  });

  it('does not treat a lone ALL CAPS line as a character', () => {
    expect(parse('ALICE')).toEqual([{ type: 'action', text: 'ALICE' }]);
  });
});

describe('parse — transitions', () => {
  it('parses natural transition ending in TO:', () => {
    expect(parse('CUT TO:')).toEqual([{ type: 'transition', text: 'CUT TO:' }]);
  });

  it('parses forced transition with `>`', () => {
    expect(parse('> FADE OUT.')).toEqual([
      { type: 'transition', text: 'FADE OUT.', forced: true },
    ]);
  });

  // Regression: an all-caps `CUT TO:` at file position 0 used to be
  // misclassified as a title-page field (key=`CUT TO`, value=``) because it
  // matched the `Key: Value` shape. The title-page heuristic now requires a
  // lowercase letter in the key, so transitions win.
  it('parses `CUT TO:` as the first line of a file as a transition, not title-page', () => {
    expect(parse('CUT TO:\n\nINT. ROOM - DAY\n')).toEqual([
      { type: 'transition', text: 'CUT TO:' },
      { type: 'scene', text: 'INT. ROOM - DAY' },
    ]);
  });

  it('parses `FADE TO:` at file start as a transition, not title-page', () => {
    expect(parse('FADE TO:\n')).toEqual([{ type: 'transition', text: 'FADE TO:' }]);
  });
});

describe('parse — centered, notes, boneyard', () => {
  it('parses centered text', () => {
    expect(parse('> THE END <')).toEqual([{ type: 'centered', text: 'THE END' }]);
  });

  it('parses a standalone note', () => {
    expect(parse('[[A note.]]')).toEqual([{ type: 'note', text: 'A note.' }]);
  });

  it('leaves inline notes as raw text inside the enclosing action', () => {
    expect(parse('Rain falls. [[inline]]')).toEqual([
      { type: 'action', text: 'Rain falls. [[inline]]' },
    ]);
  });

  it('parses a single-line boneyard', () => {
    expect(parse('/* ignore me */')).toEqual([{ type: 'boneyard', text: ' ignore me ' }]);
  });

  it('parses a multi-line boneyard preserving interior lines', () => {
    expect(parse('/*\nA\nB\n*/')).toEqual([{ type: 'boneyard', text: '\nA\nB\n' }]);
  });
});

describe('parse — sections, synopses, lyrics, page breaks', () => {
  it('parses sections with depth', () => {
    expect(parse('# Act One')).toEqual([{ type: 'section', depth: 1, text: 'Act One' }]);
    expect(parse('## Act Two')).toEqual([{ type: 'section', depth: 2, text: 'Act Two' }]);
  });

  it('parses synopses with `=` prefix', () => {
    expect(parse('= pivotal moment')).toEqual([
      { type: 'synopsis', text: 'pivotal moment' },
    ]);
  });

  it('groups consecutive lyrics into one element', () => {
    expect(parse('~Line one\n~Line two')).toEqual([
      { type: 'lyric', text: 'Line one\nLine two' },
    ]);
  });

  it('parses page breaks', () => {
    expect(parse('===')).toEqual([{ type: 'page-break' }]);
  });
});

describe('parse — title page', () => {
  it('parses a title page at the top of the file', () => {
    const input = 'Title: My Script\nAuthor: Me\n\nINT. ROOM - DAY\n';
    expect(parse(input)).toEqual([
      {
        type: 'title-page',
        fields: [
          { key: 'Title', value: 'My Script' },
          { key: 'Author', value: 'Me' },
        ],
      },
      { type: 'scene', text: 'INT. ROOM - DAY' },
    ]);
  });
});
