import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import { EditorPage } from '@/pages/EditorPage';
import { setRepositoryForTesting } from '@/storage/repository';
import { DexieScriptRepository } from '@/storage/dexie';
import { ScreenwriterDB } from '@/storage/schema';

/**
 * Regression coverage for the "page breaks missing after reload" bug.
 *
 * Before the fix, the pagination effect fired on mount — BEFORE the
 * editor had hydrated its doc from the loaded Fountain — so it ran
 * against an empty doc and produced zero page-break positions. Since
 * `setContent(doc, false)` suppresses the `update` event by design,
 * nothing triggered a second pagination pass once the doc was real.
 *
 * The fix: ScriptEditor gates its pagination "kick" effect on the
 * new `hydrated` boolean exposed by useScreenplayEditor, so it runs
 * exactly once after hydration completes (plus every time the
 * "Show page breaks" toggle flips).
 *
 * This test mocks src/pagination/paginate so we can observe call
 * counts and argument shapes. The mock is scoped to this file — other
 * test files use the real implementation.
 */

// Module mock — hoisted by vitest so it's in effect before any import
// below sees the paginate symbol. importActual preserves every other
// export (types, helpers, etc.) without re-stubbing.
vi.mock('@/pagination/paginate', async () => {
  const actual = await vi.importActual<typeof import('@/pagination/paginate')>(
    '@/pagination/paginate',
  );
  return {
    ...actual,
    paginate: vi.fn(actual.paginate),
  };
});

import { paginate } from '@/pagination/paginate';

const VIEW_SETTINGS_KEY = 'screenwriter:viewSettings';

async function setupWithScript(fountain: string) {
  globalThis.indexedDB = new IDBFactory();
  const repo = new DexieScriptRepository(
    new ScreenwriterDB(`test-${Math.random().toString(36).slice(2)}`),
  );
  setRepositoryForTesting(repo);
  const script = await repo.create({ title: 'Test Script', fountain });
  return { repo, script };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/scripts/:id" element={<EditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  setRepositoryForTesting(null);
  vi.mocked(paginate).mockClear();
  window.localStorage.clear();
});

describe('ScriptEditor — pagination triggers after hydration', () => {
  it('runs paginate() after initial hydration when showPageBreaks is ON', async () => {
    window.localStorage.setItem(
      VIEW_SETTINGS_KEY,
      JSON.stringify({ showPageBreaks: true }),
    );

    const { script } = await setupWithScript('INT. ROOM - DAY\n\nShe walks in.\n');

    renderAt(`/scripts/${script.id}`);

    // Hydration resolves asynchronously (async draft check + effect
    // chain). After it completes, the gated effect fires paginate.
    await waitFor(
      () => {
        expect(vi.mocked(paginate)).toHaveBeenCalled();
      },
      { timeout: 1500 },
    );
  });

  it('does NOT write to storage (repo.update) as a side effect of hydration + paginate', async () => {
    window.localStorage.setItem(
      VIEW_SETTINGS_KEY,
      JSON.stringify({ showPageBreaks: true }),
    );

    const { repo, script } = await setupWithScript(
      'INT. ROOM - DAY\n\nShe walks in.\n',
    );
    const updateSpy = vi.spyOn(repo, 'update');

    renderAt(`/scripts/${script.id}`);

    await waitFor(() => {
      expect(vi.mocked(paginate)).toHaveBeenCalled();
    });

    // Give any debounced autosave a generous window to fire if it
    // were going to — the default main-save debounce is 300 ms, so
    // 500 ms here is enough to catch a spurious write.
    await new Promise((r) => setTimeout(r, 500));

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('does not call paginate when showPageBreaks is OFF (default), even after hydration', async () => {
    // Default — no localStorage entry, so showPageBreaks defaults to false.
    const { script } = await setupWithScript('INT. ROOM - DAY\n');

    renderAt(`/scripts/${script.id}`);

    // Wait for the editor to render so we know hydration had a chance.
    await screen.findByTestId('editor-view');
    // Plus a debounce tick.
    await new Promise((r) => setTimeout(r, 150));

    // The runPagination function short-circuits before calling paginate
    // when showPageBreaks is off. It dispatches an empty-positions
    // meta message, but paginate() itself is never invoked.
    expect(vi.mocked(paginate)).not.toHaveBeenCalled();
  });
});
