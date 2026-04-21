import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('merges classnames and resolves tailwind conflicts', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-sm font-bold', undefined, false && 'hidden', 'text-lg')).toBe(
      'font-bold text-lg',
    );
  });
});
