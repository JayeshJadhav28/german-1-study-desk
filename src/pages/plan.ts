import { api } from '../api';
import { actions, getState, exportProgress, resetProgress } from '../store';
import { el, mount, pageHead, notice } from '../ui';
import { hrefFor } from '../router';

export async function renderPlan(c: HTMLElement): Promise<void> {
  mount(c, el('div', { class: 'skeleton' }));
  const doc = await api.plan();

  const pctHost = el('span', { class: 'muted' });
  const barHost = el('div', { class: 'bar', style: 'margin-top:.5rem' }, [el('span')]);

  function refreshPct(): void {
    const done = doc.days.flatMap((d) => d.tasks).filter((t) => getState().planDone[t.id]).length;
    const pct = Math.round((done / doc.totalTasks) * 100);
    pctHost.textContent = `${done}/${doc.totalTasks} tasks (${pct}%)`;
    (barHost.firstElementChild as HTMLElement).style.width = `${pct}%`;
  }

  const daysHost = el('div', {}, doc.days.map((day) => {
    const dayDone = day.tasks.filter((t) => getState().planDone[t.id]).length;
    return el('div', { class: 'panel' }, [
      el('div', { style: 'display:flex;justify-content:space-between;flex-wrap:wrap;gap:.4rem' }, [
        el('strong', { text: `Day ${day.dayNum} (${day.dateLabel}) — ${day.title}` }),
        el('span', { class: 'muted', text: `${dayDone}/${day.taskCount} done` }),
      ]),
      el('div', {}, day.tasks.map((task) => {
        const cb = el('input', { type: 'checkbox', ...(getState().planDone[task.id] ? { checked: true } : {}) }) as HTMLInputElement;
        cb.addEventListener('change', () => {
          actions.setPlanDone(task.id, cb.checked);
          refreshPct();
          doneLabel.textContent = cb.checked ? 'done' : '';
        });
        const doneLabel = el('span', { class: 'badge good', text: getState().planDone[task.id] ? 'done' : '', style: getState().planDone[task.id] ? '' : 'visibility:hidden' });
        const note = el('input', {
          type: 'text', placeholder: 'Personal note…', value: getState().planNotes[task.id] || '',
          'aria-label': 'Personal note',
          style: 'flex:1;min-width:180px;padding:.25rem .5rem;border:1px solid var(--line);border-radius:6px;font-size:.82rem',
        }) as HTMLInputElement;
        note.addEventListener('change', () => actions.setPlanNote(task.id, note.value.trim()));
        return el('label', {
          style: 'display:flex;gap:.5rem;align-items:flex-start;padding:.35rem 0;border-bottom:1px solid #eee8dc',
        }, [
          cb,
          el('div', { style: 'flex:1' }, [
            el('div', {}, [task.category ? el('span', { class: 'badge accent', text: task.category }) : null, ' ', el('span', { text: task.text })]),
            el('div', { style: 'display:flex;gap:.5rem;align-items:center;margin-top:.2rem' }, [note, doneLabel]),
          ]),
        ]);
      })),
    ]);
  }));

  refreshPct();

  const exportBtn = el('button', { type: 'button', text: 'Export progress JSON' });
  exportBtn.addEventListener('click', () => {
    const json = exportProgress();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'german-i-study-progress.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  const planResetBtn = el('button', { type: 'button', text: 'Reset plan ticks only' });
  planResetBtn.addEventListener('click', () => {
    const s = getState();
    for (const k of Object.keys(s.planDone)) actions.setPlanDone(k, false);
    for (const k of Object.keys(s.planNotes)) actions.setPlanNote(k, '');
    void renderPlan(c);
  });
  const allResetBtn = el('button', { type: 'button', text: 'Reset ALL progress' });
  allResetBtn.addEventListener('click', () => {
    if (confirm('Clear all locally stored progress?')) { resetProgress(); void renderPlan(c); }
  });

  mount(c,
    pageHead('Revision plan', `Seven days of review and practice, aimed at the course-listed exam date (${doc.examDateText}). Dates and priorities follow the source plan.`),
    notice('Work in order, even if you start later. Each day: review → practice → recall. Progress is saved in this browser.'),
    el('div', { class: 'panel' }, [
      el('div', { style: 'display:flex;justify-content:space-between;flex-wrap:wrap;gap:.5rem' }, [
        el('strong', { text: 'Completion' }), pctHost,
      ]),
      barHost,
      el('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.6rem' }, [
        el('a', { href: hrefFor('/reader/German-I-Exam-Prep-Output/06_Seven_Day_Revision_Plan.md'), text: 'Source document' }),
        exportBtn,
        planResetBtn,
        allResetBtn,
      ]),
    ]),
    daysHost,
  );
}
