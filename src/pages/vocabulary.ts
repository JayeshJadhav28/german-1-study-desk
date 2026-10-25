import { api, gate, type VocabEntry } from '../api';
import { actions, getState } from '../store';
import { el, mount, pageHead, notice, badge, debounce, contentGate } from '../ui';

function likelyAsrCorrupt(g: string): boolean {
  // Transparent heuristic: internal single-letter gaps like "M chte" (ASR umlaut stripping)
  return /\b[A-ZÄÖÜ]\s[a-zäöüß]{2,}\b/.test(g) || /\s[.,!?]/.test(g);
}

export async function renderVocabulary(c: HTMLElement): Promise<void> {
  mount(c, el('div', { class: 'skeleton' }));
  if (!await gate(['vocabulary.json', 'markdown/German-I-Exam-Prep-Output/03_Vocabulary_Master.md'])) {
    mount(c, contentGate({
      title: 'Vocabulary',
      reason: 'The vocabulary lists come from the course\'s own study materials, which cannot be republished.',
      alternatives: [
        { label: 'Grammar hub', href: '/grammar' },
        { label: 'Weeks', href: '/weeks' },
        { label: 'Study Resources', href: '/resources' },
      ],
    }));
    return;
  }
  const doc = await api.vocabulary();

  const searchInput = el('input', { type: 'search', placeholder: 'Search German or English…', 'aria-label': 'Search vocabulary' }) as HTMLInputElement;
  const sectionSel = el('select', { 'aria-label': 'Section filter' }, [
    el('option', { value: '', text: 'All sections' }),
    ...doc.sections.map((s) => el('option', { value: s.heading, text: s.heading })),
  ]) as HTMLSelectElement;
  const starredOnly = el('input', { type: 'checkbox' }) as HTMLInputElement;
  const listHost = el('div');

  // Flashcards from starred or first N pairs
  const cardHost = el('div', { class: 'grid-2' });

  function pairList(): VocabEntry[] {
    return doc.entries;
  }

  function drawCards(): void {
    const starred = pairList().filter((e) => getState().starredVocab.includes(e.german));
    const pool = starred.length ? starred : pairList().slice(0, 8);
    mount(cardHost, ...pool.slice(0, 12).map((e) => {
      const flip = el('button', { type: 'button', text: 'Show English', class: 'ghost' });
      const back = el('div', { class: 'tiny', style: 'margin-top:.3rem;display:none', text: e.gloss });
      flip.addEventListener('click', () => {
        const shown = back.style.display !== 'none';
        back.style.display = shown ? 'none' : 'block';
        flip.textContent = shown ? 'Show English' : 'Show German';
      });
      return el('div', { class: 'card' }, [
        el('strong', { text: e.german }),
        back,
        flip,
        el('div', { class: 'tiny', style: 'margin-top:.3rem', text: e.evidence }),
      ]);
    }));
  }

  function draw(): void {
    const q = searchInput.value.trim().toLowerCase();
    const sec = sectionSel.value;
    const starSet = new Set(getState().starredVocab);
    const rows = doc.entries.filter((e) => {
      if (sec && e.section !== sec) return false;
      if (starredOnly.checked && !starSet.has(e.german)) return false;
      if (q && !e.german.toLowerCase().includes(q) && !e.gloss.toLowerCase().includes(q)) return false;
      return true;
    });
    if (rows.length === 0) {
      mount(listHost, el('div', { class: 'empty', text: 'No vocabulary entries match.' }));
      return;
    }
    mount(listHost, el('table', { class: 'data' }, [
      el('thead', {}, [el('tr', {}, ['German', 'English gloss', 'Evidence', 'Section', ''].map((h) => el('th', { text: h })))]),
      el('tbody', {}, rows.slice(0, 200).map((e) => {
        const star = el('button', {
          type: 'button', class: 'ghost',
          text: starSet.has(e.german) ? '★ starred' : '☆ star',
          'aria-label': 'Star entry',
        });
        star.addEventListener('click', () => { actions.toggleVocabStar(e.german); draw(); drawCards(); });
        return el('tr', {}, [
          el('td', {}, [
            el('span', { text: e.german }),
            likelyAsrCorrupt(e.german) ? badge('check spelling', 'warn') : null,
          ]),
          el('td', { text: e.gloss }),
          el('td', { class: 'tiny', text: e.evidence }),
          el('td', { class: 'tiny', text: e.section }),
          el('td', {}, [star]),
        ]);
      })),
    ]));
  }

  const drawDebounced = debounce(draw, 150);
  searchInput.addEventListener('input', drawDebounced);
  sectionSel.addEventListener('change', draw);
  starredOnly.addEventListener('change', draw);
  draw();
  drawCards();

  mount(c,
    pageHead('Vocabulary', `${doc.entries.length} German–English entries with course evidence.`),
    notice(doc.overlapNote),
    el('div', { class: 'filters' }, [
      el('label', {}, ['Search', searchInput]),
      el('label', {}, ['Section', sectionSel]),
      el('label', { style: 'flex-direction:row;gap:.4rem;align-items:center' }, [starredOnly, 'Starred only']),
    ]),
    listHost,
    el('h2', { text: 'Flashcards' }),
    el('p', { class: 'muted', text: 'German → English pairs from the course tables. Starred entries come first.' }),
    cardHost,
  );
}
