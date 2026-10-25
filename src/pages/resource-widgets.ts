import type { ResourceRecord, StudyResourcesDoc } from '../api';
import { el, badge } from '../ui';
import { hrefFor } from '../router';

export function resourceSummaryLine(doc: StudyResourcesDoc): HTMLElement {
  const s = doc.summary;
  return el('p', { class: 'muted' }, [
    `${s.distinctExternalUrls} external links · ${s.totalOccurrences} mentions · `,
    `${s.fileMentions} file mentions · ${s.skipped.totalSkippedRecords} skipped entries.`,
  ]);
}

export function resourceRow(r: ResourceRecord, opts: { showContext?: boolean } = {}): HTMLElement {
  const titleNode = r.linkKind === 'external' && r.url
    ? el('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer', class: 'res-title', text: r.title || r.url })
    : el('span', { class: 'res-title', text: r.title || r.relativePath || r.id });

  const provenanceLabel = r.provenance === 'course-corpus' ? 'course materials'
    : r.provenance === 'exam-prep-analysis' ? 'study guide'
    : r.provenance;
  const kindLabel = r.linkKind === 'external' ? 'external'
    : r.linkKind === 'file-mention' ? 'file mention'
    : 'internal link';

  const meta = el('div', { class: 'res-meta' }, [
    badge(r.category, r.category.startsWith('internal') ? '' : 'accent'),
    badge(kindLabel),
    r.domain ? badge(r.domain) : null,
    ...r.weeks.map((w) => badge(`W${w}`)),
    ...r.lessonIds.slice(0, 3).map((l) => badge(`lesson ${l}`)),
    badge(provenanceLabel),
    badge(`${r.occurrenceCount}×`, 'good'),
  ]);

  const occ = r.occurrences[0];
  const actions = el('div', { class: 'res-actions' }, [
    occ ? el('a', {
      href: hrefFor(`/reader/${occ.sourceFile.split('/').map(encodeURIComponent).join('/')}`, { line: String(occ.line) }),
      text: `Source: ${occ.sourceFile.split('/').pop()}:${occ.line}`,
    }) : null,
    r.url ? el('button', {
      type: 'button',
      'data-copy': r.url,
      text: 'Copy link',
    }) : null,
    r.categoryNote ? el('span', { class: 'tiny', text: r.categoryNote }) : null,
  ]);

  return el('div', { class: 'res-row', 'data-res-id': r.id }, [
    titleNode,
    meta,
    opts.showContext !== false && occ ? el('div', { class: 'res-ctx', text: occ.context }) : null,
    r.occurrenceCount > 1 ? el('div', { class: 'tiny', text: `Also cited in: ${[...new Set(r.occurrences.slice(1).map((o) => o.sourceFile.split('/').pop()))].slice(0, 5).join(', ')}` }) : null,
    actions,
  ]);
}

export function wireCopyButtons(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>('button[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = btn.getAttribute('data-copy') || '';
      try {
        await navigator.clipboard.writeText(url);
        const old = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = old; }, 1200);
      } catch {
        btn.textContent = 'Copy failed';
      }
    });
  });
}

export function resourcesForWeek(doc: StudyResourcesDoc, weekNum: number): ResourceRecord[] {
  const inWeek = doc.resources.filter((r) => r.linkKind === 'external' && r.weeks.includes(weekNum));
  const general = doc.resources.filter((r) => r.linkKind === 'external' && r.weeks.length === 0 && r.category !== 'internal-file-mention');
  return [...inWeek, ...general.slice(0, 12)];
}

export function resourcesForLesson(doc: StudyResourcesDoc, lessonId: number): ResourceRecord[] {
  return doc.resources.filter((r) => r.lessonIds.includes(lessonId));
}
