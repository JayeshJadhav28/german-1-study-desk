import { describe, it, expect } from 'vitest';
import { extractFromMarkdown, extractDomain, stripTrailingPunct, isApprovedRelativeTarget } from '../scripts/lib/links.mjs';

describe('Markdown link extraction', () => {
  it('extracts inline links with query strings preserved', () => {
    const md = 'See [Drive file](https://drive.google.com/file/d/abc123/view?usp=sharing&hl=en) for the book.';
    const { occurrences } = extractFromMarkdown(md, { fileRelPath: 'x.md' });
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].url).toBe('https://drive.google.com/file/d/abc123/view?usp=sharing&hl=en');
    expect(occurrences[0].linkKind).toBe('external');
    expect(occurrences[0].method).toBe('inline-markdown');
    expect(occurrences[0].label).toBe('Drive file');
  });

  it('extracts reference-style links and unused defs', () => {
    const md = 'Read [the notes][n1] first.\n\n[n1]: https://example.org/notes\n[unused]: https://example.org/other\n';
    const { occurrences } = extractFromMarkdown(md);
    const urls = occurrences.map((o) => o.url);
    expect(urls).toContain('https://example.org/notes');
    expect(urls).toContain('https://example.org/other');
    expect(occurrences.find((o) => o.url.endsWith('/other'))?.method).toBe('reference-def-unused');
  });

  it('extracts HTML anchors', () => {
    const md = '<a href="https://www.youtube.com/watch?v=xyz">Video</a>';
    const { occurrences } = extractFromMarkdown(md);
    expect(occurrences[0].method).toBe('html-anchor');
    expect(occurrences[0].url).toBe('https://www.youtube.com/watch?v=xyz');
  });

  it('extracts bare URLs from prose but not from code spans/fences', () => {
    const md = 'Visit https://www.leo.org/ for dictionaries.\n\n`https://not-a-link.example/in-code`\n\n```\nhttps://in-fence.example\n```\n';
    const { occurrences } = extractFromMarkdown(md);
    expect(occurrences.map((o) => o.url)).toEqual(['https://www.leo.org/']);
  });

  it('records relative links as relative kind', () => {
    const md = 'See [audit](../German-I-Exam-Prep-Output/00_Corpus_Audit.md).';
    const { occurrences } = extractFromMarkdown(md, { fileRelPath: 'German-I-Study-Pack/README.md' });
    expect(occurrences[0].linkKind).toBe('relative');
    expect(occurrences[0].url).toContain('00_Corpus_Audit.md');
  });

  it('skips unsafe schemes instead of emitting links', () => {
    const md = '[bad](javascript:alert(1)) and [data](data:text/html,hi)';
    const { occurrences, skipped } = extractFromMarkdown(md);
    expect(occurrences).toHaveLength(0);
    expect(skipped.filter((s) => s.reason === 'unsafe-scheme').length).toBe(2);
  });

  it('skips Windows absolute paths as links', () => {
    const md = '[p](E:/secret/file.md)';
    const { occurrences, skipped } = extractFromMarkdown(md);
    expect(occurrences).toHaveLength(0);
    expect(skipped.some((s) => s.reason === 'windows-absolute-path')).toBe(true);
  });

  it('deduplicates the same URL in the caller by exact URL key (occurrences preserved)', () => {
    const md = '[a](https://x.example/1)\n[b](https://x.example/1)\n';
    const { occurrences } = extractFromMarkdown(md);
    expect(occurrences).toHaveLength(2);
    expect(new Set(occurrences.map((o) => o.url)).size).toBe(1);
  });

  it('decodes HTML entities in URLs', () => {
    const md = '[l](https://x.example/?a=1&amp;b=2)';
    const { occurrences } = extractFromMarkdown(md);
    expect(occurrences[0].url).toBe('https://x.example/?a=1&b=2');
  });
});

describe('link helpers', () => {
  it('extracts domain without www', () => {
    expect(extractDomain('https://www.youtube.com/watch?v=1')).toBe('youtube.com');
  });
  it('strips trailing punctuation but keeps balanced parens', () => {
    expect(stripTrailingPunct('https://x.example/a.')).toBe('https://x.example/a');
    expect(stripTrailingPunct('https://x.example/wiki_(test)')).toBe('https://x.example/wiki_(test)');
  });
  it('approves only the two source roots', () => {
    const roots = ['German-I-Study-Pack', 'German-I-Exam-Prep-Output'];
    expect(isApprovedRelativeTarget('German-I-Study-Pack/course-overview.md', roots)).toBe(true);
    expect(isApprovedRelativeTarget('German-I-Study-Dashboard/public/data/x.json', roots)).toBe(false);
  });
});
