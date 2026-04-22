import type { TitlePageField } from '@/fountain/types';

/**
 * Immutably upsert a title-page field.
 *
 *   - If a field with `key` already exists, its value is replaced and the
 *     array's order is preserved.
 *   - If not, the new field is APPENDED (preserving existing insertion
 *     order is important so unknown/unrecognized keys stay wherever they
 *     were loaded).
 *
 * Pure function so the title-page panel keeps its update logic testable
 * without mounting React or the editor.
 */
export function upsertTitlePageField(
  fields: TitlePageField[],
  key: string,
  value: string,
): TitlePageField[] {
  if (fields.some((f) => f.key === key)) {
    return fields.map((f) => (f.key === key ? { key, value } : f));
  }
  return [...fields, { key, value }];
}

/**
 * Convenience lookup — returns empty string if the key isn't present so
 * the panel's inputs can always show a defined value.
 */
export function getTitlePageFieldValue(
  fields: TitlePageField[] | null,
  key: string,
): string {
  return fields?.find((f) => f.key === key)?.value ?? '';
}
