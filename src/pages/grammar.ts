import { api, isLocalEdition, type ConceptRow } from '../api';
import { el, mount, pageHead, notice, badge, contentGate } from '../ui';
import { hrefFor } from '../router';
import { renderMarkdown } from '../md';

export async function renderGrammar(c: HTMLElement): Promise<void> {
  mount(c, el('div', { class: 'skeleton' }));
  if (!isLocalEdition()) {
    mount(c, contentGate({
      title: 'Grammar',
      reason: 'The grammar notes and concept directory come from the course analysis materials, which the public edition does not republish.',
      alternatives: [
        { label: 'Weeks & syllabus', href: '/weeks' },
        { label: 'Study Resources', href: '/resources' },
        { label: 'Revision plan', href: '/plan' },
      ],
    }));
    return;
  }
  const [mdText, concepts] = await Promise.all([
    api.markdownText('German-I-Exam-Prep-Output/02_German_Grammar_Cheat_Sheet.md'),
    api.concepts(),
  ]);
  const rendered = renderMarkdown(mdText, { mdId: 'German-I-Exam-Prep-Output/02_German_Grammar_Cheat_Sheet.md' });

  const conceptSearch = el('input', { type: 'search', placeholder: 'Filter concepts…', 'aria-label': 'Filter concepts' }) as HTMLInputElement;
  const conceptTable = el('tbody');

  function drawConcepts(): void {
    const q = conceptSearch.value.trim().toLowerCase();
    const rows = concepts.table.filter((r: ConceptRow) => !q || r.concept.includes(q));
    mount(conceptTable, ...rows.map((r: ConceptRow) => el('tr', {}, [
      el('td', {}, [el('code', { text: r.concept })]),
      el('td', { text: String(r.questionCount) }),
      el('td', { text: String(r.weekCount) }),
      el('td', { text: r.weeks.map((w) => `W${w}`).join(', ') || '—' }),
      el('td', {}, [el('a', { href: hrefFor('/questions', { concept: r.concept }), text: 'practice' })]),
    ])));
  }
  conceptSearch.addEventListener('input', drawConcepts);
  drawConcepts();

  const patternRows = concepts.patternDocConcepts.map((p) => el('tr', {}, [
    el('td', { text: p.concept }),
    el('td', { text: String(p.questionCount) }),
    el('td', { text: String(p.weekCount) }),
    el('td', { text: String(p.assignmentCount) }),
    el('td', {}, [badge(p.priority || '—', p.priority === 'High' ? 'accent' : '')]),
    el('td', { text: p.taskShape }),
  ]));

  mount(c,
    pageHead('Grammar', 'Grammar cheat sheet with a searchable concept directory. Concept tags counted from the practice questions; a question can carry several tags.'),
    notice(concepts.overlapNote),
    el('h2', { text: 'Concept directory' }),
    el('div', { class: 'filters' }, [el('label', {}, ['Filter', conceptSearch])]),
    el('div', { class: 'table-wrap' }, [
      el('table', { class: 'data' }, [
        el('thead', {}, [el('tr', {}, ['Concept', 'Question tags', 'Distinct weeks', 'Weeks', ''].map((h) => el('th', { text: h })))]),
        conceptTable,
      ]),
    ]),
    el('h2', { text: 'Recurring patterns' }),
    el('div', { class: 'table-wrap' }, [
      el('table', { class: 'data' }, [
        el('thead', {}, [el('tr', {}, ['Concept', 'Tags', 'Weeks', 'Assignments', 'Priority', 'Task shape'].map((h) => el('th', { text: h })))]),
        el('tbody', {}, patternRows),
      ]),
    ]),
    el('h2', { text: 'Cheat sheet' }),
    el('p', { class: 'muted', text: 'Full grammar notes from the course materials.' }),
    el('div', { class: 'reader-wrap reader-wrap--full' }, [el('div', { class: 'md-body', html: rendered.html })]),
  );
}
