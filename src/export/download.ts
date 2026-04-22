/**
 * Trigger a browser file download for a string payload. Browser-only —
 * no tests because there's nothing to assert that isn't tautological
 * with the standard pattern (Blob → URL.createObjectURL → <a download>
 * → click → revokeObjectURL). Real-world correctness is verified by
 * actually downloading from the running app.
 */
export function downloadStringAsFile(
  filename: string,
  contents: string,
  mimeType = 'application/octet-stream',
): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Some browsers require the anchor be in the DOM for the click to
  // dispatch; appending and immediately removing is the safe pattern.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Free the object URL on the next tick — keeps memory tidy without
  // racing the browser's download dispatch.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Slugify a string for use as a filename:
 *   - Strip leading/trailing whitespace
 *   - Replace runs of whitespace and slashes with single underscores
 *   - Drop characters that are illegal on common filesystems
 *   - Collapse multiple underscores
 *   - Cap length to 80 chars
 *
 * Returns null for an empty/all-whitespace input — the caller should
 * fall back to a default like "screenplay".
 */
export function slugifyFilename(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const slug = trimmed
    .replace(/[/\\]+/g, '_')
    .replace(/[<>:"|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return slug.length > 0 ? slug : null;
}
