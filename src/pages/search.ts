import { api, isLocalEdition, type QuestionBlock } from '../api';
import { el, mount, pageHead, badge, debounce } from '../ui';
import { hrefFor, currentRoute } from '../router';
import { plainFromMd } from '../md';

interface Hit {
  kind: string;
  title: string;
  excerpt: string;
  week?: number | null;
  href: string;
  source?: string;
}

const PAGE = 20;

export async function renderSearch(c: HTMLElement): Promise<void> {
  const q0 = currentRoute().query.get('q') || '';
  const input = el('input', { type: 'search', value: q0, placeholder: 'Search everything…', 'aria-label': 'Search query' }) as HTMLInputElement;
  const cueChk = el('input', { type: 'checkbox' }) as HTMLInputElement;
  const listHost = el('div');
  const statusHost = el('p', { class: 'muted' });
  let page = 0;
  let hits: Hit[] = [];
  let searching = false;

  async function runSearch(term: string): Promise<void> {
    const q = term.trim().toLowerCase();
    if (!q) { hits = []; mount(listHost, el('div', { class: 'empty', text: 'Type a query to search lessons, questions, vocabulary, concepts, resources' + (cueChk.checked ? ' and transcript cues' : '') + '.' })); statusHost.textContent = ''; return; }
    searching = true;
    statusHost.textContent = 'Searching…';
    const out: Hit[] = [];
    const local = isLocalEdition();

    const [lessons, resources] = await Promise.all([api.lessons(), api.resources()]);
    const [vocab, concepts, importantMd, mocks] = local
      ? await Promise.all([
          api.vocabulary(),
          api.concepts(),
          api.markdownText('German-I-Exam-Prep-Output/04_Important_Questions_and_Answers.md').catch(() => ''),
          api.mocks(),
        ])
      : [null, null, '', null] as const;

    for (const l of lessons) {
      if (l.title.toLowerCase().includes(q) || l.unit.toLowerCase().includes(q)) {
        out.push({ kind: 'lesson', title: l.title, excerpt: l.unit, week: l.weekNum, href: l.weekNum ? hrefFor(`/week/${l.weekNum}`) : hrefFor('/weeks'), source: 'lessons-index' });
      }
    }
    if (vocab) for (const v of vocab.entries) {
      if (v.german.toLowerCase().includes(q) || v.gloss.toLowerCase().includes(q)) {
        out.push({ kind: 'vocabulary', title: v.german, excerpt: v.gloss, href: hrefFor('/vocab'), source: v.evidence });
      }
    }
    if (concepts) for (const row of concepts.table) {
      if (row.concept.includes(q)) {
        out.push({ kind: 'concept', title: row.concept, excerpt: `${row.questionCount} tags across ${row.weekCount} weeks`, href: hrefFor('/questions', { concept: row.concept }), source: 'practice questions' });
      }
    }
    for (const r of resources.resources) {
      const hay = [r.title, r.url || '', r.domain, r.relativePath || ''].join(' ').toLowerCase();
      if (hay.includes(q)) {
        out.push({ kind: 'resource', title: r.title, excerpt: r.url || r.relativePath || '', week: r.weeks[0] ?? null, href: hrefFor('/resources'), source: r.occurrences[0]?.sourceFile });
      }
    }

    // questions — load all weeks once (cached by api layer)
    if (local) {
      const weeksMeta = await api.questionsMeta();
      const weekDocs = await Promise.all(weeksMeta.weeks.map((w) => api.weekQuestions(w)));
      for (const wd of weekDocs) {
        for (const b of wd.blocks as QuestionBlock[]) {
          if (b.isInstruction) continue;
          if (b.questionText.toLowerCase().includes(q)) {
            out.push({ kind: 'question', title: b.questionText.slice(0, 120), excerpt: `${b.week} · ${b.provenance}`, week: b.weekNum, href: hrefFor('/questions', { week: String(b.weekNum) }), source: b.assignmentTitle });
          }
        }
      }
    }

    if (importantMd) {
      const plain = plainFromMd(importantMd);
      const idx = plain.toLowerCase().indexOf(q);
      if (idx >= 0) {
        out.push({ kind: 'analysis-doc', title: 'Important Questions & Answers', excerpt: plain.slice(Math.max(0, idx - 60), idx + 120), href: hrefFor('/reader/German-I-Exam-Prep-Output/04_Important_Questions_and_Answers.md'), source: '04_Important_Questions_and_Answers.md' });
      }
    }

    if (mocks) for (const m of mocks.mocks) {
      for (const item of m.items) {
        if (item.prompt.toLowerCase().includes(q)) {
          out.push({ kind: 'mock-item', title: `Mock ${m.mockNumber} Q${item.num}: ${item.prompt.slice(0, 100)}`, excerpt: m.title, href: hrefFor(`/mock/${m.mockNumber}`), source: '05_Three_Mock_Tests.md' });
        }
      }
    }

    if (local && cueChk.checked && q.length >= 2) {
      const tIndex = await api.transcripts();
      const docs = await Promise.all(tIndex.files.map((f) => api.vtt(f.file).catch(() => null)));
      for (let i = 0; i < docs.length; i += 1) {
        const doc = docs[i];
        if (!doc) continue;
        for (const cue of doc.cues) {
          if (cue.text.toLowerCase().includes(q)) {
            out.push({
              kind: 'transcript-cue',
              title: `${tIndex.files[i].lesson} @ ${cue.start}`,
              excerpt: cue.text.slice(0, 160),
              week: tIndex.files[i].weekNum,
              href: hrefFor('/transcript', { file: tIndex.files[i].file }),
              source: tIndex.files[i].file,
            });
            break; // one hit per file keeps results usable
          }
        }
      }
    }

    hits = out.sort((a, b) => a.kind.localeCompare(b.kind) || (a.week || 0) - (b.week || 0));
    searching = false;
    page = 0;
    draw();
  }

  function draw(): void {
    if (searching) return;
    const maxPage = Math.max(0, Math.ceil(hits.length / PAGE) - 1);
    if (page > maxPage) page = maxPage;
    const slice = hits.slice(page * PAGE, (page + 1) * PAGE);
    statusHost.textContent = hits.length ? `${hits.length} result(s) · page ${page + 1}/${maxPage + 1}` : 'No results.';
    mount(listHost,
      hits.length === 0
        ? el('div', { class: 'empty', text: 'No results. Try a different word, or include transcripts.' })
        : el('div', { role: 'list' }, slice.map((h, i) => {
          const item = el('div', { class: 'sr-item', role: 'listitem', tabindex: '0' }, [
            badge(h.kind, 'accent'), ' ',
            h.week ? badge(`W${h.week}`) : null, ' ',
            el('a', { href: h.href, text: h.title }),
            el('div', { class: 'tiny', text: h.excerpt }),
            h.source ? el('div', { class: 'tiny', text: `Source: ${h.source}` }) : null,
          ]);
          item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { const a = item.querySelector('a'); if (a) { e.preventDefault(); (a as HTMLAnchorElement).click(); } }
            if (e.key === 'ArrowDown') { e.preventDefault(); (item.nextElementSibling as HTMLElement | null)?.focus(); }
            if (e.key === 'ArrowUp') { e.preventDefault(); (item.previousElementSibling as HTMLElement | null)?.focus(); }
          });
          void i;
          return item;
        })),
    );
  }

  const run = debounce(() => { void runSearch(input.value); }, 250);
  input.addEventListener('input', run);
  cueChk.addEventListener('change', () => { void runSearch(input.value); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') void runSearch(input.value); });

  mount(c,
    pageHead('Search', 'Lesson titles, questions, vocabulary, concepts, documents and mock items' + (cueChk.checked ? ' and transcripts' : '') + '.'),
    el('div', { class: 'filters', style: 'align-items:center' }, [
      el('label', {}, ['Search', input]),
      el('label', { style: 'flex-direction:row;gap:.4rem;align-items:center' }, [cueChk, 'Include transcripts (slower)']),
      el('button', { type: 'button', text: 'Search', id: 'search-go' }),
    ]),
    statusHost,
    el('div', { class: 'pager' }, [
      el('button', { type: 'button', text: '← Prev page', id: 's-prev' }),
      el('button', { type: 'button', text: 'Next page →', id: 's-next' }),
    ]),
    listHost,
  );
  c.querySelector('#search-go')!.addEventListener('click', () => { void runSearch(input.value); });
  c.querySelector('#s-prev')!.addEventListener('click', () => { page = Math.max(0, page - 1); draw(); });
  c.querySelector('#s-next')!.addEventListener('click', () => { page += 1; draw(); });

  if (q0) void runSearch(q0);
  else draw();
}
