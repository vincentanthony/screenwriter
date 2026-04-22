import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TitlePageField } from '@/fountain/types';
import { TitlePagePreview } from './TitlePagePreview';

const FULL: TitlePageField[] = [
  { key: 'Title', value: 'The Hero\'s Journey' },
  { key: 'Credit', value: 'Written by' },
  { key: 'Author', value: 'Test Writer' },
  { key: 'Source', value: 'Based on the novel by A. Doe' },
  { key: 'Draft date', value: 'January 2026' },
  { key: 'Contact', value: 'writer@example.com\n123 Story Lane\nHollywood, CA' },
  { key: 'Notes', value: 'Do not distribute.' },
  { key: 'Copyright', value: '© 2026' },
];

describe('TitlePagePreview — with all fields populated', () => {
  it('renders each field at its designated testid slot', () => {
    render(<TitlePagePreview titlePage={FULL} />);
    expect(screen.getByTestId('preview-title')).toHaveTextContent("The Hero's Journey");
    expect(screen.getByTestId('preview-credit')).toHaveTextContent('Written by');
    expect(screen.getByTestId('preview-author')).toHaveTextContent('Test Writer');
    expect(screen.getByTestId('preview-source')).toHaveTextContent(
      'Based on the novel by A. Doe',
    );
    expect(screen.getByTestId('preview-draft-date')).toHaveTextContent('January 2026');
    expect(screen.getByTestId('preview-contact')).toHaveTextContent(/writer@example\.com/);
    // Multi-line contact preserves newlines (rendered via whiteSpace: pre-wrap).
    expect(screen.getByTestId('preview-contact')).toHaveTextContent(/Hollywood, CA/);
    expect(screen.getByTestId('preview-notes')).toHaveTextContent('Do not distribute.');
    expect(screen.getByTestId('preview-copyright')).toHaveTextContent('© 2026');
  });

  it('renders the title in uppercase with an underline', () => {
    render(<TitlePagePreview titlePage={FULL} />);
    const title = screen.getByTestId('preview-title');
    expect(title).toHaveStyle({
      textTransform: 'uppercase',
      textDecoration: 'underline',
    });
  });
});

describe('TitlePagePreview — omits empty and missing fields', () => {
  it('omits every unset field from the DOM (no empty placeholder <div>s)', () => {
    render(<TitlePagePreview titlePage={[{ key: 'Title', value: 'Only Title' }]} />);
    expect(screen.getByTestId('preview-title')).toBeInTheDocument();
    for (const tid of [
      'preview-credit',
      'preview-author',
      'preview-source',
      'preview-draft-date',
      'preview-contact',
      'preview-notes',
      'preview-copyright',
    ]) {
      expect(screen.queryByTestId(tid)).not.toBeInTheDocument();
    }
  });

  it('treats empty-string values as unset', () => {
    render(
      <TitlePagePreview
        titlePage={[
          { key: 'Title', value: '' },
          { key: 'Author', value: 'Claude' },
        ]}
      />,
    );
    expect(screen.queryByTestId('preview-title')).not.toBeInTheDocument();
    expect(screen.getByTestId('preview-author')).toBeInTheDocument();
  });

  it('renders nothing when titlePage is null', () => {
    render(<TitlePagePreview titlePage={null} />);
    const paper = screen.getByTestId('title-page-paper');
    // The paper is still the empty sheet, but no preview-* descendants.
    expect(paper.querySelectorAll('[data-testid^="preview-"]')).toHaveLength(0);
  });

  it('renders nothing when titlePage is an empty array', () => {
    render(<TitlePagePreview titlePage={[]} />);
    const paper = screen.getByTestId('title-page-paper');
    expect(paper.querySelectorAll('[data-testid^="preview-"]')).toHaveLength(0);
  });
});

describe('TitlePagePreview — typography hook', () => {
  it('applies the Courier Prime font stack to the paper element', () => {
    render(<TitlePagePreview titlePage={FULL} />);
    const paper = screen.getByTestId('title-page-paper');
    // jsdom normalizes the computed fontFamily string — check for CP as
    // the first-declared face so a regression that silently drops the
    // font import would fail here.
    expect(paper.style.fontFamily).toContain('Courier Prime');
  });
});
