import { api, isLocalEdition, type LessonRow, type WeekRow } from '../api';
import { actions, getState } from '../store';
import { el, mount, pageHead, notice, badge, fmtDate, breadcrumbs, icon } from '../ui';
import { hrefFor, currentRoute } from '../router';
import { resourceRow, resourcesForWeek, wireCopyButtons } from './resource-widgets';

function setBreadcrumb(trail: { label: string; href?: string }[]): void {
  const host = document.getElementById('crumb-slot');
  if (!host) return;
  mount(host, breadcrumbs(trail)!);
}

export async function renderWeeks(c: HTMLElement): Promise<void> {
  mount(c, el('div', { class: 'skeleton' }));
  const [weeks, lessons] = await Promise.all([api.weeks(), api.lessons()]);
  const state = getState();

  setBreadcrumb([
    { label: 'Home', href: '/' },
    { label: 'Weeks' },
  ]);

  const rows = weeks.map((w: WeekRow) => {
    const done = state.visitedWeeks.includes(w.weekNum);
    return el('tr', {}, [
      el('td', {}, [el('a', { href: hrefFor(`/week/${w.weekNum}`), text: `Week ${w.weekNum}` })]),
      el('td', { text: w.theme }),
      el('td', { text: w.grammar || '—' }),
      el('td', { text: String(w.lessonCount) }),
      el('td', { text: String(w.realQuestions) }),
      el('td', { text: String(w.transcriptCount) }),
      el('td', {}, [done ? badge('visited', 'good') : badge('—')]),
    ]);
  });

  const searchInput = el('input', { type: 'search', placeholder: 'Search lesson titles…', 'aria-label': 'Search lesson titles' }) as HTMLInputElement;
  const listHost = el('div');

  function drawLessonList(): void {
    const q = searchInput.value.trim().toLowerCase();
    const hits = lessons
      .filter((l: LessonRow) => !q || l.title.toLowerCase().includes(q) || l.unit.toLowerCase().includes(q))
      .slice(0, 40);
    mount(listHost,
      hits.length === 0
        ? el('div', { class: 'empty' }, [
            el('div', {}, [icon({ name: 'search', size: 24 })]),
            el('div', { text: 'No lessons match this search.' }),
          ])
        : el('ul', {}, hits.map((l: LessonRow) => el('li', { style: 'margin:.25rem 0' }, [
          l.weekNum ? el('a', { href: hrefFor(`/week/${l.weekNum}`), text: `W${l.weekNum} · ` }) : el('span', { class: 'muted', text: `${l.unit} · ` }),
          el('span', { text: l.title }),
          l.hasLocalVtt ? badge('transcript', 'good') : null,
          l.videoUrl ? badge('video') : null,
        ]))),
      el('p', { class: 'tiny', text: `Showing ${hits.length} of ${lessons.length} lessons.` }),
    );
  }
  searchInput.addEventListener('input', drawLessonList);
  drawLessonList();

  mount(c,
    pageHead('All weeks', 'Twelve weeks with lessons, assignments, transcripts and practice-question counts.'),
    el('div', { class: 'table-wrap' }, [
      el('table', { class: 'data' }, [
        el('thead', {}, [el('tr', {}, ['Week', 'Theme', 'Grammar', 'Lessons', 'Questions', 'Transcripts', 'Status'].map((h) => el('th', { text: h })))]),
        el('tbody', {}, rows),
      ]),
    ]),
    el('h2', { text: 'Lesson search' }),
    el('div', { class: 'filters' }, [el('label', {}, ['Search lessons', searchInput])]),
    listHost,
  );
}
export async function renderWeekDetail(c: HTMLElement): Promise<void> {
  const params = currentRoute().params || {};
  const week = Number(params.n);
  if (!week || week < 1 || week > 12) {
    mount(c, pageHead('Week not found'), el('a', { href: hrefFor('/weeks'), text: 'All weeks' }));
    return;
  }
  mount(c, el('div', { class: 'skeleton' }));
  const local = isLocalEdition();
  const [weeks, lessons, assignments, resources, transcripts] = await Promise.all([
    api.weeks(),
    api.lessons(),
    api.assignments(),
    api.resources(),
    local ? api.transcripts() : Promise.resolve(null),
  ]);
  const w = weeks.find((x) => x.weekNum === week);
  if (!w) { mount(c, pageHead('Week not found')); return; }
  actions.markWeekVisited(week);

  setBreadcrumb([
    { label: 'Home', href: '/' },
    { label: 'Weeks', href: '/weeks' },
    { label: `Week ${week}: ${w.theme}` },
  ]);

  const weekLessons = lessons.filter((l) => l.weekNum === week);
  const assignment = assignments.find((a) => a.weekNum === week) || null;
  const vttFiles = transcripts ? transcripts.files.filter((t) => t.weekNum === week) : [];
  const weekResources = resourcesForWeek(resources, week);

  mount(c,
    pageHead(`Week ${week}: ${w.theme}`, w.grammar ? `Syllabus grammar: ${w.grammar}` : undefined),
    el('div', { class: 'quicklinks' }, [
      el('a', { href: hrefFor('/weeks'), text: '← All weeks' }),
      local ? el('a', { href: hrefFor('/questions', { week: String(week) }), text: `Practice Week ${week} questions` }) : null,
      local && assignment?.mdRelPath ? el('a', { href: hrefFor('/reader', { file: assignment.mdRelPath }), text: 'Open assignment source' }) : null,
      local ? el('a', { href: hrefFor('/transcripts', { week: String(week) }), text: 'Week transcripts' }) : null,
    ]),
    assignment ? el('div', { class: 'panel' }, [
      el('strong', { text: assignment.title }),
      el('p', { class: 'muted', style: 'margin:.3rem 0' }, [
        `Due ${fmtDate(assignment.dueDate)} · ${assignment.realQuestions} practice questions.`,
      ]),
    ]) : notice('No assignment found for this week.'),
    el('h2', { text: `Lessons (${weekLessons.length})` }),
    el('div', {}, weekLessons.map((l: LessonRow) => el('div', { class: 'card', style: 'margin:.4rem 0' }, [
      el('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap;align-items:baseline' }, [
        el('strong', { text: l.title }),
        badge(l.type),
        l.hasLocalVtt ? badge('transcript', 'good') : null,
        l.videoUrl ? badge('video link') : null,
      ]),
      l.unit ? el('div', { class: 'tiny', text: l.unit }) : null,
      el('div', { style: 'margin-top:.35rem;display:flex;gap:.6rem;flex-wrap:wrap' }, [
        l.videoUrl ? el('a', { href: l.videoUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Open video' }) : null,
        local && l.hasLocalVtt ? el('a', { href: hrefFor('/transcript', { file: l.vttFile || '' }), text: 'Open transcript' }) : null,
        local && l.mdRelPath ? el('a', { href: hrefFor(`/reader/${(l.mdRelPath || '').split('/').map(encodeURIComponent).join('/')}`), text: 'Lesson page' }) : null,
      ]),
      l.links?.length ? el('div', { class: 'chip-row' }, l.links.map((lk) => el('a', {
        class: 'chip', href: lk.url, target: '_blank', rel: 'noopener noreferrer', text: lk.text || lk.url,
      }))) : null,
    ]))),
    local ? el('h2', { text: `Transcripts for this week (${vttFiles.length})` }) : null,
    local
      ? (vttFiles.length === 0
          ? el('div', { class: 'empty' }, [
              el('div', {}, [icon({ name: 'transcript', size: 24 })]),
              el('div', { text: 'No transcripts saved for this week.' }),
            ])
          : el('div', { class: 'table-wrap' }, [
              el('table', { class: 'data' }, [
                el('thead', {}, [el('tr', {}, ['File', 'Lesson', 'Cues', 'Length', ''].map((h) => el('th', { text: h })))]),
                el('tbody', {}, vttFiles.map((t) => el('tr', {}, [
                  el('td', { text: t.file }),
                  el('td', { text: t.lesson }),
                  el('td', { text: String(t.cueCount) }),
                  el('td', { text: `${Math.round(t.durationSec / 60)} min` }),
                  el('td', {}, [el('a', { href: hrefFor('/transcript', { file: t.file }), text: 'Read' })]),
                ]))),
              ]),
            ]))
      : null,
    el('h2', { text: 'Study resources for this week' }),
    el('p', { class: 'muted', text: 'Links related to this week, collected from the study materials.' }),
    weekResources.length === 0
      ? el('div', { class: 'empty' }, [
          el('div', {}, [icon({ name: 'resources', size: 24 })]),
          el('div', { text: 'No linked resources for this week yet.' }),
        ])
      : el('div', {}, weekResources.map((r) => resourceRow(r))),
    el('p', {}, [el('a', { href: hrefFor('/resources', { week: String(week) }), text: 'Open full Study Resources catalog →' })]),
  );
  wireCopyButtons(c);
}
