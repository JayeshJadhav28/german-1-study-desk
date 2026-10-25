import { api, isLocalEdition, type MarkdownIndex, type MdIndexEntry } from '../api';
import { actions } from '../store';
import { el, mount, pageHead, notice, badge, debounce, breadcrumbs, icon, iconSpan, contentGate } from '../ui';
import { hrefFor, currentRoute, routeToken } from '../router';
import { renderMarkdown } from '../md';

/**
 * Wire the reader progress bar and TOC scroll-spy into a rendered reader DOM.
 * Pass the content root (`.content` element) and the rendered toc nav.
 */
function wireReaderChrome(c: HTMLElement, tocNav: HTMLElement): () => void {
  // ---- Progress bar ----
  let progress = document.getElementById('reader-progress');
  if (!progress) {
    progress = document.createElement('div');
    progress.id = 'reader-progress';
    progress.className = 'reader-progress';
    progress.innerHTML = '<span></span>';
    document.body.appendChild(progress);
  }
  const progressFill = progress.firstElementChild as HTMLElement;

  const onScroll = () => {
    const docEl = document.documentElement;
    const scrollTop = window.scrollY || docEl.scrollTop;
    const max = (docEl.scrollHeight - window.innerHeight) || 1;
    const pct = Math.min(100, Math.max(0, (scrollTop / max) * 100));
    progressFill.style.width = `${pct.toFixed(2)}%`;
    progress.classList.toggle('active', scrollTop > 60);
  };

  // ---- TOC scroll-spy ----
  const tocLinks = Array.from(tocNav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
  const headings: { id: string; el: HTMLElement }[] = [];
  const body = c.querySelector('.md-body');
  if (body) {
    body.querySelectorAll<HTMLElement>('h1, h2, h3').forEach((h) => {
      if (h.id) headings.push({ id: h.id, el: h });
    });
  }
  const linkById = new Map<string, HTMLAnchorElement>();
  tocLinks.forEach((a) => {
    const id = a.getAttribute('href')!.slice(1);
    linkById.set(id, a);
  });

  let spyTicking = false;
  const onSpy = () => {
    if (spyTicking) return;
    spyTicking = true;
    requestAnimationFrame(() => {
      const threshold = window.scrollY + 120;
      let currentId: string | null = null;
      for (const h of headings) {
        if (h.el.offsetTop <= threshold) currentId = h.id;
        else break;
      }
      tocLinks.forEach((a) => a.classList.remove('active'));
      if (currentId && linkById.has(currentId)) {
        linkById.get(currentId)!.classList.add('active');
      }
      spyTicking = false;
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('scroll', onSpy, { passive: true });
  // initial paint
  onScroll();
  onSpy();

  return () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('scroll', onSpy);
    if (progress && progress.parentNode) progress.parentNode.removeChild(progress);
  };
}

/**
 * Find-in-document: highlights matches by wrapping them in <mark> within a copy
 * of the rendered HTML, while leaving the underlying DOM readable for screen
 * readers (text content unchanged, marks are presentational).
 */
function highlightInBody(body: HTMLElement, term: string): number {
  // Remove old marks
  body.querySelectorAll('mark.find-hit').forEach((m) => {
    const txt = document.createTextNode(m.textContent || '');
    m.parentNode!.replaceChild(txt, m);
  });
  body.normalize();

  if (!term) return 0;
  const lower = term.toLowerCase();
  let count = 0;

  // Walk text nodes only (never modify structure)
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const p = n.parentNode as HTMLElement | null;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CODE' && p.parentElement?.tagName !== 'PRE') {
        // Allow code in pre, skip standalone code to keep it readable
      }
      return n.nodeValue && n.nodeValue.toLowerCase().includes(lower)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const targets: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) targets.push(n as Text);

  for (const node of targets) {
    const text = node.nodeValue || '';
    const lc = text.toLowerCase();
    const frag = document.createDocumentFragment();
    let i = 0;
    let pos = lc.indexOf(lower, i);
    let made = 0;
    while (pos !== -1) {
      if (pos > i) frag.appendChild(document.createTextNode(text.slice(i, pos)));
      const m = document.createElement('mark');
      m.className = 'find-hit';
      m.textContent = text.slice(pos, pos + term.length);
      frag.appendChild(m);
      made++;
      i = pos + term.length;
      pos = lc.indexOf(lower, i);
    }
    if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
    if (made > 0) {
      count += made;
      node.parentNode!.replaceChild(frag, node);
    }
  }
  return count;
}

export async function renderReader(c: HTMLElement): Promise<void> {
  const tok = routeToken();
  const params = currentRoute().params || {};
  const q = currentRoute().query;
  // Route forms:
  //  #/reader/<path...>  (catch-all)
  //  #/reader?file=...
  let id = params['*'] || '';
  if (!id) {
    const f = q.get('file') || '';
    id = f;
  }

  // Breadcrumb always: Home › Reader (› doc title when applicable)
  const crumbHost = document.getElementById('crumb-slot');

  if (!isLocalEdition()) {
    if (crumbHost) mount(crumbHost, breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Reader' }])!);
    mount(c, contentGate({
      title: 'Study reader',
      reason: 'The documents include the course and analysis materials, which the public edition does not republish.',
      alternatives: [
        { label: 'Weeks & syllabus', href: '/weeks' },
        { label: 'Study Resources', href: '/resources' },
        { label: 'Revision plan', href: '/plan' },
      ],
    }));
    return;
  }

  if (!id) {
    // library index
    mount(c, el('div', { class: 'skeleton' }));
    if (crumbHost) mount(crumbHost,
      breadcrumbs([
        { label: 'Home', href: '/' },
        { label: 'Reader' },
      ])!,
    );
    const index = await api.markdownIndex();
    if (routeToken() !== tok) return;
    drawIndex(c, index);
    return;
  }

  mount(c, el('div', { class: 'skeleton' }));
  let text: string;
  try {
    text = await api.markdownText(id);
  } catch {
    if (routeToken() !== tok) return;
    mount(c,
      pageHead('Source not found'),
      el('div', { class: 'error-box', text: `The Markdown copy “${id}” is not present under public/data/markdown/. Re-run npm run import-data.` }),
      el('a', { href: hrefFor('/reader'), text: 'Back to document library' }),
    );
    return;
  }
  if (routeToken() !== tok) return;

  const metaEntry = (await api.markdownIndex()).files.find((f) => f.id === id) || null;
  if (routeToken() !== tok) return;
  const rendered = renderMarkdown(text, { mdId: id });
  const lineParam = q.get('line');

  if (crumbHost) {
    const docLabel = metaEntry?.title || id.split('/').pop() || 'Reader';
    mount(crumbHost,
      breadcrumbs([
        { label: 'Home', href: '/' },
        { label: 'Reader', href: '/reader' },
        { label: docLabel },
      ])!,
    );
  }

  const toc = el('nav', { class: 'toc', 'aria-label': 'Document outline' }, rendered.toc.slice(0, 120).map((h) =>
    el('a', { href: `#${h.id}`, class: `lvl${h.level}`, text: h.text })));

  // Find input — now actually highlights matches
  const searchInput = el('input', {
    type: 'search',
    placeholder: 'Find in document…',
    'aria-label': 'Find in document',
  }) as HTMLInputElement;
  const findStatus = el('span', { class: 'muted' });
  const prevBtn = el('button', { type: 'button', class: 'ghost', 'aria-label': 'Previous match' });
  prevBtn.append(icon({ name: 'chevronDown' }), 'Prev');
  const nextBtn = el('button', { type: 'button', class: 'ghost', 'aria-label': 'Next match' });
  nextBtn.append(icon({ name: 'chevronRight' }), 'Next');
  prevBtn.disabled = true;
  nextBtn.disabled = true;

  let matches: HTMLElement[] = [];
  let matchIdx = 0;

  function jumpToMatch(i: number): void {
    if (!matches.length) return;
    matchIdx = ((i % matches.length) + matches.length) % matches.length;
    matches.forEach((m, idx) => m.classList.toggle('find-current', idx === matchIdx));
    matches[matchIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    findStatus.textContent = `${matchIdx + 1} of ${matches.length}`;
  }

  const applyFind = debounce(() => {
    const term = searchInput.value.trim();
    const body = c.querySelector('.md-body');
    if (!body) return;
    if (!term) {
      matches = [];
      matchIdx = 0;
      findStatus.textContent = '';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      // re-clear any stale marks
      highlightInBody(body as HTMLElement, '');
      return;
    }
    highlightInBody(body as HTMLElement, term);
    matches = Array.from(body.querySelectorAll<HTMLElement>('mark.find-hit'));
    matchIdx = 0;
    if (matches.length) {
      matches[0].classList.add('find-current');
      matches[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      findStatus.textContent = `1 of ${matches.length}`;
      prevBtn.disabled = false;
      nextBtn.disabled = false;
    } else {
      findStatus.textContent = '0 hits';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
    }
  }, 180);

  searchInput.addEventListener('input', applyFind);
  prevBtn.addEventListener('click', () => jumpToMatch(matchIdx - 1));
  nextBtn.addEventListener('click', () => jumpToMatch(matchIdx + 1));

  mount(c,
    pageHead(metaEntry?.title || id.split('/').pop() || 'Reader',
      `${id}${metaEntry ? ` · ${(metaEntry.byteSize / 1024).toFixed(1)} KB · ${metaEntry.provenance}` : ''}`),
    metaEntry?.weekNum ? el('p', {}, [badge(`Week ${metaEntry.weekNum}`, 'accent')]) : null,
    lineParam ? notice(`Cited at source line ${lineParam} in the original file (line numbers preserved through import).`) : null,
    el('div', { class: 'quicklinks' }, [
      el('a', { href: hrefFor('/reader'), text: '← All documents' }),
      el('a', { href: hrefFor('/evidence'), text: 'Data notes' }),
      el('a', { href: hrefFor('/resources'), text: 'Study Resources' }),
    ]),
    el('div', { class: 'filters' }, [
      el('label', { class: 'grow' }, [iconSpan('search', 'Find'), searchInput]),
      el('label', {}, ['', findStatus]),
      el('label', {}, ['', prevBtn]),
      el('label', {}, ['', nextBtn]),
    ]),
    el('div', { class: 'reader-wrap' }, [toc, el('div', { class: 'md-body', html: rendered.html })]),
  );

  // Wire progress bar + scroll-spy
  wireReaderChrome(c, toc);

  if (metaEntry?.weekNum) actions.markWeekVisited(metaEntry.weekNum);
  actions.setLastVisited(`/reader/${id.split('/').map(encodeURIComponent).join('/')}`, id.split('/').pop() || 'Reader');
}

function drawIndex(c: HTMLElement, index: MarkdownIndex): void {
  const search = el('input', { type: 'search', placeholder: 'Filter documents…', 'aria-label': 'Filter documents' }) as HTMLInputElement;
  const provSel = el('select', {}, [
    el('option', { value: '', text: 'Both folders' }),
    el('option', { value: 'course-corpus', text: 'Course materials' }),
    el('option', { value: 'exam-prep-analysis', text: 'Study guide' }),
  ]) as HTMLSelectElement;
  const listHost = el('div');

  function draw(): void {
    const term = search.value.trim().toLowerCase();
    const files = index.files.filter((f: MdIndexEntry) => {
      if (provSel.value && f.provenance !== provSel.value) return false;
      if (term && !f.id.toLowerCase().includes(term) && !f.title.toLowerCase().includes(term)) return false;
      return true;
    });
    if (files.length === 0) {
      mount(listHost, el('div', { class: 'empty' }, [
        el('div', {}, [icon({ name: 'search', size: 24 })]),
        el('div', { text: 'No documents match this filter.' }),
      ]));
      return;
    }
    mount(listHost, el('div', { class: 'table-wrap' }, [
      el('table', { class: 'data' }, [
        el('thead', {}, [el('tr', {}, ['Title', 'Path', 'Week', 'Size', ''].map((h) => el('th', { text: h })))]),
        el('tbody', {}, files.slice(0, 250).map((f: MdIndexEntry) => el('tr', {}, [
          el('td', { text: f.title }),
          el('td', { class: 'tiny', text: f.id }),
          el('td', { text: f.weekNum ? String(f.weekNum) : '—' }),
          el('td', { text: `${(f.byteSize / 1024).toFixed(0)} KB` }),
          el('td', {}, [el('a', {
            href: hrefFor(`/reader/${f.id.split('/').map(encodeURIComponent).join('/')}`),
            text: 'Read →',
          })]),
        ]))),
      ]),
    ]));
  }
  search.addEventListener('input', draw);
  provSel.addEventListener('change', draw);
  draw();

  mount(c,
    pageHead('Documents', `${index.files.length} study documents. Opened safely in your browser.`),
    notice('Paths inside documents are shown as plain text, never as file links.'),
    el('div', { class: 'filters' }, [
      el('label', {}, [iconSpan('search', 'Search'), search]),
      el('label', {}, ['Folder', provSel]),
    ]),
    listHost,
  );
}
