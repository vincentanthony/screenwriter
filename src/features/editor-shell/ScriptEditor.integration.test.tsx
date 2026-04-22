import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import { EditorPage } from '@/pages/EditorPage';
import { setRepositoryForTesting } from '@/storage/repository';
import { DexieScriptRepository } from '@/storage/dexie';
import { ScreenwriterDB } from '@/storage/schema';

/**
 * Mode-switching integration tests. These mount the real EditorPage
 * (including the real TipTap editor, autosave, drawer, etc.) against
 * a fresh fake-indexeddb so the behavior is end-to-end, not stubbed.
 *
 * Each test seeds its own script record and verifies how the drawer's
 * active panel shapes the main area — specifically, that flipping
 * between editor mode and Title Page mode preserves the editor's
 * mounted DOM rather than tearing it down and rebuilding.
 */

async function setupWithScript(fountain: string) {
  globalThis.indexedDB = new IDBFactory();
  const repo = new DexieScriptRepository(
    new ScreenwriterDB(`test-${Math.random().toString(36).slice(2)}`),
  );
  setRepositoryForTesting(repo);
  const script = await repo.create({ title: 'Test Script', fountain });
  return script;
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

// Each test gets its own clean repo + IDB.
function afterEachCleanup() {
  setRepositoryForTesting(null);
}

describe('EditorPage — layout (independent scroll regions)', () => {
  it('page root is h-screen flex-col (viewport frame, document does not scroll)', async () => {
    const script = await setupWithScript('INT. ROOM - DAY\n');
    try {
      renderAt(`/scripts/${script.id}`);
      const root = await screen.findByTestId('editor-page');
      // Fixed viewport height so document scroll can't bleed drawer + main.
      expect(root).toHaveClass('h-screen');
      expect(root).toHaveClass('flex-col');
    } finally {
      afterEachCleanup();
    }
  });

  it('top-bar row is flex-shrink-0 (stays above the scroll regions)', async () => {
    const script = await setupWithScript('INT. ROOM - DAY\n');
    try {
      renderAt(`/scripts/${script.id}`);
      const topbar = await screen.findByTestId('editor-page-topbar');
      expect(topbar).toHaveClass('flex-shrink-0');
    } finally {
      afterEachCleanup();
    }
  });

  it('body row is flex-1 min-h-0 flex (min-h-0 unlocks flex children shrinking for overflow)', async () => {
    const script = await setupWithScript('INT. ROOM - DAY\n');
    try {
      renderAt(`/scripts/${script.id}`);
      const body = await screen.findByTestId('editor-page-body');
      expect(body).toHaveClass('flex-1');
      expect(body).toHaveClass('min-h-0');
      expect(body).toHaveClass('flex');
    } finally {
      afterEachCleanup();
    }
  });

  it('main column has min-h-0 + flex-col so the editor view scrolls INSIDE it, not the page', async () => {
    const script = await setupWithScript('INT. ROOM - DAY\n');
    try {
      renderAt(`/scripts/${script.id}`);
      const main = await screen.findByTestId('editor-main');
      expect(main).toHaveClass('min-h-0');
      expect(main).toHaveClass('flex-col');
      expect(main).toHaveClass('flex-1');
    } finally {
      afterEachCleanup();
    }
  });

  it('editor-view container is overflow-y-auto (its own scroll region, independent of drawer)', async () => {
    const script = await setupWithScript('INT. ROOM - DAY\n');
    try {
      renderAt(`/scripts/${script.id}`);
      const view = await screen.findByTestId('editor-view');
      expect(view).toHaveClass('overflow-y-auto');
      expect(view).toHaveClass('min-h-0');
    } finally {
      afterEachCleanup();
    }
  });
});

describe('EditorPage — mode orchestration', () => {
  it('renders the editor view (not the preview) when no panel is active', async () => {
    const script = await setupWithScript('INT. ROOM - DAY\n');
    try {
      renderAt(`/scripts/${script.id}`);

      const view = await screen.findByTestId('editor-view');
      expect(view).toBeInTheDocument();
      expect(view).not.toHaveClass('hidden');
      expect(screen.queryByTestId('title-page-preview')).not.toBeInTheDocument();
    } finally {
      afterEachCleanup();
    }
  });

  it('renders the title-page preview when ?panel=titlePage is in the URL', async () => {
    const script = await setupWithScript(
      'Title: My Script\nAuthor: Claude\n\nINT. ROOM - DAY\n',
    );
    try {
      renderAt(`/scripts/${script.id}?panel=titlePage`);

      expect(await screen.findByTestId('title-page-preview')).toBeInTheDocument();
      // Editor view is still in the DOM, just hidden.
      const view = screen.getByTestId('editor-view');
      expect(view).toHaveClass('hidden');

      // The preview reflects the script's title-page fields.
      expect(screen.getByTestId('preview-title')).toHaveTextContent('My Script');
      expect(screen.getByTestId('preview-author')).toHaveTextContent('Claude');
    } finally {
      afterEachCleanup();
    }
  });

  it('keeps the editor view mounted (same DOM node) when switching to Title Page', async () => {
    const script = await setupWithScript('INT. ROOM - DAY\n');
    const user = userEvent.setup();
    try {
      renderAt(`/scripts/${script.id}`);

      const editorViewBefore = await screen.findByTestId('editor-view');
      expect(editorViewBefore).not.toHaveClass('hidden');

      // Open drawer, navigate to Title Page.
      await user.click(screen.getByRole('button', { name: /open drawer/i }));
      await user.click(screen.getByRole('button', { name: /title page/i }));

      // Same DOM node as before — the editor was NOT remounted.
      await waitFor(() => {
        expect(screen.getByTestId('editor-view')).toHaveClass('hidden');
      });
      expect(screen.getByTestId('editor-view')).toBe(editorViewBefore);
      // And the preview is visible.
      expect(await screen.findByTestId('title-page-preview')).toBeInTheDocument();
    } finally {
      afterEachCleanup();
    }
  });

  it('back-arrow on the Title Page panel returns to the editor view', async () => {
    const script = await setupWithScript('Title: X\n\nINT. ROOM - DAY\n');
    const user = userEvent.setup();
    try {
      renderAt(`/scripts/${script.id}?panel=titlePage`);

      await screen.findByTestId('title-page-preview');
      const editorViewWhileHidden = screen.getByTestId('editor-view');
      expect(editorViewWhileHidden).toHaveClass('hidden');

      // Back arrow in the drawer header.
      await user.click(
        screen.getByRole('button', { name: /back to drawer panels/i }),
      );

      await waitFor(() => {
        expect(screen.queryByTestId('title-page-preview')).not.toBeInTheDocument();
      });
      const editorViewAfter = screen.getByTestId('editor-view');
      expect(editorViewAfter).not.toHaveClass('hidden');
      // Same DOM reference — drawer transitions don't remount the editor.
      expect(editorViewAfter).toBe(editorViewWhileHidden);
    } finally {
      afterEachCleanup();
    }
  });

  it('renders the editor view when the drawer is open on the panel LIST (no MainArea)', async () => {
    const script = await setupWithScript('INT. ROOM - DAY\n');
    try {
      renderAt(`/scripts/${script.id}?panel=list`);

      const view = await screen.findByTestId('editor-view');
      expect(view).not.toHaveClass('hidden');
      expect(screen.queryByTestId('title-page-preview')).not.toBeInTheDocument();
    } finally {
      afterEachCleanup();
    }
  });

  it('live-updates the preview as the title-page form changes (no debounce on preview)', async () => {
    const script = await setupWithScript('Title: Orig\n\nINT. ROOM - DAY\n');
    const user = userEvent.setup();
    try {
      renderAt(`/scripts/${script.id}?panel=titlePage`);

      // Title-page state extraction is async (script load → fountain
      // parse → setTitlePage). Wait for the initial value to settle.
      await waitFor(() => {
        expect(screen.getByTestId('preview-title')).toHaveTextContent('Orig');
      });

      // The Title input sits inside the drawer; typing should be
      // reflected in the preview on every keystroke.
      const titleInput = screen.getByLabelText('Title');
      await user.clear(titleInput);
      await user.type(titleInput, 'New');

      await waitFor(() => {
        expect(screen.getByTestId('preview-title')).toHaveTextContent('New');
      });
    } finally {
      afterEachCleanup();
    }
  });
});
