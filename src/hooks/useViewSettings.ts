import { useCallback, useEffect, useState } from 'react';

/**
 * View-level preferences that aren't script data. Stored in
 * localStorage so they persist across sessions but never touch the
 * Fountain source (a user's "Show page breaks" preference doesn't
 * leak into someone else's copy of the screenplay).
 *
 * Add new settings by extending the interface + DEFAULTS. `load()`
 * merges stored JSON over DEFAULTS so old persisted objects don't
 * break when new settings arrive.
 */

const STORAGE_KEY = 'screenwriter:viewSettings';

export interface ViewSettings {
  showPageBreaks: boolean;
}

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  showPageBreaks: false,
};

function load(): ViewSettings {
  if (typeof window === 'undefined') return DEFAULT_VIEW_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VIEW_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ViewSettings>;
    return { ...DEFAULT_VIEW_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_VIEW_SETTINGS;
  }
}

function save(settings: ViewSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Write failures (quota, private-mode Safari) are a non-event —
    // the in-memory state stays authoritative for the session.
  }
}

export interface UseViewSettingsResult {
  settings: ViewSettings;
  update: (patch: Partial<ViewSettings>) => void;
}

export function useViewSettings(): UseViewSettingsResult {
  const [settings, setSettings] = useState<ViewSettings>(load);

  useEffect(() => {
    save(settings);
  }, [settings]);

  const update = useCallback((patch: Partial<ViewSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  return { settings, update };
}
