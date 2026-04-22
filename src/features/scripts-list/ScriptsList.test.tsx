import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ScriptsList } from './ScriptsList';
import type { ScriptMeta } from '@/types/script';

const fixture: ScriptMeta = {
  id: 'abc123',
  title: 'Great American Novel',
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

function renderList(onDelete = vi.fn(), onRename = vi.fn()) {
  render(
    <MemoryRouter>
      <ScriptsList scripts={[fixture]} onDelete={onDelete} onRename={onRename} />
    </MemoryRouter>,
  );
  return { onDelete, onRename };
}

describe('ScriptsList — delete confirmation', () => {
  it('opens the confirm dialog when the trash icon is clicked; Cancel does NOT call onDelete', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderList();

    await user.click(
      screen.getByRole('button', { name: /^delete great american novel$/i }),
    );

    // Dialog appears with the required title + an interpolated body.
    expect(
      await screen.findByRole('heading', { name: /delete this script\?/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/great american novel.+will be permanently deleted/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(onDelete).not.toHaveBeenCalled();
  });

  it('Delete button in the dialog DOES call onDelete with the script id', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderList();

    await user.click(
      screen.getByRole('button', { name: /^delete great american novel$/i }),
    );
    // The dialog's own Delete button — accessible name is the literal
    // "Delete" (no title suffix), so an exact regex disambiguates from
    // the trash trigger.
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(fixture.id);
  });
});

describe('ScriptsList — rename', () => {
  it('renders an edit button next to the trash (one per script)', () => {
    renderList();
    expect(
      screen.getByRole('button', { name: /^rename great american novel$/i }),
    ).toBeInTheDocument();
  });

  it('clicking edit opens a dialog with the current title pre-filled', async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(
      screen.getByRole('button', { name: /^rename great american novel$/i }),
    );

    expect(
      await screen.findByRole('heading', { name: /rename script/i }),
    ).toBeInTheDocument();
    const input = screen.getByLabelText(/script title/i);
    expect(input).toHaveValue(fixture.title);
  });

  it('submitting the dialog calls onRename with the new value', async () => {
    const user = userEvent.setup();
    const { onRename } = renderList();

    await user.click(
      screen.getByRole('button', { name: /^rename great american novel$/i }),
    );
    const input = await screen.findByLabelText(/script title/i);
    // Clear and type a new title.
    await user.clear(input);
    await user.type(input, 'Renamed');
    // Either the dialog's Rename button or Enter commits; test the button path.
    await user.click(screen.getByRole('button', { name: /^rename$/i }));

    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith(fixture.id, 'Renamed');
  });

  it('Cancel does NOT call onRename', async () => {
    const user = userEvent.setup();
    const { onRename } = renderList();

    await user.click(
      screen.getByRole('button', { name: /^rename great american novel$/i }),
    );
    const input = await screen.findByLabelText(/script title/i);
    await user.clear(input);
    await user.type(input, 'Some Other Name');
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(onRename).not.toHaveBeenCalled();
  });

  it('no-ops if the title is unchanged (ignoring surrounding whitespace)', async () => {
    const user = userEvent.setup();
    const { onRename } = renderList();

    await user.click(
      screen.getByRole('button', { name: /^rename great american novel$/i }),
    );
    const input = await screen.findByLabelText(/script title/i);
    // User types identical content (possibly with stray whitespace).
    await user.clear(input);
    await user.type(input, `  ${fixture.title}  `);
    await user.click(screen.getByRole('button', { name: /^rename$/i }));

    expect(onRename).not.toHaveBeenCalled();
  });

  it('pressing Enter inside the input commits the rename', async () => {
    const user = userEvent.setup();
    const { onRename } = renderList();

    await user.click(
      screen.getByRole('button', { name: /^rename great american novel$/i }),
    );
    const input = await screen.findByLabelText(/script title/i);
    await user.clear(input);
    await user.type(input, 'Via Enter{enter}');

    expect(onRename).toHaveBeenCalledWith(fixture.id, 'Via Enter');
  });
});
