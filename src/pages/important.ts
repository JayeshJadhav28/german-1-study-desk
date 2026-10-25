import { api, gate } from '../api';
import { el, mount, pageHead, notice, badge, debounce, contentGate } from '../ui';
import { hrefFor } from '../router';
import { renderMarkdown } from '../md';

export async function renderImportant(c: HTMLElement): Promise<void> {
  mount(c, el('div', { class: 'skeleton' }));
  if (!await gate(['concepts.json', 'markdown/German-I-Exam-Prep-Output/04_Important_Questions_and_Answers.md'])) {
    mount(c, contentGate({
      title: 'Important questions',
      reason: 'The important-questions list comes from the course\'s own assignments, which cannot be republished here.',
      alternatives: [
        { label: 'Weeks & syllabus', href: '/weeks' },
        { label: 'Study Resources', href: '/resources' },
        { label: 'Revision plan', href: '/plan' },
      ],
    }));
    return;
  }
  const [mdText, concepts] = await Promise.all([
    api.markdownText('German-I-Exam-Prep-Output/04_Important_Questions_and_Answers.md'),
    api.concepts(),
  ]);
  const rendered = renderMarkdown(mdText, { mdId: 'German-I-Exam-Prep-Output/04_Important_Questions_and_Answers.md' });

  const q = el('input', { type: 'search', placeholder: 'Filter concepts / find text in page…', 'aria-label': 'Filter' }) as HTMLInputElement;
  const status = el('span', { class: 'muted' });
  q.addEventListener('input', debounce(() => {
    const term = q.value.trim().toLowerCase();
    const body = c.querySelector('.md-body');
    if (!body) return;
    // simple find-in-page count
    if (!term) { status.textContent = ''; return; }
    const count = (body.textContent?.toLowerCase().split(term).length || 1) - 1;
    status.textContent = `${count} text hit(s) in document`;
  }, 200));

  mount(c,
    pageHead('Important questions', 'High-frequency concepts from the weekly assignments. Repetition is a study signal, not an exam prediction.'),
    notice('A question that repeats in the assignments may not appear on the certification exam. The official exam format is not documented here.'),
    el('div', { class: 'filters' }, [el('label', {}, ['Find in document', q]), status]),
    el('h2', { text: 'High-frequency concepts' }),
    el('table', { class: 'data' }, [
      el('thead', {}, [el('tr', {}, ['Concept', 'Tags', 'Weeks', 'Covers multiple weeks?', 'Practice'].map((h) => el('th', { text: h })))]),
      el('tbody', {}, concepts.table.slice(0, 12).map((r) => el('tr', {}, [
        el('td', {}, [el('code', { text: r.concept })]),
        el('td', { text: String(r.questionCount) }),
        el('td', { text: String(r.weekCount) }),
        el('td', {}, [r.weekCount >= 8 ? badge('covers many weeks', 'accent') : badge(`${r.weekCount} weeks`)]),
        el('td', {}, [el('a', { href: hrefFor('/questions', { concept: r.concept }), text: 'drill' })]),
      ]))),
    ]),
    el('h2', { text: 'Source document' }),
    el('div', { class: 'reader-wrap reader-wrap--full' }, [el('div', { class: 'md-body', html: rendered.html })]),
  );

  const shortlistHeading = c.querySelector('.md-body h2[id^="e-revision-shortlist"]');
  let sibling = shortlistHeading?.nextElementSibling;
  while (sibling && sibling.tagName !== 'H2') {
    const table = sibling.matches('table') ? sibling : sibling.querySelector('table');
    if (table) { table.classList.add('shortlist-table'); break; }
    sibling = sibling.nextElementSibling;
  }
}
