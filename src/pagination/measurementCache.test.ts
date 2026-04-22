import { describe, expect, it } from 'vitest';
import type { ScreenplayElement } from '@/fountain/types';
import { MEASUREMENT_CACHE_VERSION, MeasurementCache } from './measurementCache';

describe('MeasurementCache', () => {
  it('returns null for an unseen element', () => {
    const cache = new MeasurementCache();
    expect(cache.get({ type: 'action', text: 'hello' })).toBeNull();
  });

  it('round-trips a measurement for the same element', () => {
    const cache = new MeasurementCache();
    const el: ScreenplayElement = { type: 'action', text: 'she walks in' };
    cache.set(el, 42);
    expect(cache.get(el)).toBe(42);
  });

  it('returns the same cached height for two elements that render identically', () => {
    const cache = new MeasurementCache();
    cache.set({ type: 'action', text: 'same text' }, 30);
    // A different object with the same type + text should hit the same key.
    expect(cache.get({ type: 'action', text: 'same text' })).toBe(30);
  });

  it('distinguishes by element type', () => {
    const cache = new MeasurementCache();
    cache.set({ type: 'action', text: 'hi' }, 30);
    expect(cache.get({ type: 'dialogue', text: 'hi' })).toBeNull();
  });

  it('distinguishes by text content', () => {
    const cache = new MeasurementCache();
    cache.set({ type: 'action', text: 'short' }, 20);
    expect(cache.get({ type: 'action', text: 'much longer text here' })).toBeNull();
  });

  it('distinguishes Character by its `dual` attribute', () => {
    const cache = new MeasurementCache();
    cache.set({ type: 'character', text: 'ALICE', dual: true }, 30);
    // Non-dual Character with the same name is a different render.
    expect(cache.get({ type: 'character', text: 'ALICE' })).toBeNull();
  });

  it('distinguishes Section by its `depth` attribute', () => {
    const cache = new MeasurementCache();
    cache.set({ type: 'section', text: 'Act One', depth: 1 }, 25);
    expect(cache.get({ type: 'section', text: 'Act One', depth: 2 })).toBeNull();
  });

  it('ignores entries written under a different version', () => {
    const cache = new MeasurementCache();
    const el: ScreenplayElement = { type: 'action', text: 'stable' };
    cache.set(el, 50);

    // Simulate a stale entry from an old version by tampering with the
    // internal store. Real-world trigger: a dev bumps the version after
    // editing screenplay CSS and any still-resident entries become stale.
    const key = cache.keyFor(el);
    // @ts-expect-error — reach into private store for the test
    cache.store.set(key, { version: MEASUREMENT_CACHE_VERSION - 1, height: 999 });
    expect(cache.get(el)).toBeNull();
  });

  it('clear() empties the cache', () => {
    const cache = new MeasurementCache();
    cache.set({ type: 'action', text: 'x' }, 10);
    cache.set({ type: 'action', text: 'y' }, 20);
    expect(cache.size).toBe(2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get({ type: 'action', text: 'x' })).toBeNull();
  });

  it('page-break and other text-less elements share a stable key', () => {
    const cache = new MeasurementCache();
    cache.set({ type: 'page-break' }, 0);
    expect(cache.get({ type: 'page-break' })).toBe(0);
  });
});
