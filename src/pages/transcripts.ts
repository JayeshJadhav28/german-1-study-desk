import { api, gate, type TranscriptIndexEntry } from '../api';
import { actions } from '../store';
import { el, mount, pageHead, notice, badge, fmtSec, debounce, contentGate } from '../ui';
import { hrefFor, currentRoute } from '../router';

function normalizeLight(s: string): string {
  // Clearly-labelled optional light normalization for common ASR umlaut stripping.
  // Applied only as a display toggle; raw text always available.
  return s
    .replace(/\bM chte\b/g, 'möchte')
    .replace(/\bU nd\b/g, 'Und')
    .replace(/\bV ielen\b/g, 'Vielen')
    .replace(/\bH allo\b/g, 'Hallo');
}

export async function renderTranscripts(c: HTMLElement): Promise<void> {
  mount(c, el('div', { class: 'skeleton' }));
  if (!await gate(['transcripts.json'])) {
    mount(c, contentGate({
      title: 'Lecture transcripts',
      reason: 'Transcripts are the course\'s own lecture subtitles, which cannot be republished here.',
      alternatives: [
        { label: 'Video links', href: '/weeks' },
        { label: 'Study Resources', href: '/resources' },
        { label: 'Weeks & syllabus', href: '/weeks' },
      ],
    }));
    return;
  }
  const doc = await api.transcripts();
  const params = currentRoute().query;
  const weekFilter = Number(params.get('week') || 0);

  const files = doc.files.filter((t) => !weekFilter || t.weekNum === weekFilter);

  const searchInput = el('input', { type: 'search', placeholder: 'Filter by lesson or file…', 'aria-label': 'Filter transcripts' }) as HTMLInputElement;
  const tbody = el('tbody');
  function draw(): void {
    const q = searchInput.value.trim().toLowerCase();
    const rows = files.filter((t) => !q || t.lesson.toLowerCase().includes(q) || t.file.toLowerCase().includes(q));
    mount(tbody, ...rows.map((t: TranscriptIndexEntry) => el('tr', {}, [
      el('td', {}, [el('a', { href: hrefFor('/transcript', { file: t.file }), text: t.file })]),
      el('td', { text: t.weekNum ? `Week ${t.weekNum}` : t.unit }),
      el('td', { text: t.lesson }),
      el('td', { text: String(t.cueCount) }),
      el('td', { text: `${Math.round(t.durationSec / 60)} min` }),
      el('td', {}, [t.headerOk ? badge('OK', 'good') : badge('header problem', 'bad')]),
    ])));
  }
  searchInput.addEventListener('input', debounce(draw, 150));
  draw();

  mount(c,
    pageHead('Transcripts', 'Auto-generated subtitles for the lectures (mixed German–English; may contain errors).'),
    notice(doc.asrNote),
    weekFilter ? el('p', {}, [badge(`filter: Week ${weekFilter}`, 'accent'), ' ', el('a', { href: hrefFor('/transcripts'), text: 'clear filter' })]) : null,
    el('div', { class: 'filters' }, [el('label', {}, ['Filter', searchInput])]),
    el('table', { class: 'data' }, [
      el('thead', {}, [el('tr', {}, ['File', 'Unit', 'Lesson', 'Cues', 'Length', 'Header'].map((h) => el('th', { text: h })))]),
      tbody,
    ]),
  );
}

export async function renderTranscriptReader(c: HTMLElement): Promise<void> {
  const file = currentRoute().query.get('file') || '';
  if (!file) { mount(c, pageHead('Transcript not found'), el('a', { href: hrefFor('/transcripts'), text: 'All transcripts' })); return; }
  mount(c, el('div', { class: 'skeleton' }));
  if (!await gate(['transcripts.json'])) {
    mount(c, contentGate({
      title: 'Lecture transcript',
      reason: 'Transcripts are the course\'s own lecture subtitles, which cannot be republished here.',
      alternatives: [{ label: 'Weeks & syllabus', href: '/weeks' }, { label: 'Study Resources', href: '/resources' }],
    }));
    return;
  }

  const [index, vtt] = await Promise.all([api.transcripts(), api.vtt(file)]);
  const meta = index.files.find((f) => f.file === file);
  if (meta) {
    actions.markWeekVisited(meta.weekNum || 0);
    actions.setLastVisited(`/transcript?file=${encodeURIComponent(file)}`, `Transcript: ${meta.lesson}`);
  }

  const cues = vtt.cues;
  let matchIdx: number[] = [];
  let cursor = -1;
  let showNorm = false;

  const searchInput = el('input', { type: 'search', placeholder: 'Search within transcript…', 'aria-label': 'Search transcript' }) as HTMLInputElement;
  const status = el('span', { class: 'muted' });
  const list = el('div', { class: 'cue-list' });

  function drawCues(highlight: string): void {
    const q = highlight.trim().toLowerCase();
    matchIdx = [];
    const frag = document.createDocumentFragment();
    cues.forEach((cue, i) => {
      const raw = showNorm ? normalizeLight(cue.text) : cue.text;
      const isMatch = q ? raw.toLowerCase().includes(q) : false;
      if (isMatch) matchIdx.push(i);
      const row = el('div', { class: `cue${isMatch ? ' match' : ''}`, id: `cue-${i}` }, [
        el('time', {}, [el('button', {
          type: 'button', class: 'ghost', 'data-seek': String(cue.startSec), text: fmtSec(cue.startSec), title: 'Copy timestamp / note start time',
        })]),
        el('div', { class: 'txt' }),
      ]);
      const txt = row.querySelector('.txt')!;
      if (q) {
        const lower = raw.toLowerCase();
        let pos = 0; let idx = lower.indexOf(q);
        while (idx >= 0) {
          txt.append(document.createTextNode(raw.slice(pos, idx)));
          txt.append(el('mark', { text: raw.slice(idx, idx + q.length) }));
          pos = idx + q.length;
          idx = lower.indexOf(q, pos);
        }
        txt.append(document.createTextNode(raw.slice(pos)));
      } else {
        txt.textContent = raw;
      }
      frag.append(row);
    });
    mount(list, frag);
    status.textContent = q ? `${matchIdx.length} match(es)` : `${cues.length} cues`;
  }

  const draw = debounce(() => { cursor = -1; drawCues(searchInput.value); }, 150);
  searchInput.addEventListener('input', draw);

  const normToggle = el('label', { style: 'display:flex;gap:.4rem;align-items:center;font-size:.85rem' }, [
    el('input', { type: 'checkbox' }),
    'Fix common umlaut mistakes (display only)',
  ]);
  (normToggle.querySelector('input') as HTMLInputElement).addEventListener('change', (e) => {
    showNorm = (e.target as HTMLInputElement).checked;
    drawCues(searchInput.value);
  });

  function jump(dir: 1 | -1): void {
    if (!matchIdx.length) return;
    cursor = (cursor + dir + matchIdx.length) % matchIdx.length;
    const i = matchIdx[cursor];
    document.getElementById(`cue-${i}`)?.scrollIntoView({ block: 'center' });
  }
  const prevBtn = el('button', { text: '← Prev match', type: 'button' });
  const nextBtn = el('button', { text: 'Next match →', type: 'button' });
  prevBtn.addEventListener('click', () => jump(-1));
  nextBtn.addEventListener('click', () => jump(1));

  const copyBtn = el('button', { text: 'Copy selected excerpt', type: 'button' });
  copyBtn.addEventListener('click', async () => {
    const sel = window.getSelection()?.toString() || '';
    if (!sel) { copyBtn.textContent = 'Select text first'; setTimeout(() => { copyBtn.textContent = 'Copy selected excerpt'; }, 1200); return; }
    try { await navigator.clipboard.writeText(sel); copyBtn.textContent = 'Copied'; } catch { copyBtn.textContent = 'Copy failed'; }
    setTimeout(() => { copyBtn.textContent = 'Copy selected excerpt'; }, 1200);
  });

  drawCues('');

  mount(c,
    pageHead(meta ? `${meta.lesson}` : file, meta ? `Week ${meta.weekNum} · ${meta.unit} · ${cues.length} cues` : file),
    notice('Auto-generated subtitles: mixed German–English, may contain errors and missing umlauts.'),
    el('div', { class: 'quicklinks' }, [
      el('a', { href: hrefFor('/transcripts', { week: meta ? String(meta.weekNum) : '' }), text: '← Transcript index' }),
      meta?.weekNum ? el('a', { href: hrefFor(`/week/${meta.weekNum}`), text: `Week ${meta.weekNum}` }) : null,
      meta?.remoteUrl ? el('a', { href: meta.remoteUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Source file' }) : null,
    ]),
    el('div', { class: 'filters', style: 'align-items:center' }, [
      el('label', {}, ['Search in transcript', searchInput]),
      prevBtn, nextBtn, copyBtn, status,
    ]),
    normToggle,
    el('p', { class: 'tiny', text: 'Click a timestamp to note the start time. Open the lesson video to follow along.' }),
    list,
  );
}
