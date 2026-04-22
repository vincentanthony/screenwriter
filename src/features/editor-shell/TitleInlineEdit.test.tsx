import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TitleInlineEdit } from './TitleInlineEdit';

/**
 * Harness that holds the title in state so the component behaves as
 * it would under the real ScriptEditor (external state updates after
 * onRename). Exposes a ref-style global so tests can read the latest
 * committed title without introspecting mock.calls shape-by-shape.
 */
function Harness({
  initial,
  onRename,
}: {
  initial: string;
  onRename?: (title: string) => void;
}) {
  const [title, setTitle] = useState(initial);
  return (
    <TitleInlineEdit
      title={title}
      onRename={(next) => {
        setTitle(next);
        onRename?.(next);
      }}
    />
  );
}

describe('TitleInlineEdit — view mode', () => {
  it('renders the title inside a keyboard-focusable button', () => {
    render(<Harness initial="My Script" />);
    const btn = screen.getByRole('button', { name: /rename script/i });
    expect(btn).toHaveTextContent('My Script');
  });

  it('falls back to "Untitled" when the title is an empty string', () => {
    render(<Harness initial="" />);
    expect(screen.getByRole('button', { name: /rename script/i })).toHaveTextContent(
      'Untitled',
    );
  });
});

describe('TitleInlineEdit — entering edit mode', () => {
  it('swaps the button for an input when clicked', async () => {
    const user = userEvent.setup();
    render(<Harness initial="My Script" />);
    await user.click(screen.getByRole('button', { name: /rename script/i }));
    expect(screen.getByLabelText(/script title/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rename script/i })).not.toBeInTheDocument();
  });

  it('pre-fills the input with the current title and selects it', async () => {
    const user = userEvent.setup();
    render(<Harness initial="My Script" />);
    await user.click(screen.getByRole('button', { name: /rename script/i }));
    const input = screen.getByLabelText(/script title/i) as HTMLInputElement;
    expect(input).toHaveValue('My Script');
    // Selection spans the whole text, so a fresh keystroke replaces it.
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('My Script'.length);
  });
});

describe('TitleInlineEdit — commit paths', () => {
  it('Enter commits the new title (trimmed) and exits edit mode', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<Harness initial="Old Title" onRename={onRename} />);

    await user.click(screen.getByRole('button', { name: /rename script/i }));
    const input = screen.getByLabelText(/script title/i);
    await user.clear(input);
    await user.type(input, '  New Title  {enter}');

    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith('New Title');
    // Exited edit mode → button is back.
    expect(screen.getByRole('button', { name: /rename script/i })).toHaveTextContent(
      'New Title',
    );
  });

  it('blur commits the new title (same semantics as Enter)', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<Harness initial="Old" onRename={onRename} />);

    await user.click(screen.getByRole('button', { name: /rename script/i }));
    const input = screen.getByLabelText(/script title/i);
    await user.clear(input);
    await user.type(input, 'Via Blur');
    // Tab out of the input → fires blur → commits.
    await user.tab();

    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith('Via Blur');
  });

  it('no-ops when the new title equals the old (even after whitespace trim)', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<Harness initial="Same Name" onRename={onRename} />);

    await user.click(screen.getByRole('button', { name: /rename script/i }));
    const input = screen.getByLabelText(/script title/i);
    // User clears and retypes the identical title with stray whitespace.
    await user.clear(input);
    await user.type(input, '  Same Name  {enter}');

    expect(onRename).not.toHaveBeenCalled();
    // Still exits edit mode.
    expect(screen.getByRole('button', { name: /rename script/i })).toBeInTheDocument();
  });
});

describe('TitleInlineEdit — cancel paths', () => {
  it('Esc reverts the input and exits edit mode without calling onRename', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<Harness initial="Keep Me" onRename={onRename} />);

    await user.click(screen.getByRole('button', { name: /rename script/i }));
    const input = screen.getByLabelText(/script title/i);
    await user.clear(input);
    await user.type(input, 'Bogus');
    await user.keyboard('{Escape}');

    expect(onRename).not.toHaveBeenCalled();
    // Button returns showing the ORIGINAL title — the typed-in "Bogus"
    // did not leak through the blur-commit fallback.
    expect(screen.getByRole('button', { name: /rename script/i })).toHaveTextContent(
      'Keep Me',
    );
  });
});
