import type { MainAreaProps } from '../panels';
import { getTitlePageFieldValue } from '../titlePageFields';

/**
 * Industry-standard screenplay title page rendered on a US Letter
 * (8.5" × 11") page. The page is an actual 8.5in × 11in div so all
 * positioning stays accurate — no percentage math, no viewport
 * scaling math, just CSS inch units the way a manual screenplay
 * layout would. Narrow viewports scroll horizontally; at v1 this is
 * an acceptable trade-off versus getting zoom controls right.
 *
 * Typography:
 *   - Courier Prime 12pt (loaded via @fontsource in main.tsx; falls
 *     back to system Courier if the network/installation fails).
 *   - Page margins: 1.5" left, 1" right, 1" top, 1" bottom — the
 *     standard screenplay margins. The title block starts ~3.5"
 *     down from the top; the contact block sits in the bottom-left
 *     corner with the draft date in the bottom-right, a convention
 *     that's been stable since Hollywood went to courier in the 40s.
 *
 * Empty fields are OMITTED from the DOM entirely — the preview shows
 * the actual page, not placeholder text. If the writer hasn't entered
 * anything, the page is genuinely blank.
 */

export function TitlePagePreview({ titlePage }: MainAreaProps) {
  const title = getTitlePageFieldValue(titlePage, 'Title');
  const credit = getTitlePageFieldValue(titlePage, 'Credit');
  const author = getTitlePageFieldValue(titlePage, 'Author');
  const source = getTitlePageFieldValue(titlePage, 'Source');
  const draftDate = getTitlePageFieldValue(titlePage, 'Draft date');
  const contact = getTitlePageFieldValue(titlePage, 'Contact');
  const notes = getTitlePageFieldValue(titlePage, 'Notes');
  const copyright = getTitlePageFieldValue(titlePage, 'Copyright');

  const hasUpper = Boolean(title || credit || author);
  const hasLowerLeft = Boolean(notes || copyright || source || contact);

  return (
    <div
      data-testid="title-page-preview"
      className="flex h-full items-start justify-center overflow-auto bg-muted/40 p-8"
    >
      <div
        data-testid="title-page-paper"
        style={{
          width: '8.5in',
          minHeight: '11in',
          position: 'relative',
          background: 'white',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          fontFamily: '"Courier Prime", "Courier New", Courier, monospace',
          fontSize: '12pt',
          lineHeight: 1.2,
          color: '#111',
        }}
      >
        {hasUpper && (
          <div
            style={{
              position: 'absolute',
              top: '3.5in',
              left: '1.5in',
              right: '1in',
              textAlign: 'center',
            }}
          >
            {title && (
              <div
                data-testid="preview-title"
                style={{ textTransform: 'uppercase', textDecoration: 'underline' }}
              >
                {title}
              </div>
            )}
            {credit && (
              <div data-testid="preview-credit" style={{ marginTop: '1.2em' }}>
                {credit}
              </div>
            )}
            {author && (
              <div data-testid="preview-author" style={{ marginTop: '1.2em' }}>
                {author}
              </div>
            )}
          </div>
        )}

        {hasLowerLeft && (
          <div
            style={{
              position: 'absolute',
              bottom: '1in',
              left: '1.5in',
              maxWidth: '4.5in',
            }}
          >
            {notes && (
              <div
                data-testid="preview-notes"
                style={{ marginBottom: '0.8em', whiteSpace: 'pre-wrap' }}
              >
                {notes}
              </div>
            )}
            {copyright && (
              <div data-testid="preview-copyright" style={{ marginBottom: '0.8em' }}>
                {copyright}
              </div>
            )}
            {source && (
              <div data-testid="preview-source" style={{ marginBottom: '0.5em' }}>
                {source}
              </div>
            )}
            {contact && (
              <div data-testid="preview-contact" style={{ whiteSpace: 'pre-wrap' }}>
                {contact}
              </div>
            )}
          </div>
        )}

        {draftDate && (
          <div
            data-testid="preview-draft-date"
            style={{
              position: 'absolute',
              bottom: '1in',
              right: '1in',
              textAlign: 'right',
            }}
          >
            {draftDate}
          </div>
        )}
      </div>
    </div>
  );
}
