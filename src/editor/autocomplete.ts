import type { ScreenplayElement } from '@/fountain/types';

/**
 * Autocomplete helper — derives character names, scene locations, and
 * time tokens from the current ScreenplayElement[]. Pure function, zero
 * editor coupling: pass the elements you have, get the dictionaries
 * back. ScriptEditor is responsible for threading the current doc into
 * the Suggestion extensions.
 */

export interface AutocompleteSets {
  /** Distinct character names, deduped case-insensitively, returned UPPERCASE, sorted. */
  characters: string[];
  /** Distinct locations, UPPERCASE, sorted. */
  locations: string[];
  /** Distinct time-of-day tokens from scene headings, UPPERCASE, sorted. */
  times: string[];
}

/**
 * Leading INT./EXT./EST./I/E. (incl. combo `INT./EXT.`) plus trailing whitespace.
 * Case-insensitive on purpose so we strip cleanly even if the heading text
 * isn't uppercase yet (uppercasing happens on serialize).
 */
const SCENE_PREFIX_RE =
  /^(INT\.\/EXT\.?|EXT\.\/INT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s*/i;

export function extractAutocompleteSets(elements: ScreenplayElement[]): AutocompleteSets {
  // Character dedup by uppercase canonical form.
  const charMap = new Map<string, string>();
  const locSet = new Set<string>();
  const timeSet = new Set<string>();

  for (const el of elements) {
    if (el.type === 'character') {
      const trimmed = el.text.trim();
      if (trimmed.length === 0) continue;
      const canonical = trimmed.toUpperCase();
      if (!charMap.has(canonical)) charMap.set(canonical, canonical);
      continue;
    }
    if (el.type === 'scene') {
      const { location, time } = splitSceneHeading(el.text);
      if (location) locSet.add(location);
      if (time) timeSet.add(time);
    }
  }

  return {
    characters: Array.from(charMap.values()).sort((a, b) => a.localeCompare(b)),
    locations: Array.from(locSet).sort((a, b) => a.localeCompare(b)),
    times: Array.from(timeSet).sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Split a scene heading into location + time.
 *
 *   "INT. COFFEE SHOP - DAY"              → { "COFFEE SHOP", "DAY" }
 *   "EXT. DESERT - CONTINUOUS"            → { "DESERT", "CONTINUOUS" }
 *   "INT. ALICE'S APARTMENT - KITCHEN - NIGHT"
 *                                         → { "ALICE'S APARTMENT - KITCHEN", "NIGHT" }
 *   "INT. PARKING LOT"                    → { "PARKING LOT", null }
 *
 * The time is whatever follows the LAST ` - ` (so internal " - " inside
 * multi-segment locations is preserved). Both outputs are UPPERCASE.
 */
export function splitSceneHeading(text: string): {
  location: string | null;
  time: string | null;
} {
  const withoutPrefix = text.replace(SCENE_PREFIX_RE, '').trim();
  if (withoutPrefix.length === 0) return { location: null, time: null };

  const lastDash = withoutPrefix.lastIndexOf(' - ');
  if (lastDash === -1) {
    return { location: withoutPrefix.toUpperCase(), time: null };
  }

  const rawLocation = withoutPrefix.slice(0, lastDash).trim();
  const rawTime = withoutPrefix.slice(lastDash + 3).trim();
  return {
    location: rawLocation.length > 0 ? rawLocation.toUpperCase() : null,
    time: rawTime.length > 0 ? rawTime.toUpperCase() : null,
  };
}

/**
 * Common Final Draft time tokens, pre-baked. Merged with per-script
 * times from extractAutocompleteSets at the Suggestion layer if/when
 * Stage C is implemented.
 */
export const DEFAULT_TIME_TOKENS: readonly string[] = [
  'DAY',
  'NIGHT',
  'MORNING',
  'AFTERNOON',
  'EVENING',
  'DAWN',
  'DUSK',
  'CONTINUOUS',
  'LATER',
  'MOMENTS LATER',
  'SAME',
] as const;

/**
 * Canonical scene heading prefixes used by Stage A's static picker.
 * INT./EXT. come first because they're by far the most common; I/E. is
 * rarer but handy for chase scenes where the camera crosses in and out.
 */
export const SCENE_HEADING_PREFIXES: readonly string[] = ['INT.', 'EXT.', 'I/E.'] as const;
