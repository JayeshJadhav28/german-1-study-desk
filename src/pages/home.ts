import { api, isLocalEdition, type WeekRow } from '../api';
import { getState } from '../store';
import { el, mount, card, pageHead, notice, breadcrumbs, icon } from '../ui';
import { mountWeightageCharts } from '../ui/weightage-charts';
import { hrefFor } from '../router';

function setBreadcrumb(): void {
  const host = document.getElementById('crumb-slot');
  if (!host) return;
  mount(host, breadcrumbs([{ label: 'Home' }])!);
}

export async function renderHome(c: HTMLElement): Promise<void> {
  mount(c, el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }));
  const local = isLocalEdition();
  const [course, weeks, meta, concepts] = await Promise.all([
    api.course(),
    api.weeks(),
    local ? api.questionsMeta() : Promise.resolve(null),
    local ? api.concepts() : Promise.resolve(null),
  ]);
  const state = getState();

  setBreadcrumb();

  const visited = state.visitedWeeks.length;
  const pct = Math.round((visited / 12) * 100);

  const resumeLink = state.lastVisited
    ? el('a', { href: `#${state.lastVisited.path}` }, [`Resume: ${state.lastVisited.label}`, icon({ name: 'chevronRight', size: 12 })])
    : null;

  const quick = el('div', { class: 'quicklinks' }, [
    resumeLink,
    el('a', { href: hrefFor('/weeks'), text: 'Browse the syllabus' }),
    el('a', { href: hrefFor('/grammar'), text: 'Grammar hub' }),
    el('a', { href: hrefFor('/plan'), text: 'Revision plan' }),
    el('a', { href: hrefFor('/resources'), text: 'Study Resources' }),
    ...(local ? [
      el('a', { href: hrefFor('/questions'), text: 'Practice questions' }),
      el('a', { href: hrefFor('/vocab'), text: 'Vocabulary' }),
      el('a', { href: hrefFor('/mocks'), text: 'Mock tests' }),
    ] : []),
  ]);

  const weekCards = el('div', { class: 'grid-2' }, weeks.map((w: WeekRow) => {
    const done = state.visitedWeeks.includes(w.weekNum);
    return el('div', { class: 'card' }, [
      el('div', { style: 'display:flex;justify-content:space-between;gap:.4rem' }, [
        el('strong', { text: `Week ${w.weekNum}` }),
        done ? el('span', { class: 'badge good', text: 'visited' }) : el('span', { class: 'badge', text: `${w.lessonCount} lessons` }),
      ]),
      el('div', { class: 'tiny', text: w.theme }),
      el('div', { style: 'margin-top:.4rem' }, [el('a', { href: hrefFor(`/week/${w.weekNum}`), text: 'Open week →' })]),
    ]);
  }));

  const syllabusRows = Object.entries(course.syllabus).map(([wk, s]) =>
    el('tr', {}, [el('td', { text: wk }), el('td', { text: s.theme }), el('td', { text: s.grammar || '—' })]));

  const chartHost = el('div', { class: 'chart-host' });

  const statCards = local && meta
    ? [
        card(`${visited}/12`, 'weeks visited'),
        card(meta.realQuestions, 'practice questions'),
        card(77, 'lessons'),
        card(12, 'weekly assignments'),
        card(46, 'video transcripts'),
        card(60, 'lecture videos'),
      ]
    : [
        card(`${visited}/12`, 'weeks visited'),
        card(77, 'lessons'),
        card(12, 'weekly assignments'),
        card(60, 'lecture videos'),
      ];

  mount(c,
    pageHead('German I Study Desk', local
      ? `${course.courseName} (${course.courseCode}) — ${course.instructor}. Study lessons, practice questions and progress in one place.`
      : `${course.courseName} (${course.courseCode}) — ${course.instructor}. An independent study companion for the course.`),
    notice('Not an official NPTEL website. Check the latest official course notice for the exam date and scoring.'),
    quick,
    el('div', { class: 'cards' }, statCards),
    local && concepts ? el('div', { class: 'panel chart-section' }, [
      el('h2', { text: 'High-weightage topics' }),
      chartHost,
    ]) : null,
    el('div', { class: 'panel' }, [
      el('div', { style: 'display:flex;justify-content:space-between;flex-wrap:wrap;gap:.5rem' }, [
        el('strong', { text: 'Course progress' }),
        el('span', { class: 'muted', text: `${pct}% of weeks opened` }),
      ]),
      el('div', { class: 'bar', style: 'margin-top:.5rem' }, [el('span', { style: `width:${pct}%` })]),
    ]),
    el('div', { class: 'panel' }, [
      el('strong', { text: 'Exam and scoring' }),
      el('p', { class: 'muted', style: 'margin:.35rem 0' }, [
        `Certification exam listed as ${course.examDateRendered}. `,
        course.sessions.join('. ') + '.',
      ]),
      el('p', { class: 'muted', style: 'margin:0' }, [course.scoringNote]),
    ]),
    local && meta ? el('div', { class: 'panel' }, [
      el('strong', { text: 'About this data' }),
      el('ul', { style: 'margin:.4rem 0 0;padding-left:1.2rem' }, [
        el('li', { text: `${meta.byProvenance['No local answer key']} questions have no answer key. No answers are invented.` }),
        el('li', { text: `${meta.stimulusExternal} questions need audio or image — ${meta.stimulusExternalWithLocalMedia ?? 0} now include the saved course file.` }),
        el('li', { text: `${meta.byProvenance['Inferred from full-score submission']} answers are inferred from a full-score attempt and labelled as such.` }),
        el('li', { text: 'Transcripts are auto-generated subtitles (mixed German–English; may contain errors).' }),
        el('li', { text: 'The official exam format is unknown here. Mock tests use a practice format, not the official exam.' }),
      ]),
    ]) : el('div', { class: 'panel' }, [
      el('strong', { text: 'What this site publishes' }),
      el('p', { class: 'muted', style: 'margin:.35rem 0' }, [
        'This is the public edition. It shares the course outline, lesson topics, video links, study-resources catalogue and revision plan.',
      ]),
      el('p', { class: 'muted', style: 'margin:0' }, [
        'It does not republish course pages, lecture subtitles, assignment questions or answer keys, because redistribution rights are not confirmed.',
      ]),
    ]),
    el('h2', { text: 'Syllabus snapshot' }),
    el('div', { class: 'table-wrap' }, [
      el('table', { class: 'data' }, [
        el('thead', {}, [el('tr', {}, [el('th', { text: 'Week' }), el('th', { text: 'Theme' }), el('th', { text: 'Grammar / topics' })])]),
        el('tbody', {}, syllabusRows),
      ]),
    ]),
    el('h2', { text: 'Browse weeks' }),
    weekCards,
  );

  if (concepts) {
    mountWeightageCharts(chartHost, concepts);
  }
}
