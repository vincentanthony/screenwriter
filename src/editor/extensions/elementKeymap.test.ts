import { describe, expect, it } from 'vitest';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { resolveEnter, resolveShiftTab, resolveTab } from './elementKeymap';

// The resolver functions are a pure state machine: (current, isEmpty) →
// KeyMapAction. Table-driven tests lock down every transition in the plan.

describe('resolveTab — non-empty block converts per Final Draft map', () => {
  const cases: [string, string][] = [
    [NODE_NAMES.sceneHeading, NODE_NAMES.action],
    [NODE_NAMES.action, NODE_NAMES.character],
    [NODE_NAMES.character, NODE_NAMES.transition],
    [NODE_NAMES.parenthetical, NODE_NAMES.dialogue],
    [NODE_NAMES.dialogue, NODE_NAMES.parenthetical],
    [NODE_NAMES.transition, NODE_NAMES.sceneHeading],
  ];
  for (const [from, to] of cases) {
    it(`${from} → ${to}`, () => {
      expect(resolveTab({ current: from, isEmpty: false })).toEqual({ kind: 'convert', to });
    });
  }
});

describe('resolveTab — empty-line forward cycle', () => {
  it('cycles Action → Character → Transition → Scene → Action', () => {
    expect(resolveTab({ current: NODE_NAMES.action, isEmpty: true })).toEqual({
      kind: 'convert',
      to: NODE_NAMES.character,
    });
    expect(resolveTab({ current: NODE_NAMES.character, isEmpty: true })).toEqual({
      kind: 'convert',
      to: NODE_NAMES.transition,
    });
    expect(resolveTab({ current: NODE_NAMES.transition, isEmpty: true })).toEqual({
      kind: 'convert',
      to: NODE_NAMES.sceneHeading,
    });
    expect(resolveTab({ current: NODE_NAMES.sceneHeading, isEmpty: true })).toEqual({
      kind: 'convert',
      to: NODE_NAMES.action,
    });
  });

  it('falls back to the per-element map for empty parenthetical/dialogue', () => {
    expect(resolveTab({ current: NODE_NAMES.parenthetical, isEmpty: true })).toEqual({
      kind: 'convert',
      to: NODE_NAMES.dialogue,
    });
    expect(resolveTab({ current: NODE_NAMES.dialogue, isEmpty: true })).toEqual({
      kind: 'convert',
      to: NODE_NAMES.parenthetical,
    });
  });

  it('passes through for unknown node types', () => {
    expect(resolveTab({ current: 'paragraph', isEmpty: false })).toEqual({ kind: 'passthrough' });
    expect(resolveTab({ current: 'centered', isEmpty: false })).toEqual({ kind: 'passthrough' });
  });
});

describe('resolveShiftTab — non-empty block reverse map', () => {
  const cases: [string, string][] = [
    [NODE_NAMES.sceneHeading, NODE_NAMES.transition],
    [NODE_NAMES.action, NODE_NAMES.sceneHeading],
    [NODE_NAMES.character, NODE_NAMES.action],
    [NODE_NAMES.parenthetical, NODE_NAMES.dialogue],
    [NODE_NAMES.dialogue, NODE_NAMES.parenthetical],
    [NODE_NAMES.transition, NODE_NAMES.character],
  ];
  for (const [from, to] of cases) {
    it(`${from} → ${to}`, () => {
      expect(resolveShiftTab({ current: from, isEmpty: false })).toEqual({ kind: 'convert', to });
    });
  }
});

describe('resolveShiftTab — empty-line reverse cycle', () => {
  it('cycles Action → Scene → Transition → Character → Action', () => {
    expect(resolveShiftTab({ current: NODE_NAMES.action, isEmpty: true })).toEqual({
      kind: 'convert',
      to: NODE_NAMES.sceneHeading,
    });
    expect(resolveShiftTab({ current: NODE_NAMES.sceneHeading, isEmpty: true })).toEqual({
      kind: 'convert',
      to: NODE_NAMES.transition,
    });
    expect(resolveShiftTab({ current: NODE_NAMES.transition, isEmpty: true })).toEqual({
      kind: 'convert',
      to: NODE_NAMES.character,
    });
    expect(resolveShiftTab({ current: NODE_NAMES.character, isEmpty: true })).toEqual({
      kind: 'convert',
      to: NODE_NAMES.action,
    });
  });

  it('Tab and Shift+Tab are inverses on the empty cycle', () => {
    for (const type of [
      NODE_NAMES.action,
      NODE_NAMES.character,
      NODE_NAMES.transition,
      NODE_NAMES.sceneHeading,
    ]) {
      const forward = resolveTab({ current: type, isEmpty: true });
      expect(forward.kind).toBe('convert');
      if (forward.kind !== 'convert') continue;
      const back = resolveShiftTab({ current: forward.to, isEmpty: true });
      expect(back).toEqual({ kind: 'convert', to: type });
    }
  });
});

describe('resolveEnter — non-empty block splits per Final Draft map', () => {
  const cases: [string, string][] = [
    [NODE_NAMES.sceneHeading, NODE_NAMES.action],
    [NODE_NAMES.action, NODE_NAMES.action],
    [NODE_NAMES.character, NODE_NAMES.dialogue],
    [NODE_NAMES.parenthetical, NODE_NAMES.dialogue],
    [NODE_NAMES.dialogue, NODE_NAMES.character],
    [NODE_NAMES.transition, NODE_NAMES.sceneHeading],
  ];
  for (const [from, to] of cases) {
    it(`${from} splits → ${to}`, () => {
      expect(resolveEnter({ current: from, isEmpty: false })).toEqual({ kind: 'split', to });
    });
  }
});

describe('resolveEnter — empty-line collapse to Action', () => {
  it('empty non-Action block converts to Action (the "Enter twice" rule)', () => {
    for (const type of [
      NODE_NAMES.sceneHeading,
      NODE_NAMES.character,
      NODE_NAMES.parenthetical,
      NODE_NAMES.dialogue,
      NODE_NAMES.transition,
    ]) {
      expect(resolveEnter({ current: type, isEmpty: true })).toEqual({
        kind: 'convert',
        to: NODE_NAMES.action,
      });
    }
  });

  it('empty Action keeps splitting into more Action (default behavior)', () => {
    expect(resolveEnter({ current: NODE_NAMES.action, isEmpty: true })).toEqual({
      kind: 'split',
      to: NODE_NAMES.action,
    });
  });

  it('passes through for unknown node types', () => {
    expect(resolveEnter({ current: 'paragraph', isEmpty: false })).toEqual({
      kind: 'passthrough',
    });
  });
});

describe('resolveEnter — two-press sequence', () => {
  it('press-1 splits to Dialogue, press-2 (now empty Dialogue) collapses to Action', () => {
    // Character, non-empty, Enter → split into Dialogue.
    const step1 = resolveEnter({ current: NODE_NAMES.character, isEmpty: false });
    expect(step1).toEqual({ kind: 'split', to: NODE_NAMES.dialogue });

    // Now cursor sits in a new, empty Dialogue. Second Enter collapses to Action.
    const step2 = resolveEnter({ current: NODE_NAMES.dialogue, isEmpty: true });
    expect(step2).toEqual({ kind: 'convert', to: NODE_NAMES.action });
  });
});
