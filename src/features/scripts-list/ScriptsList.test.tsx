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

function renderList(onDelete = vi.fn()) {
  render(
    <MemoryRouter>
      <ScriptsList scripts={[fixture]} onDelete={onDelete} />
    </MemoryRouter>,
  );
  return { onDelete };
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
