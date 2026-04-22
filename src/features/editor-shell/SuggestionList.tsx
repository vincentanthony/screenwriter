import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Keyboard-driven popup list for autocomplete suggestions.
 *
 * CRITICAL UX rule (enforced by the suggestion extensions, not this
 * component): selection is NEVER committed on blur or click-outside.
 * This component only emits `onSelect` when the user either clicks an
 * item or presses Enter/Tab. onKeyDown returns false for any key it
 * doesn't consume so the editor keeps handling the rest.
 */

export interface SuggestionListProps {
  items: string[];
  /** Invoked when the user accepts an item (click, Enter, or Tab). */
  onSelect: (item: string) => void;
}

export interface SuggestionListHandle {
  /** Called by @tiptap/suggestion's onKeyDown; returns true if handled. */
  onKeyDown(event: KeyboardEvent): boolean;
}

export const SuggestionList = forwardRef<SuggestionListHandle, SuggestionListProps>(
  function SuggestionList({ items, onSelect }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Reset to the first item whenever the filtered set changes.
    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown(event: KeyboardEvent): boolean {
          if (items.length === 0) return false;

          if (event.key === 'ArrowUp') {
            setSelectedIndex((i) => (i + items.length - 1) % items.length);
            return true;
          }
          if (event.key === 'ArrowDown') {
            setSelectedIndex((i) => (i + 1) % items.length);
            return true;
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            const item = items[selectedIndex];
            if (item !== undefined) onSelect(item);
            return true;
          }
          // Escape is swallowed by the suggestion extensions (they
          // dismiss the popup via onExit), so we don't need to handle
          // it here — but return false just in case so we don't block
          // the editor's own escape handling.
          return false;
        },
      }),
      [items, onSelect, selectedIndex],
    );

    if (items.length === 0) return null;

    return (
      <div
        role="listbox"
        className="min-w-[8rem] max-w-[20rem] overflow-hidden rounded-md border bg-background py-1 text-sm shadow-md"
      >
        {items.map((item, i) => (
          <button
            key={item}
            type="button"
            role="option"
            aria-selected={i === selectedIndex}
            // `onMouseDown` rather than `onClick` — the editor loses
            // focus on mousedown, so handling there lets us accept
            // before the suggestion exits via the focus change.
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(item);
            }}
            onMouseEnter={() => setSelectedIndex(i)}
            className={cn(
              'block w-full px-3 py-1 text-left font-screenplay uppercase tracking-wide',
              i === selectedIndex && 'bg-accent text-accent-foreground',
            )}
          >
            {item}
          </button>
        ))}
      </div>
    );
  },
);
