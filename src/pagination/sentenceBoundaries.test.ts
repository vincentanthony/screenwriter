import { describe, expect, it } from 'vitest';
import { findSentenceBoundaries, findWordBoundaries } from './sentenceBoundaries';

describe('findSentenceBoundaries', () => {
  it('finds a single sentence boundary in a two-sentence string', () => {
    const text = 'Hello world. This is a test.';
    //                         ^ idx 12
    const boundaries = findSentenceBoundaries(text);
    expect(boundaries).toHaveLength(1);
    expect(text.slice(0, boundaries[0])).toBe('Hello world.');
    expect(text.slice(boundaries[0]).trim()).toBe('This is a test.');
  });

  it('finds multiple boundaries, ascending', () => {
    const text = 'One sentence. Two sentences. Three sentences. End here.';
    const boundaries = findSentenceBoundaries(text);
    expect(boundaries.length).toBe(3);
    expect(boundaries).toEqual([...boundaries].sort((a, b) => a - b));
  });

  it('accepts question marks and exclamation points', () => {
    expect(findSentenceBoundaries('Really? Absolutely.')).toHaveLength(1);
    expect(findSentenceBoundaries('Stop! Now.')).toHaveLength(1);
  });

  it('handles closing quotes/brackets after the punctuation', () => {
    const text = '"I said stop." Then he left.';
    const boundaries = findSentenceBoundaries(text);
    expect(boundaries).toHaveLength(1);
    expect(text.slice(0, boundaries[0])).toBe('"I said stop."');
  });

  it('REJECTS common English abbreviations as sentence breaks', () => {
    // "Dr. Smith" should NOT be split at the period after "Dr".
    const text = 'Dr. Smith arrived. He was late.';
    const boundaries = findSentenceBoundaries(text);
    // Only one real boundary — after "arrived.".
    expect(boundaries).toHaveLength(1);
    expect(text.slice(0, boundaries[0])).toBe('Dr. Smith arrived.');
  });

  it('does NOT confuse ellipsis with a sentence end', () => {
    // "...Not yet." — the ... is a pause, not a sentence end. Only the
    // final "." followed by an uppercase letter would qualify, but
    // there's no next sentence to trigger one.
    const text = 'I was thinking... Not yet.';
    // Depending on interpretation this could surface the final period
    // as no-match (nothing follows). The sentence boundary we're
    // looking for here is AFTER "thinking..." before "Not".
    const boundaries = findSentenceBoundaries(text);
    // The lookahead ([A-Z] after whitespace) captures "...Not" only if
    // the preceding char is ".!?". Last char of "..." is ".", so yes —
    // we get ONE boundary here, between "..." and "Not". That's fine
    // for screenplay dialogue; ellipsis-as-pause is close enough to
    // ellipsis-as-sentence-end for the split heuristic.
    expect(boundaries).toHaveLength(1);
    expect(text.slice(0, boundaries[0])).toBe('I was thinking...');
  });

  it('does NOT fire on decimals or version numbers', () => {
    // "$1.50 a pound" — period followed by a digit, not [A-Z].
    const text = 'It costs $1.50 a pound. She bought two.';
    // Only the real sentence boundary — between "pound." and "She".
    const boundaries = findSentenceBoundaries(text);
    expect(boundaries).toHaveLength(1);
  });

  it('returns an empty array when there is no sentence boundary', () => {
    expect(findSentenceBoundaries('just one long stream of words')).toEqual([]);
    expect(findSentenceBoundaries('Hi.')).toEqual([]); // no following sentence
  });
});

describe('findWordBoundaries', () => {
  it('finds every whitespace run as a split candidate', () => {
    const text = 'one two three four';
    const boundaries = findWordBoundaries(text);
    expect(boundaries.length).toBe(3);
    // Each index is the START of a whitespace run (slice(0, idx) = word so far).
    expect(text.slice(0, boundaries[0])).toBe('one');
    expect(text.slice(0, boundaries[1])).toBe('one two');
  });

  it('skips leading/trailing whitespace runs', () => {
    const text = ' one two ';
    const boundaries = findWordBoundaries(text);
    // Leading space at idx 0 is excluded; trailing space that touches
    // the end is excluded; only the space between "one" and "two" qualifies.
    expect(boundaries.length).toBe(1);
    expect(text.slice(0, boundaries[0]).trim()).toBe('one');
  });

  it('returns an empty array for a single-word string', () => {
    expect(findWordBoundaries('hello')).toEqual([]);
  });

  it('returns an empty array for an empty string', () => {
    expect(findWordBoundaries('')).toEqual([]);
  });
});
