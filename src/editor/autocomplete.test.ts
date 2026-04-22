import { describe, expect, it } from 'vitest';
import type { ScreenplayElement } from '@/fountain/types';
import { extractAutocompleteSets, splitSceneHeading } from './autocomplete';

describe('splitSceneHeading', () => {
  it.each([
    ['INT. COFFEE SHOP - DAY', 'COFFEE SHOP', 'DAY'],
    ['EXT. DESERT - CONTINUOUS', 'DESERT', 'CONTINUOUS'],
    // Multi-segment location: only the LAST " - " is the time delimiter.
    ["INT. ALICE'S APARTMENT - KITCHEN - NIGHT", "ALICE'S APARTMENT - KITCHEN", 'NIGHT'],
    ['EXT. ROOFTOP - NIGHT', 'ROOFTOP', 'NIGHT'],
    ['EST. SPACE STATION - DAY', 'SPACE STATION', 'DAY'],
    ['INT./EXT. CAR - DUSK', 'CAR', 'DUSK'],
    ['I/E. BOAT - MORNING', 'BOAT', 'MORNING'],
  ])('%p splits to location=%p time=%p', (input, location, time) => {
    expect(splitSceneHeading(input)).toEqual({ location, time });
  });

  it('returns null time when no " - " delimiter is present', () => {
    expect(splitSceneHeading('INT. PARKING LOT')).toEqual({
      location: 'PARKING LOT',
      time: null,
    });
  });

  it('handles lowercase input (uppercases the outputs)', () => {
    expect(splitSceneHeading('int. coffee shop - day')).toEqual({
      location: 'COFFEE SHOP',
      time: 'DAY',
    });
  });

  it('returns all nulls for prefix-only headings', () => {
    expect(splitSceneHeading('INT. ')).toEqual({ location: null, time: null });
  });

  it('returns all nulls for empty input', () => {
    expect(splitSceneHeading('')).toEqual({ location: null, time: null });
  });

  it('does not treat single " -" or "- " as the time delimiter', () => {
    // Only a full " - " (space dash space) counts as the time separator.
    expect(splitSceneHeading('INT. HALL-WAY')).toEqual({ location: 'HALL-WAY', time: null });
    expect(splitSceneHeading('INT. ROOM -DAY')).toEqual({ location: 'ROOM -DAY', time: null });
  });
});

describe('extractAutocompleteSets — empty document', () => {
  it('returns empty sets', () => {
    expect(extractAutocompleteSets([])).toEqual({
      characters: [],
      locations: [],
      times: [],
    });
  });
});

describe('extractAutocompleteSets — characters', () => {
  it('collects distinct character names sorted alphabetically, uppercase canonical', () => {
    const elements: ScreenplayElement[] = [
      { type: 'character', text: 'BOB' },
      { type: 'dialogue', text: 'Hi.' },
      { type: 'character', text: 'ALICE' },
      { type: 'dialogue', text: 'Hello.' },
      { type: 'character', text: 'BOB' },
      { type: 'dialogue', text: 'Again.' },
    ];
    expect(extractAutocompleteSets(elements).characters).toEqual(['ALICE', 'BOB']);
  });

  it('dedupes case variants: "alice" + "Alice" + "ALICE" → one "ALICE"', () => {
    const elements: ScreenplayElement[] = [
      { type: 'character', text: 'alice' },
      { type: 'character', text: 'Alice' },
      { type: 'character', text: 'ALICE' },
    ];
    expect(extractAutocompleteSets(elements).characters).toEqual(['ALICE']);
  });

  it('preserves forced mixed-case characters in uppercase canonical form', () => {
    // A `@alice` element has forced=true. For autocomplete purposes, we
    // treat the canonical form as uppercase — retyping later will conform
    // to the standard character convention. Writers who want to stay
    // mixed-case via @ can type it manually.
    const elements: ScreenplayElement[] = [
      { type: 'character', text: 'alice', forced: true },
    ];
    expect(extractAutocompleteSets(elements).characters).toEqual(['ALICE']);
  });

  it('ignores empty or whitespace-only character text', () => {
    const elements: ScreenplayElement[] = [
      { type: 'character', text: '' },
      { type: 'character', text: '   ' },
      { type: 'character', text: 'ALICE' },
    ];
    expect(extractAutocompleteSets(elements).characters).toEqual(['ALICE']);
  });
});

describe('extractAutocompleteSets — locations and times', () => {
  it('extracts locations and times from scene headings across the doc', () => {
    const elements: ScreenplayElement[] = [
      { type: 'scene', text: 'INT. COFFEE SHOP - DAY' },
      { type: 'action', text: 'Filler.' },
      { type: 'scene', text: 'EXT. BEACH - NIGHT' },
      { type: 'scene', text: 'INT. COFFEE SHOP - NIGHT' },
      { type: 'scene', text: "INT. ALICE'S APARTMENT - KITCHEN - CONTINUOUS" },
    ];
    const { locations, times } = extractAutocompleteSets(elements);
    expect(locations).toEqual([
      "ALICE'S APARTMENT - KITCHEN",
      'BEACH',
      'COFFEE SHOP',
    ]);
    expect(times).toEqual(['CONTINUOUS', 'DAY', 'NIGHT']);
  });

  it('handles scene headings with no time delimiter (location only)', () => {
    const elements: ScreenplayElement[] = [
      { type: 'scene', text: 'INT. PARKING LOT' },
      { type: 'scene', text: 'EXT. DESERT' },
    ];
    const { locations, times } = extractAutocompleteSets(elements);
    expect(locations).toEqual(['DESERT', 'PARKING LOT']);
    expect(times).toEqual([]);
  });

  it('extracts from forced scene headings (.slug) too', () => {
    const elements: ScreenplayElement[] = [
      { type: 'scene', text: 'DREAMSCAPE - LIMBO', forced: true },
    ];
    // No INT./EXT. prefix to strip; the whole text is the heading.
    // Still splits on " - ".
    const { locations, times } = extractAutocompleteSets(elements);
    expect(locations).toEqual(['DREAMSCAPE']);
    expect(times).toEqual(['LIMBO']);
  });

  it('is not confused by character or action blocks', () => {
    const elements: ScreenplayElement[] = [
      { type: 'action', text: 'INT. ACTION TEXT - LOOKS LIKE A SCENE BUT ISNT' },
      { type: 'dialogue', text: 'not a scene' },
    ];
    expect(extractAutocompleteSets(elements).locations).toEqual([]);
  });
});
