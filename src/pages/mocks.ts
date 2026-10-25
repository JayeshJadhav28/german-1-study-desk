import { api, gate, type MockItem } from '../api';
import { actions, getState } from '../store';
import { el, mount, pageHead, notice, badge, breadcrumbs, contentGate } from '../ui';
import { hrefFor, currentRoute } from '../router';
import { renderMarkdown } from '../md';

function normalizeAns(s: string): string {
  return s.trim().toLowerCase().replace(/[.!?]+$/, '');
}

function checkItem(item: MockItem, selected: string[]): boolean {
  const exp = item.answers.map(normalizeAns).sort();
  const sel = selected.map(normalizeAns).sort();
  return exp.length > 0 && sel.length === exp.length && exp.every((v, i) => v === sel[i]);
}

function setBreadcrumb(trail: { label: string; href?: string }[]): void {
  const host = document.getElementById('crumb-slot');
  if (!host) return;
  mount(host, breadcrumbs(trail)!);
}

export async function renderMocks(c: HTMLElement): Promise<void> {
  mount(c, el('div', { class: 'skeleton' }));
  if (!await gate(['mocks.json'])) {
    mount(c, contentGate({
      title: 'Mock tests',
      reason: 'Mock tests follow the course\'s own assignment templates and cannot be republished here.',
      alternatives: [
        { label: 'Revision plan', href: '/plan' },
        { label: 'Weeks & syllabus', href: '/weeks' },
        { label: 'Study Resources', href: '/resources' },
      ],
    }));
    return;
  }
  const doc = await api.mocks();
  const state = getState();

  setBreadcrumb([
    { label: 'Home', href: '/' },
    { label: 'Mock tests' },
  ]);

  const fmtHtml = renderMarkdown(doc.formatDeclaration, { mdId: 'German-I-Exam-Prep-Output/05_Three_Mock_Tests.md' }).html;

  mount(c,
    pageHead('Mock tests', 'Three practice tests: Weeks 1–4, 5–8 and 9–12.'),
    notice('Practice format — not the official exam. The official German I exam paper, timing and marking rules are not documented here. These mocks follow the assignment templates.', 'bad'),
    el('div', { class: 'panel' }, [el('div', { class: 'md-body', html: fmtHtml })]),
    el('div', { class: 'grid-2' }, doc.mocks.map((m) => {
      const att = state.mockAttempts[String(m.mockNumber)];
      return el('div', { class: 'card' }, [
        el('strong', { text: `Mock ${m.mockNumber}: ${m.title}` }),
        el('div', { class: 'tiny', style: 'margin:.3rem 0', text: `${m.itemCount} questions · focus Weeks ${m.focusWeeks} · practice format` }),
        att ? el('div', { class: 'tiny', text: `Last attempt: ${att.score}/${att.total}` }) : null,
        el('a', { class: 'btn primary', href: hrefFor(`/mock/${m.mockNumber}`), text: 'Start test' }),
      ]);
    })),
  );
}

export async function renderMockTest(c: HTMLElement): Promise<void> {
  const n = Number(currentRoute().params?.n);
  mount(c, el('div', { class: 'skeleton' }));
  if (!await gate(['mocks.json'])) {
    mount(c, contentGate({
      title: 'Mock test',
      reason: 'Mock tests follow the course\'s own assignment templates and cannot be republished here.',
      alternatives: [{ label: 'Revision plan', href: '/plan' }, { label: 'Weeks & syllabus', href: '/weeks' }],
    }));
    return;
  }
  const doc = await api.mocks();
  const found = doc.mocks.find((x) => x.mockNumber === n);
  if (!found) { mount(c, pageHead('Mock not found'), el('a', { href: hrefFor('/mocks'), text: 'All mocks' })); return; }
  const m = found;

  setBreadcrumb([
    { label: 'Home', href: '/' },
    { label: 'Mock tests', href: '/mocks' },
    { label: `Mock ${m.mockNumber}` },
  ]);

  const answers: Record<string, string[]> = {};
  const resultHost = el('div');
  const itemsHost = el('div');
  const progressBar = el('div', { class: 'mock-progress', 'aria-label': 'Test progress' }, [el('span')]);
  const progressLabel = el('span', { class: 'muted', text: `0 / ${m.items.length} answered` });

  function refreshProgress(): void {
    const answered = m.items.filter((it) => (answers[it.num] || []).length > 0).length;
    const pct = m.items.length ? Math.round((answered / m.items.length) * 100) : 0;
    (progressBar.firstElementChild as HTMLElement).style.width = `${pct}%`;
    progressLabel.textContent = `${answered} / ${m.items.length} answered`;
  }

  function score(): { correct: number; total: number; detail: { item: MockItem; ok: boolean; selected: string[] }[] } {
    const detail = m.items.map((item) => {
      const selected = answers[item.num] || [];
      const ok = checkItem(item, selected);
      return { item, ok, selected };
    });
    return {
      correct: detail.filter((d) => d.ok).length,
      total: m.items.length,
      detail,
    };
  }

  function drawItems(graded: ReturnType<typeof score> | null): void {
    mount(itemsHost, ...m.items.map((item) => {
      const wrap = el('div', { class: 'mock-item' });
      wrap.append(
        el('div', { class: 'qmeta', style: 'display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.3rem' }, [
          badge(`Q${item.num}`), badge(`Section ${item.section}`), badge(item.type), badge(`${item.points} pt`),
        ]),
        el('div', { class: 'qtext', text: item.prompt }),
      );
      const g = graded?.detail.find((d) => d.item.num === item.num);
      if (item.options.length) {
        const name = `mock-${n}-q${item.num}`;
        const box = el('div', { class: 'options' }, item.options.map((o) => {
          const lab = el('label', {}, [
            el('input', {
              type: item.type === 'msq' ? 'checkbox' : 'radio',
              name, value: o.letter,
              ...(graded ? { disabled: true } : {}),
              ...(g?.selected.includes(o.text) || (answers[item.num] || []).includes(o.text) ? { checked: true } : {}),
            }),
            el('span', { text: `${o.letter.toUpperCase()}) ${o.text}` }),
          ]);
          lab.querySelector('input')!.addEventListener('change', (e) => {
            const t = e.target as HTMLInputElement;
            if (item.type === 'msq') {
              const cur = new Set(answers[item.num] || []);
              const label = item.options.find((op) => op.letter === t.value)?.text || t.value;
              if (t.checked) cur.add(label); else cur.delete(label);
              answers[item.num] = [...cur];
            } else {
              const label = item.options.find((op) => op.letter === t.value)?.text || t.value;
              answers[item.num] = [label];
            }
            refreshProgress();
          });
          return lab;
        }));
        wrap.append(box);
      } else {
        const input = el('input', {
          type: 'text', placeholder: 'Your answer…',
          style: 'width:100%;max-width:360px;padding:.4rem .6rem;border:1px solid var(--line);border-radius:6px',
          ...(graded ? { disabled: true } : {}),
          value: (answers[item.num] || [])[0] || '',
        }) as HTMLInputElement;
        input.addEventListener('input', () => {
          answers[item.num] = input.value.trim() ? [input.value.trim()] : [];
          refreshProgress();
        });
        wrap.append(input);
      }
      if (g) {
        wrap.append(el('div', { class: `answer-box ${g.ok ? 'ok' : 'no'}` }, [
          el('strong', { text: g.ok ? 'Correct. ' : 'Not correct. ' }),
          el('span', { text: `Accepted: ${item.answers.join(' · ')} ` }),
          item.evidence ? el('span', { class: 'tiny', text: `Source: ${item.evidence}` }) : null,
        ]));
      }
      return wrap;
    }));
    refreshProgress();
  }

  const submitBtn = el('button', { type: 'button', class: 'primary', text: 'Submit & score' });
  submitBtn.addEventListener('click', () => {
    const s = score();
    actions.recordMockAttempt(n, s.correct, s.total);
    mount(resultHost,
      el('div', { class: 'panel' }, [
        el('div', { class: 'mock-score', text: `${s.correct} / ${s.total}` }),
        el('p', { class: 'muted', text: 'Scored with the practice answer key. Saved to your local history.' }),
      ]),
    );
    drawItems(s);
    submitBtn.disabled = true;
    restartBtn.focus();
  });

  const restartBtn = el('button', { type: 'button', text: 'Restart test' });
  restartBtn.addEventListener('click', () => {
    for (const k of Object.keys(answers)) delete answers[k];
    mount(resultHost);
    drawItems(null);
    submitBtn.disabled = false;
  });

  drawItems(null);

  mount(c,
    pageHead(`Mock ${m.mockNumber}: ${m.title}`),
    notice('Practice format — not the official exam. No negative marking assumed. Suggested time 45 minutes (from the source document, not an official rule).', 'bad'),
    el('div', { class: 'quicklinks' }, [
      el('a', { href: hrefFor('/mocks'), text: '← All mocks' }),
      el('a', { href: hrefFor('/reader/German-I-Exam-Prep-Output/05_Three_Mock_Tests.md'), text: 'Source document' }),
    ]),
    el('div', { class: 'panel' }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap' }, [
        el('strong', { text: 'Your progress' }),
        progressLabel,
      ]),
      progressBar,
    ]),
    el('div', { style: 'display:flex;gap:.6rem;flex-wrap:wrap' }, [submitBtn, restartBtn]),
    resultHost,
    itemsHost,
  );
}
