import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useDrawerState } from './useDrawerState';

function wrap(initialPath: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/scripts/:id" element={<>{children}</>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('useDrawerState — read from URL', () => {
  it('defaults to closed when no ?panel param is present', () => {
    const { result } = renderHook(() => useDrawerState(), {
      wrapper: wrap('/scripts/x'),
    });
    expect(result.current.state).toEqual({ kind: 'closed' });
  });

  it('returns { kind: "list" } when the URL has ?panel=list', () => {
    const { result } = renderHook(() => useDrawerState(), {
      wrapper: wrap('/scripts/x?panel=list'),
    });
    expect(result.current.state).toEqual({ kind: 'list' });
  });

  it('returns { kind: "panel", panelId } for any other ?panel= value', () => {
    const { result } = renderHook(() => useDrawerState(), {
      wrapper: wrap('/scripts/x?panel=titlePage'),
    });
    expect(result.current.state).toEqual({ kind: 'panel', panelId: 'titlePage' });
  });
});

describe('useDrawerState — write + URL sync', () => {
  it('transitions closed → list → panel → closed via controller methods', () => {
    const { result } = renderHook(() => useDrawerState(), {
      wrapper: wrap('/scripts/x'),
    });
    expect(result.current.state).toEqual({ kind: 'closed' });

    act(() => result.current.openList());
    expect(result.current.state).toEqual({ kind: 'list' });

    act(() => result.current.openPanel('titlePage'));
    expect(result.current.state).toEqual({ kind: 'panel', panelId: 'titlePage' });

    act(() => result.current.close());
    expect(result.current.state).toEqual({ kind: 'closed' });
  });

  it('openList from panel view returns to list (back-arrow behavior)', () => {
    const { result } = renderHook(() => useDrawerState(), {
      wrapper: wrap('/scripts/x?panel=titlePage'),
    });
    expect(result.current.state).toEqual({ kind: 'panel', panelId: 'titlePage' });

    act(() => result.current.openList());
    expect(result.current.state).toEqual({ kind: 'list' });
  });

  it('reflects state changes in the URL search param', () => {
    const { result } = renderHook(
      () => {
        const ctl = useDrawerState();
        const loc = useLocation();
        return { ctl, loc };
      },
      { wrapper: wrap('/scripts/x') },
    );

    act(() => result.current.ctl.openPanel('titlePage'));
    expect(result.current.loc.search).toBe('?panel=titlePage');

    act(() => result.current.ctl.openList());
    expect(result.current.loc.search).toBe('?panel=list');

    act(() => result.current.ctl.close());
    expect(result.current.loc.search).toBe('');
  });
});
