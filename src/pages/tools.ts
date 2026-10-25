import { api, isLocalEdition } from '../api';
import { getState, exportProgress, importProgress, resetProgress } from '../store';
import { el, mount, pageHead, notice, badge } from '../ui';
import { hrefFor } from '../router';

export async function renderTools(c: HTMLElement): Promise<void> {
  const state = getState();
  const local = isLocalEdition();
  const [vocab, qmeta] = local
    ? await Promise.all([api.vocabulary(), api.questionsMeta()])
    : [null, null] as const;

  const starred = vocab ? vocab.entries.filter((e) => state.starredVocab.includes(e.german)) : [];
  const missedIds = state.missedQuestionIds;

  const importFile = el('input', { type: 'file', accept: 'application/json' }) as HTMLInputElement;
  importFile.addEventListener('change', async () => {
    const f = importFile.files?.[0];
    if (!f) return;
    const text = await f.text();
    const ok = importProgress(text);
    alert(ok ? 'Progress imported.' : 'Import failed: invalid JSON.');
    void renderTools(c);
  });

  mount(c,
    pageHead('Study tools', 'Bookmarks, missed questions, flashcards and progress. Saved in this browser only.'),
    notice('Progress is saved in this browser only. Clearing browser data or switching device starts from zero. Export regularly if you want a backup.'),
    el('h2', { text: 'Progress snapshot' }),
    el('div', { class: 'cards' }, [
      el('div', { class: 'card' }, [el('div', { class: 'num', text: String(state.visitedWeeks.length) }), el('div', { class: 'lbl', text: 'weeks visited' })]),
      el('div', { class: 'card' }, [el('div', { class: 'num', text: String(state.visitedLessons.length) }), el('div', { class: 'lbl', text: 'lessons visited' })]),
      el('div', { class: 'card' }, [el('div', { class: 'num', text: String(state.answeredQuestionIds.length) }), el('div', { class: 'lbl', text: 'questions attempted' })]),
      el('div', { class: 'card' }, [el('div', { class: 'num', text: String(missedIds.length) }), el('div', { class: 'lbl', text: 'missed tracked' })]),
      el('div', { class: 'card' }, [el('div', { class: 'num', text: String(starred.length) }), el('div', { class: 'lbl', text: 'starred vocabulary' })]),
      el('div', { class: 'card' }, [el('div', { class: 'num', text: String(state.bookmarks.length) }), el('div', { class: 'lbl', text: 'bookmarks' })]),
    ]),
    el('h2', { text: 'Review missed questions' }),
    !local
      ? el('div', { class: 'empty', text: 'Missed-question tracking is part of the local edition with the full practice questions.' })
      : missedIds.length === 0
      ? el('div', { class: 'empty', text: 'No missed questions yet. Practice questions and wrong answers appear here.' })
      : el('div', { class: 'panel' }, [
        el('p', { class: 'muted' }, [`${missedIds.length} question id(s) marked missed in this browser.`]),
        el('p', {}, [el('a', { class: 'btn primary', href: hrefFor('/questions', { missed: '1' }), text: 'Open filtered practice view' })]),
        el('details', {}, [
          el('summary', { text: 'Show IDs' }),
          el('pre', { style: 'white-space:pre-wrap;font-size:.75rem', text: missedIds.join('\n') }),
        ]),
      ]),
    local ? el('h2', { text: 'Starred vocabulary flashcards' }) : null,
    local
      ? (starred.length === 0
          ? el('div', { class: 'empty', text: 'Star entries in the Vocabulary hub to build a deck.' })
          : el('div', { class: 'grid-2' }, starred.map((e) => {
              const back = el('div', { class: 'tiny', style: 'display:none;margin-top:.3rem', text: e.gloss });
              const btn = el('button', { type: 'button', class: 'ghost', text: 'Flip' });
              btn.addEventListener('click', () => {
                const shown = back.style.display !== 'none';
                back.style.display = shown ? 'none' : 'block';
              });
              return el('div', { class: 'card' }, [el('strong', { text: e.german }), back, btn]);
            })))
      : null,
    el('h2', { text: 'Bookmarks' }),
    state.bookmarks.length === 0
      ? el('p', { class: 'muted', text: 'No bookmarks yet.' })
      : el('ul', {}, state.bookmarks.map((b) => el('li', {}, [badge(b.kind), ' ', el('a', { href: b.id, text: b.label })]))),
    el('h2', { text: 'Export / import / reset' }),
    el('div', { style: 'display:flex;gap:.6rem;flex-wrap:wrap;align-items:center' }, [
      (() => {
        const btn = el('button', { type: 'button', text: 'Download progress JSON' });
        btn.addEventListener('click', () => {
          const blob = new Blob([exportProgress()], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'german-i-study-progress.json';
          a.click();
          URL.revokeObjectURL(a.href);
        });
        return btn;
      })(),
      importFile,
      (() => {
        const btn = el('button', { type: 'button', text: 'Reset ALL progress' });
        btn.addEventListener('click', () => {
          if (confirm('Erase all locally stored progress?')) { resetProgress(); void renderTools(c); }
        });
        return btn;
      })(),
    ]),
    local && qmeta
      ? el('p', { class: 'tiny' }, [
          `Practice data: ${qmeta.realQuestions} questions · ${qmeta.instructionBlocks} instruction blocks · ${qmeta.stimulusExternal} need audio or image (${qmeta.stimulusExternalWithLocalMedia ?? 0} with the saved course file).`,
        ])
      : null,
  );
}
