import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Clickable script title that swaps in-place for a text input on
 * click. Commits on Enter or blur; reverts on Esc. The two states
 * share the same typography and padding so the layout doesn't shift
 * between view and edit modes.
 *
 * Accessibility:
 *   - The static view is a <button> so it's keyboard-focusable via
 *     Tab without trapping anything behind a click.
 *   - The edit-mode input carries `aria-label="Script title"` for
 *     screen readers (the visible title is the value, not a label).
 *   - The commit/cancel model is the same as every text-edit control
 *     in the app: Enter commits, Esc reverts.
 *
 * Commit semantics (shared with the ScriptsList dialog):
 *   - Trim leading/trailing whitespace before comparing and saving.
 *   - If the trimmed value is identical to the current title, no
 *     onRename call fires — just exit edit mode.
 *   - An empty string is allowed. The static render falls back to
 *     "Untitled" for display, matching the app's convention.
 */

interface Props {
  title: string;
  /**
   * Invoked with the trimmed new title when the user commits an
   * actual change. Async — the component waits for it to resolve
   * before exiting edit mode (so a slow save can't get superseded
   * by the user clicking the title again).
   */
  onRename: (newTitle: string) => Promise<void> | void;
  className?: string;
}

export function TitleInlineEdit({ title, onRename, className }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  // Track whether the most recent exit was a cancel so the blur
  // handler — which also fires during Esc's programmatic blur —
  // doesn't re-commit after we've already reverted.
  const cancelingRef = useRef(false);

  // Keep the draft in sync with external title changes whenever we're
  // not actively editing. If the autosave layer refreshes `script` and
  // the title has moved, the static view reflects it.
  useEffect(() => {
    if (!isEditing) setDraft(title);
  }, [title, isEditing]);

  // When entering edit mode, focus the input and select all text so
  // typing replaces the title immediately.
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEdit = () => {
    setDraft(title);
    setIsEditing(true);
  };

  const commit = async () => {
    if (cancelingRef.current) {
      // Esc already reverted and blurred — swallow the resulting blur.
      cancelingRef.current = false;
      return;
    }
    const trimmed = draft.trim();
    if (trimmed !== title.trim()) {
      await onRename(trimmed);
    }
    setIsEditing(false);
  };

  const cancel = () => {
    cancelingRef.current = true;
    setDraft(title);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        aria-label="Script title"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={() => {
          void commit();
        }}
        className={cn(
          'truncate bg-transparent text-lg font-semibold tracking-tight',
          '-mx-1 rounded-sm px-1 outline-none ring-2 ring-ring',
          className,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      aria-label="Rename script"
      className={cn(
        'truncate text-left text-lg font-semibold tracking-tight',
        '-mx-1 rounded-sm px-1 hover:underline',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {title || 'Untitled'}
    </button>
  );
}
