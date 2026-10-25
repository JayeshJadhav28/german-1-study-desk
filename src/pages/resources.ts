import { api, type ResourceRecord } from '../api';
import { el, mount, pageHead, notice, debounce } from '../ui';
import { currentRoute } from '../router';
import { resourceRow, resourceSummaryLine, wireCopyButtons } from './resource-widgets';

const PAGE_SIZE = 30;

export async function renderResources(c: HTMLElement): Promise<void> {
  mount(c, el('div', { class: 'skeleton' }));
  const doc = await api.resources();
  const qp = currentRoute().query;

  const qInput = el('input', { type: 'search', placeholder: 'Search title, URL, context, source file…', 'aria-label': 'Search resources' }) as HTMLInputElement;
  const catSel = el('select', { 'aria-label': 'Category' }, [
    el('option', { value: '', text: 'All categories' }),
    ...Object.keys(doc.summary.byCategory).sort().map((k) => el('option', { value: k, text: `${k} (${doc.summary.byCategory[k]})`, selected: qp.get('category') === k || undefined })),
  ]) as HTMLSelectElement;
  const weekSel = el('select', { 'aria-label': 'Week' }, [
    el('option', { value: '', text: 'Any week' }),
    ...Array.from({ length: 12 }, (_, i) => el('option', { value: String(i + 1), text: `Week ${i + 1}`, selected: qp.get('week') === String(i + 1) || undefined })),
  ]) as HTMLSelectElement;
  const kindSel = el('select', { 'aria-label': 'Link kind' }, [
    el('option', { value: '', text: 'Internal + external' }),
    el('option', { value: 'external', text: 'External only' }),
    el('option', { value: 'internal', text: 'Internal only' }),
  ]) as HTMLSelectElement;
  const typeSel = el('select', { 'aria-label': 'Resource type' }, [
    el('option', { value: '', text: 'All types' }),
    el('option', { value: 'video', text: 'Video' }),
    el('option', { value: 'book', text: 'Book / lecture material' }),
    el('option', { value: 'transcript', text: 'Transcript' }),
    el('option', { value: 'exam', text: 'Exam / certification guidance' }),
    el('option', { value: 'other', text: 'Other' }),
  ]) as HTMLSelectElement;
  const provSel = el('select', { 'aria-label': 'Provenance folder' }, [
    el('option', { value: '', text: 'Both folders' }),
    el('option', { value: 'course-corpus', text: 'German-I-Study-Pack' }),
    el('option', { value: 'exam-prep-analysis', text: 'German-I-Exam-Prep-Output' }),
  ]) as HTMLSelectElement;

  const listHost = el('div');
  const statusHost = el('p', { class: 'muted' });
  let page = 0;

  function typeMatch(r: ResourceRecord, t: string): boolean {
    if (!t) return true;
    if (t === 'video') return r.category.startsWith('lecture-video') || r.category === 'lecture-video';
    if (t === 'book') return r.category === 'book-lecture-material';
    if (t === 'transcript') return r.category === 'transcript';
    if (t === 'exam') return r.category === 'exam-guidance' || r.category === 'nptel-course' || r.category === 'course-form';
    return r.category === 'supplementary-reference' || r.category === 'general-link' || r.category === 'downloadable-resource' || r.category.startsWith('internal');
  }

  function filtered(): ResourceRecord[] {
    const q = qInput.value.trim().toLowerCase();
    return doc.resources.filter((r) => {
      if (catSel.value && r.category !== catSel.value) return false;
      if (weekSel.value && !r.weeks.includes(Number(weekSel.value))) return false;
      if (kindSel.value === 'external' && r.linkKind !== 'external') return false;
      if (kindSel.value === 'internal' && r.linkKind === 'external') return false;
      if (!typeMatch(r, typeSel.value)) return false;
      if (provSel.value && r.provenance !== provSel.value) return false;
      if (q) {
        const hay = [r.title, r.url || '', r.domain, r.relativePath || '', ...r.occurrences.map((o) => `${o.context} ${o.sourceFile}`)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function draw(): void {
    const rows = filtered();
    const maxPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
    if (page > maxPage) page = maxPage;
    const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    mount(listHost,
      slice.length === 0
        ? el('div', { class: 'empty', text: 'No resources match. Try clearing filters.' })
        : el('div', {}, slice.map((r) => resourceRow(r))),
    );
    statusHost.textContent = `${rows.length} resource(s) · page ${page + 1} / ${maxPage + 1}`;
    pager.hidden = rows.length <= PAGE_SIZE;
  }

  const prev = el('button', { text: '← Previous', type: 'button' });
  const next = el('button', { text: 'Next →', type: 'button' });
  prev.addEventListener('click', () => { page = Math.max(0, page - 1); draw(); });
  next.addEventListener('click', () => { page += 1; draw(); });
  const pager = el('div', { class: 'pager' }, [prev, next, statusHost]);

  const redraw = debounce(() => { page = 0; draw(); }, 150);
  qInput.addEventListener('input', redraw);
  for (const s of [catSel, weekSel, kindSel, typeSel, provSel]) s.addEventListener('change', () => { page = 0; draw(); });
  draw();

  mount(c,
    pageHead('Study Resources', doc.disclaimer),
    notice(`Links collected from the study documents. Categories are inferred from the link and title — nothing is claimed as an official NPTEL link.`),
    el('div', { class: 'panel' }, [
      el('strong', { text: 'Summary' }),
      el('div', { class: 'cards' }, [
        el('div', { class: 'card' }, [el('div', { class: 'num', text: String(doc.summary.distinctExternalUrls) }), el('div', { class: 'lbl', text: 'external links' })]),
        el('div', { class: 'card' }, [el('div', { class: 'num', text: String(doc.summary.totalOccurrences) }), el('div', { class: 'lbl', text: 'mentions in documents' })]),
        el('div', { class: 'card' }, [el('div', { class: 'num', text: String(doc.summary.fileMentions) }), el('div', { class: 'lbl', text: 'file mentions' })]),
        el('div', { class: 'card' }, [el('div', { class: 'num', text: String(doc.summary.skipped.totalSkippedRecords) }), el('div', { class: 'lbl', text: 'skipped entries' })]),
        el('div', { class: 'card' }, [el('div', { class: 'num', text: String(doc.summary.markdownFilesScanned) }), el('div', { class: 'lbl', text: 'documents scanned' })]),
      ]),
      resourceSummaryLine(doc),
    ]),
    el('div', { class: 'filters' }, [
      el('label', {}, ['Search', qInput]),
      el('label', {}, ['Category', catSel]),
      el('label', {}, ['Week', weekSel]),
      el('label', {}, ['Internal / external', kindSel]),
      el('label', {}, ['Type', typeSel]),
      el('label', {}, ['Source folder', provSel]),
    ]),
    pager,
    listHost,
  );
  wireCopyButtons(c);
}
