import { api, gate, dataBase, type QuestionBlock } from '../api';
import { actions, getState } from '../store';
import { el, mount, pageHead, badge, debounce, breadcrumbs, icon, contentGate } from '../ui';
import { hrefFor, currentRoute, routeToken } from '../router';
import { expectedFor, gradeAnswer, hasUsableKey, optionLetter, stemText } from '../grading';

const PAGE_SIZE = 25;

/** questionClass → card stripe class. */
function questionClassKind(qc: string): string {
  switch (qc) {
    case 'mcq-single-select':    return 'mcq';
    case 'msq-multiple-select':  return 'msq';
    case 'numeric-input':        return 'num';
    case 'fill-in-blank-text':   return 'fill';
    case 'true-false':           return 'tf';
    default:                     return 'misc';
  }
}

/** Plain-English labels; stored class keys stay unchanged in the data. */
const TYPE_LABELS: Record<string, string> = {
  'fill-in-blank-text': 'Fill in the blank',
  'mcq-single-select': 'Multiple choice',
  'true-false': 'True / False',
  'numeric-input': 'Number',
  'msq-multiple-select': 'Select all that apply',
};
function classLabel(qc: string): string {
  return TYPE_LABELS[qc] || qc;
}

function setBreadcrumb(): void {
  const host = document.getElementById('crumb-slot');
  if (!host) return;
  mount(host, breadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Practice questions' },
  ])!);
}

function provenanceBadge(q: QuestionBlock): HTMLElement {
  if (q.provenance === 'Course accepted response') return badge('Course answer', 'good');
  if (q.provenance === 'Inferred from full-score submission') return badge('Inferred answer', 'warn');
  return badge('No key', 'bad');
}

/** Inline course audio/images captured for this question (local edition). */
function renderStimulusMedia(q: QuestionBlock): HTMLElement | null {
  if (!q.stimulusMedia?.length) return null;
  const wrap = el('div', { class: 'stim-media' });
  for (const m of q.stimulusMedia) {
    const src = `${dataBase()}${m.src}`;
    if (m.kind === 'image') {
      wrap.append(el('img', { src, alt: 'Course picture for this question', loading: 'lazy' }));
    } else {
      const audio = el('audio', { controls: true, preload: 'none', src }) as HTMLAudioElement;
      audio.style.width = '100%';
      wrap.append(audio);
    }
  }
  return wrap;
}

function questionCard(q: QuestionBlock, reviewMode: boolean, ctxAnchor: string | null): HTMLElement {
  const state = getState();
  const cardEl = el('div', { class: `qcard q-${questionClassKind(q.questionClass)}`, 'data-qid': q.id });
  const expected = expectedFor(q);
  const hasKey = hasUsableKey(q);
  const hasLocalStim = (q.stimulusMedia?.length || 0) > 0;
  const stem = stemText(q);

  cardEl.append(
    el('div', { class: 'qmeta' }, [
      badge(`${q.week} · Q${q.displayNumber ?? q.questionIndex}`),
      badge(classLabel(q.questionClass)),
      q.points !== null ? badge(`${q.points} pts`) : null,
      provenanceBadge(q),
      q.stimulusExternal && hasLocalStim ? badge('course audio/image', 'good') : null,
      q.stimulusExternal && !hasLocalStim ? badge('needs audio/image', 'bad') : null,
      state.missedQuestionIds.includes(q.id) ? badge('missed before', 'bad') : null,
      ctxAnchor ? el('a', { class: 'qctx-link', href: `#${ctxAnchor}`, text: 'instructions ↑' }) : null,
      ...q.concepts.slice(0, 4).map((c) => badge(c)),
    ]),
  );

  if (q.stimulusExternal && !hasLocalStim) {
    cardEl.append(el('div', { class: 'notice bad', text: 'This question needs the original course audio/image, which is not in the local study data.' }));
  }

  cardEl.append(el('div', { class: 'qtext', text: stem }));

  const mediaEl = renderStimulusMedia(q);
  if (mediaEl) cardEl.append(mediaEl);

  const answerHost = el('div');

  const finish = (selected: string[], correct: boolean | null) => {
    actions.recordAttempt(q.id, selected, correct === true);
    if (correct === false) actions.markQuestionMissed(q.id);
    mount(answerHost, buildResult());
  };

  function buildResult(): HTMLElement {
    if (!hasKey) {
      return el('div', { class: 'answer-box none' }, [
        el('strong', { text: 'No answer key. ' }),
        el('span', { text: 'Your attempt was saved. The course data has no answer for this one.' }),
        sourceDetails(),
      ]);
    }
    const inferred = q.provenance === 'Inferred from full-score submission';
    return el('div', { class: 'answer-box ok' }, [
      el('strong', { text: inferred ? 'Inferred answer (full-score attempt, not official): ' : 'Course answer: ' }),
      el('span', { text: expected.join(' · ') }),
      sourceDetails(),
    ]);
  }

  function sourceDetails(): HTMLElement {
    return el('details', { class: 'src-details' }, [
      el('summary', { text: 'Source details' }),
      el('div', { class: 'tiny', text: `${q.provenance} · ${q.assignmentTitle}` }),
      el('div', { class: 'tiny', text: q.sourcePath }),
    ]);
  }

  if (q.questionClass === 'mcq-single-select' || q.questionClass === 'true-false') {
    const opts = q.questionClass === 'true-false' && !q.options.length
      ? [{ index: 0, text: 'richtig' }, { index: 1, text: 'falsch' }]
      : q.options;
    const name = `opt-${q.id}`;
    const wrap = el('div', { class: 'options' }, opts.map((o) => el('label', {}, [
      el('input', { type: 'radio', name, value: o.text }),
      el('span', { text: `${optionLetter(o.index)}) ${o.text}` }),
    ])));
    const submit = el('button', { type: 'button', class: 'primary', text: 'Submit' });
    submit.addEventListener('click', () => {
      const checked = wrap.querySelector<HTMLInputElement>('input:checked');
      if (!checked) return;
      const label = checked.value;
      finish([label], gradeAnswer(q, [label]));
      wrap.querySelectorAll<HTMLInputElement>('input').forEach((i) => { i.disabled = true; });
      submit.disabled = true;
    });
    cardEl.append(wrap, submit, answerHost);
    if (reviewMode) answerHost.append(buildResult());
  } else if (q.questionClass === 'msq-multiple-select') {
    const name = `opt-${q.id}`;
    const wrap = el('div', { class: 'options' }, q.options.map((o) => el('label', {}, [
      el('input', { type: 'checkbox', name, value: o.text }),
      el('span', { text: `${optionLetter(o.index)}) ${o.text}` }),
    ])));
    const submit = el('button', { type: 'button', class: 'primary', text: 'Submit' });
    submit.addEventListener('click', () => {
      const checked = [...wrap.querySelectorAll<HTMLInputElement>('input:checked')];
      const selected = checked.map((i) => i.value);
      finish(selected, gradeAnswer(q, selected));
      wrap.querySelectorAll<HTMLInputElement>('input').forEach((i) => { i.disabled = true; });
      submit.disabled = true;
    });
    cardEl.append(wrap, submit, answerHost);
    if (reviewMode) answerHost.append(buildResult());
  } else {
    const input = el('input', {
      type: 'text',
      placeholder: 'Your answer…',
      'aria-label': 'Your answer',
      style: 'width:100%;max-width:340px;padding:.4rem .6rem;border:1px solid var(--line);border-radius:6px',
    }) as HTMLInputElement;
    const submit = el('button', { type: 'button', class: 'primary', text: 'Check' });
    submit.addEventListener('click', () => {
      const val = input.value.trim();
      if (!val) return;
      finish([val], gradeAnswer(q, [val]));
      input.disabled = true;
      submit.disabled = true;
    });
    cardEl.append(input, submit, answerHost);
    if (reviewMode) answerHost.append(buildResult());
  }

  if (hasKey && !reviewMode) {
    const reveal = el('button', { type: 'button', class: 'ghost', text: 'Show answer' });
    reveal.addEventListener('click', () => { answerHost.append(buildResult()); reveal.disabled = true; });
    cardEl.append(reveal);
  }

  return cardEl;
}

export async function renderQuestions(c: HTMLElement): Promise<void> {
  const tok = routeToken();
  mount(c, el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }));
  const gateOk = await gate(['questions-meta.json', 'concepts.json']);
  if (routeToken() !== tok) return;
  if (!gateOk) {
    mount(c, contentGate({
      title: 'Practice questions',
      reason: 'Practice questions come from the course\'s own graded assignments, which cannot be republished here.',
      alternatives: [
        { label: 'Weeks & syllabus', href: '/weeks' },
        { label: 'Study Resources', href: '/resources' },
        { label: 'Revision plan', href: '/plan' },
      ],
    }));
    return;
  }
  const [meta, concepts] = await Promise.all([api.questionsMeta(), api.concepts()]);
  const allWeeks = await Promise.all(meta.weeks.map((w) => api.weekQuestions(w)));
  if (routeToken() !== tok) return;
  const all: QuestionBlock[] = [];
  for (const wk of allWeeks) for (const b of wk.blocks) if (!b.isInstruction) all.push(b);

  setBreadcrumb();

  const qp = currentRoute().query;
  const weekSel = el('select', { 'aria-label': 'Week filter' }, [
    el('option', { value: '', text: 'All weeks' }),
    ...meta.weeks.map((w) => el('option', { value: String(w), text: `Week ${w}`, selected: qp.get('week') === String(w) || undefined })),
  ]) as HTMLSelectElement;
  const typeSel = el('select', { 'aria-label': 'Type filter' }, [
    el('option', { value: '', text: 'All types' }),
    ...Object.keys(meta.byClass).map((k) => el('option', { value: k, text: classLabel(k), selected: qp.get('type') === k || undefined })),
  ]) as HTMLSelectElement;
  const conceptSel = el('select', { 'aria-label': 'Concept filter' }, [
    el('option', { value: '', text: 'All concepts' }),
    ...concepts.table.map((r) => el('option', { value: r.concept, text: r.concept, selected: qp.get('concept') === r.concept || undefined })),
  ]) as HTMLSelectElement;
  const provSel = el('select', { 'aria-label': 'Answer source filter' }, [
    el('option', { value: '', text: 'Any answer source' }),
    el('option', { value: 'Course accepted response', text: 'Course answer', selected: qp.get('prov') === 'Course accepted response' || undefined }),
    el('option', { value: 'Inferred from full-score submission', text: 'Inferred answer', selected: qp.get('prov') === 'Inferred from full-score submission' || undefined }),
    el('option', { value: 'No local answer key', text: 'No key', selected: qp.get('prov') === 'No local answer key' || undefined }),
  ]) as HTMLSelectElement;
  const availSel = el('select', { 'aria-label': 'Answer availability' }, [
    el('option', { value: '', text: 'Any' }),
    el('option', { value: 'with', text: 'With key' }),
    el('option', { value: 'without', text: 'Without key' }),
  ]) as HTMLSelectElement;
  const stimChk = el('input', { type: 'checkbox', ...(qp.get('stim') === '1' ? { checked: true } : {}) }) as HTMLInputElement;
  const reviewChk = el('input', { type: 'checkbox' }) as HTMLInputElement;
  const missedChk = el('input', { type: 'checkbox', ...(qp.get('missed') === '1' ? { checked: true } : {}) }) as HTMLInputElement;
  const textInput = el('input', { type: 'search', placeholder: 'Search question text…', 'aria-label': 'Search questions' }) as HTMLInputElement;

  const listHost = el('div');
  const statusHost = el('p', { class: 'muted' });
  let page = 0;

  function filtered(): QuestionBlock[] {
    const missed = new Set(getState().missedQuestionIds);
    const q = textInput.value.trim().toLowerCase();
    return all.filter((b) => {
      if (weekSel.value && String(b.weekNum) !== weekSel.value) return false;
      if (typeSel.value && b.questionClass !== typeSel.value) return false;
      if (conceptSel.value && !b.concepts.includes(conceptSel.value)) return false;
      if (provSel.value && b.provenance !== provSel.value) return false;
      const key = hasUsableKey(b);
      if (availSel.value === 'with' && !key) return false;
      if (availSel.value === 'without' && key) return false;
      if (stimChk.checked && !b.stimulusExternal) return false;
      if (missedChk.checked && !missed.has(b.id)) return false;
      if (q && !b.questionText.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function draw(): void {
    const rows = filtered();
    const maxPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
    if (page > maxPage) page = maxPage;
    const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const review = reviewChk.checked;
    if (slice.length === 0) {
      mount(listHost, el('div', { class: 'empty' }, [
        el('div', {}, [icon({ name: 'questions', size: 24 })]),
        el('div', { text: 'No questions match the current filters.' }),
      ]));
    } else {
      // Shared instruction dedup: one labelled banner per run of cards that
      // share the same assignment instructions; later cards link back to it.
      const nodes: (HTMLElement | null)[] = [];
      let lastStimulus = '';
      let lastAnchor: string | null = null;
      let ctxSeq = 0;
      for (const b of slice) {
        const stem = stemText(b);
        const stim = (b.stimulus || '').trim();
        let ctxAnchor: string | null = null;
        if (stim && stim !== stem) {
          if (stim !== lastStimulus) {
            ctxSeq += 1;
            const anchor = `qctx-${ctxSeq}`;
            nodes.push(el('div', { class: 'qcontext', id: anchor, tabindex: '-1' }, [
              el('div', { class: 'qcontext-head' }, [
                icon({ name: 'info', size: 14 }),
                el('strong', { text: 'Instructions (shared by the questions below)' }),
              ]),
              el('div', { class: 'qcontext-text', text: stim }),
            ]));
            lastAnchor = anchor;
            lastStimulus = stim;
            ctxAnchor = null; // banner sits directly above this card
          } else {
            ctxAnchor = lastAnchor;
          }
        } else {
          lastStimulus = '';
          lastAnchor = null;
        }
        nodes.push(questionCard(b, review, ctxAnchor));
      }
      mount(listHost, el('div', {}, nodes));
    }
    statusHost.textContent = `${rows.length} · page ${page + 1} of ${maxPage + 1}`;
    pager.hidden = rows.length <= PAGE_SIZE;
  }

  const prev = el('button', { text: '← Prev', type: 'button' });
  const next = el('button', { text: 'Next →', type: 'button' });
  prev.addEventListener('click', () => { page = Math.max(0, page - 1); draw(); window.scrollTo({ top: 0 }); });
  next.addEventListener('click', () => { page += 1; draw(); window.scrollTo({ top: 0 }); });
  const pager = el('div', { class: 'pager' }, [prev, next, statusHost]);

  const redraw = debounce(() => { page = 0; draw(); }, 150);
  for (const ctl of [weekSel, typeSel, conceptSel, provSel, availSel]) ctl.addEventListener('change', () => { page = 0; draw(); });
  for (const chk of [stimChk, reviewChk, missedChk]) chk.addEventListener('change', () => { page = 0; draw(); });
  textInput.addEventListener('input', redraw);
  draw();

  mount(c,
    pageHead('Practice questions', `${meta.realQuestions} questions from the 12 weekly assignments. ${meta.instructionBlocks} instruction blocks appear as shared context, not as questions.`),
    el('p', { class: 'tiny' }, [
      'Answer sources: ',
      el('strong', { text: 'Course answer' }), ' = accepted by the course · ',
      el('strong', { text: 'Inferred answer' }), ' = from a full-score attempt, not official · ',
      el('strong', { text: 'No key' }), ' = the course data has none (never invented). ',
    ]),
    el('div', { class: 'filters' }, [
      el('label', {}, ['Week', weekSel]),
      el('label', {}, ['Type', typeSel]),
      el('label', {}, ['Concept', conceptSel]),
      el('label', {}, ['Answer source', provSel]),
      el('label', {}, ['Answer key', availSel]),
      el('label', { class: 'grow' }, ['Search', textInput]),
      el('label', { style: 'flex-direction:row;align-items:center;gap:.35rem' }, [stimChk, 'Needs audio/image']),
      el('label', { style: 'flex-direction:row;align-items:center;gap:.35rem' }, [missedChk, 'Missed']),
      el('label', { style: 'flex-direction:row;align-items:center;gap:.35rem' }, [reviewChk, 'Show answers']),
    ]),
    el('p', { class: 'tiny' }, [
      'Answers stay hidden until you submit. Missed questions are saved in this browser. ',
      el('a', { href: hrefFor('/tools'), text: 'Export progress' }),
    ]),
    pager,
    listHost,
  );
}
