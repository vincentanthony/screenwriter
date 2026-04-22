import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeCost,
  computeCostFineCents,
  formatCostCents,
  formatCostFineCents,
  MODEL_RATES,
} from './pricing';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('computeCost — known models', () => {
  it('charges Sonnet 4.5 at $3/M input + $15/M output', () => {
    // 1,000,000 input tokens at $3/M = $3.00 = 300 cents
    // 100,000 output tokens at $15/M = $1.50 = 150 cents
    expect(computeCost('claude-sonnet-4-5', 1_000_000, 100_000)).toBe(450);
  });

  it('charges Haiku 4.5 at $1/M input + $5/M output', () => {
    expect(computeCost('claude-haiku-4-5', 1_000_000, 100_000)).toBe(150);
  });

  it('charges Opus 4.7 at $5/M input + $25/M output', () => {
    expect(computeCost('claude-opus-4-7', 1_000_000, 100_000)).toBe(750);
  });

  it('rounds small-value calls to the nearest cent (>=0.5 rounds up)', () => {
    // 500 input tokens of Sonnet = 500 * $3 / 1M = $0.0015 = 0.15 cents
    // 100 output tokens of Sonnet = 100 * $15 / 1M = $0.0015 = 0.15 cents
    // Total 0.30 cents — rounds to 0 cents at integer cents.
    expect(computeCost('claude-sonnet-4-5', 500, 100)).toBe(0);

    // 5,000 input tokens + 1,000 output tokens of Sonnet
    // = (5000 * 3 / 1e6 * 100) + (1000 * 15 / 1e6 * 100)
    // = 1.5 + 1.5 = 3 cents exactly
    expect(computeCost('claude-sonnet-4-5', 5000, 1000)).toBe(3);
  });

  it('returns 0 cents for zero tokens', () => {
    expect(computeCost('claude-sonnet-4-5', 0, 0)).toBe(0);
  });
});

describe('computeCost — unknown model', () => {
  it('returns 0 and logs a warning once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(computeCost('claude-future-9', 100_000, 50_000)).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Unknown model');
  });
});

describe('computeCostFineCents — sub-cent precision', () => {
  it('preserves fractional cents for small calls', () => {
    // 500 input of Sonnet = 0.15 cents; 100 output = 0.15 cents;
    // total 0.30 fractional cents.
    const f = computeCostFineCents('claude-sonnet-4-5', 500, 100);
    expect(f).toBeCloseTo(0.3, 10);
  });

  it('returns 0 for unknown models without warning', () => {
    expect(computeCostFineCents('mystery-model', 100, 100)).toBe(0);
  });
});

describe('formatCostCents', () => {
  it('formats zero explicitly', () => {
    expect(formatCostCents(0)).toBe('$0.00');
  });

  it('formats one cent as $0.01', () => {
    expect(formatCostCents(1)).toBe('$0.01');
  });

  it('formats larger amounts with two decimals', () => {
    expect(formatCostCents(12)).toBe('$0.12');
    expect(formatCostCents(1234)).toBe('$12.34');
  });
});

describe('formatCostFineCents', () => {
  it('returns $0.0000 for zero', () => {
    expect(formatCostFineCents(0)).toBe('$0.0000');
  });

  it('uses four decimals when below one cent', () => {
    expect(formatCostFineCents(0.3)).toBe('$0.0030');
  });

  it('uses two decimals at one cent or more', () => {
    expect(formatCostFineCents(1)).toBe('$0.01');
    expect(formatCostFineCents(50)).toBe('$0.50');
    expect(formatCostFineCents(1200)).toBe('$12.00');
  });
});

describe('MODEL_RATES', () => {
  it('lists every model whose cost tests depend on it', () => {
    // Guardrail: if someone deletes a rate without updating tests,
    // the deletion shows up here before silently zeroing out cost.
    expect(Object.keys(MODEL_RATES).sort()).toEqual([
      'claude-haiku-4-5',
      'claude-opus-4-7',
      'claude-sonnet-4-5',
    ]);
  });
});
