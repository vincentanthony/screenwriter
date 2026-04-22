import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TitlePageField } from '@/fountain/types';
import { DEFAULT_VIEW_SETTINGS } from '@/hooks/useViewSettings';
import { TitlePagePanel } from './TitlePagePanel';

/**
 * Harness that holds title-page state so typing into controlled inputs
 * actually updates them between keystrokes. Exposes the latest fields
 * via a ref so tests can assert on the current state without sampling
 * onUpdate mock.calls.
 */
function Harness({ initial }: { initial: TitlePageField[] }) {
  const [fields, setFields] = useState<TitlePageField[]>(initial);
  latestFields = fields;
  // TitlePagePanel ignores viewSettings but the shared DrawerPanelProps
  // contract requires them — stub safely.
  return (
    <TitlePagePanel
      titlePage={fields}
      onTitlePageUpdate={setFields}
      viewSettings={DEFAULT_VIEW_SETTINGS}
      onViewSettingsChange={vi.fn()}
    />
  );
}

let latestFields: TitlePageField[] = [];

describe('TitlePagePanel', () => {
  it('renders all eight known fields as labeled inputs', () => {
    render(<Harness initial={[]} />);
    for (const label of [
      'Title',
      'Credit',
      'Author',
      'Source',
      'Draft date',
      'Contact',
      'Notes',
      'Copyright',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('shows existing field values in their inputs', () => {
    render(
      <Harness
        initial={[
          { key: 'Title', value: 'My Script' },
          { key: 'Author', value: 'Claude' },
        ]}
      />,
    );
    expect(screen.getByLabelText('Title')).toHaveValue('My Script');
    expect(screen.getByLabelText('Author')).toHaveValue('Claude');
  });

  it('typing in a known field updates state and preserves unknown keys', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { key: 'Title', value: 'Orig' },
          { key: 'Language', value: 'French' }, // unknown — not in the form
        ]}
      />,
    );

    const titleInput = screen.getByLabelText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Renamed');

    // Final state should contain both the renamed Title and the preserved
    // Language entry (order intact).
    expect(latestFields).toEqual([
      { key: 'Title', value: 'Renamed' },
      { key: 'Language', value: 'French' },
    ]);
  });

  it('typing in a brand-new known field appends it', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ key: 'Title', value: 'X' }]} />);

    await user.type(screen.getByLabelText('Credit'), 'Written by');

    expect(latestFields).toContainEqual({ key: 'Title', value: 'X' });
    expect(latestFields).toContainEqual({ key: 'Credit', value: 'Written by' });
  });

  it('does not submit or reload on Enter inside an input', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { container } = render(
      <div onSubmit={onSubmit}>
        <Harness initial={[]} />
      </div>,
    );
    await user.type(screen.getByLabelText('Title'), 'Hello{enter}');
    // No submit bubbled up — the panel's own form handler prevents it.
    expect(onSubmit).not.toHaveBeenCalled();
    expect(container.querySelector('form')).toBeInTheDocument();
  });
});
