import './styles.css';
import { route, setNotFound, startRouter, navigate, currentRoute } from './router';
import { initApi } from './api';
import { el, mount, pageHead, icon, breadcrumbs } from './ui';
import { initExamGoodLuckPopup } from './exam-good-luck-popup';

import { renderHome } from './pages/home';
import { renderWeeks, renderWeekDetail } from './pages/weeks';
import { renderTranscripts, renderTranscriptReader } from './pages/transcripts';
import { renderGrammar } from './pages/grammar';
import { renderVocabulary } from './pages/vocabulary';
import { renderQuestions } from './pages/questions';
import { renderImportant } from './pages/important';
import { renderMocks, renderMockTest } from './pages/mocks';
import { renderPlan } from './pages/plan';
import { renderEvidence } from './pages/evidence';
import { renderResources } from './pages/resources';
import { renderReader } from './pages/reader';
import { renderSearch } from './pages/search';
import { renderTools } from './pages/tools';
import { renderAbout } from './pages/about';

const app = document.getElementById('app')!;
const content = el('main', { class: 'content', id: 'main', tabindex: '-1' });

const NAV: { section?: string; items: { href: string; label: string; icon: string }[] }[] = [
  { items: [
    { href: '/', label: 'Home', icon: 'home' },
    { href: '/weeks', label: 'Weeks', icon: 'calendar' },
    { href: '/transcripts', label: 'Transcripts', icon: 'transcript' },
  ]},
  { section: 'Study', items: [
    { href: '/grammar', label: 'Grammar', icon: 'grammar' },
    { href: '/vocab', label: 'Vocabulary', icon: 'vocab' },
    { href: '/questions', label: 'Practice questions', icon: 'questions' },
    { href: '/important', label: 'Important questions', icon: 'star' },
  ]},
  { section: 'Exam prep', items: [
    { href: '/mocks', label: 'Mock tests', icon: 'mock' },
    { href: '/plan', label: 'Revision plan', icon: 'plan' },
  ]},
  { section: 'Library', items: [
    { href: '/resources', label: 'Study Resources', icon: 'resources' },
    { href: '/search', label: 'Search', icon: 'search' },
    { href: '/tools', label: 'Study tools', icon: 'tools' },
  ]},
  { section: 'Project', items: [
    { href: '/about', label: 'About', icon: 'info' },
  ]},
];

/** Breadcrumb trail for the current route path (shown in topbar). */
function crumbsFor(path: string): { label: string; href?: string }[] {
  const base = path.split('?')[0];
  const segs = base.split('/').filter(Boolean);
  if (segs.length === 0) return [{ label: 'Home' }];
  const leaf = segs[segs.length - 1];
  const pretty = leaf.replace(/[-_]/g, ' ');
  return [
    { label: 'Home', href: '/' },
    { label: pretty.charAt(0).toUpperCase() + pretty.slice(1) },
  ];
}

function buildShell(): void {
  // Skip-to-content link (first focusable element)
  const skip = el('a', { class: 'skip-link', href: '#main', text: 'Skip to main content' });

  const sidebar = el('aside', { class: 'sidebar', id: 'sidebar' });

sidebar.append(el('div', { class: 'brand' }, [
  'German I : Study Desk',
  el('small', { text: 'Not an official NPTEL site' }),
  el('small', {}, [
    'Created by ',
    el('a', {
      href: 'https://jayeshjadhav.com',
      target: '_blank',
      rel: 'noopener noreferrer',
      text: 'jayeshjadhav.com',
      style: 'color: #fff;'
    })
  ]),
]));
  const nav = el('nav');
  for (const group of NAV) {
    if (group.section) {
      const section = el('div', { class: 'nav-section', text: group.section });
      nav.append(section);
    }
    for (const item of group.items) {
      const a = el('a', { href: `#${item.href}`, 'data-nav': item.href });
      a.append(icon({ name: item.icon }), item.label);
      nav.append(a);
    }
  }
  sidebar.append(nav);

  const searchInput = el('input', {
    type: 'search',
    id: 'global-search',
    placeholder: 'Search lessons, questions, vocabulary, resources…',
    'aria-label': 'Global search',
  }) as HTMLInputElement;
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = searchInput.value.trim();
      navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
    }
  });

  const menuBtn = el('button', { class: 'menu-btn', 'aria-label': 'Toggle navigation' });
  menuBtn.append(icon({ name: 'menu' }));
  menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));

  const crumbSlot = el('div', { class: 'crumb-slot', id: 'crumb-slot' });

  const visitorIndicator = el('div', { class: 'topbar-actions' }, [
    el('div', { class: 'visitor-indicator' }, [
      el('span', { class: 'visitor-dot', 'aria-hidden': 'true' }),
      el('span', { class: 'visitor-count', id: 'visitor-count', text: '0 views' })
    ])
  ]);

  const topbar = el('header', { class: 'topbar' }, [
    menuBtn,
    el('div', { class: 'search-box' }, [searchInput]),
    crumbSlot,
    visitorIndicator,
  ]);

  const footer = el('footer', { class: 'footer-note' }, [
    el('div', { class: 'footer-credit' }, [
      'Designed & built by ',
      el('a', {
        href: 'https://jayeshjadhav.com',
        target: '_blank',
        rel: 'noopener noreferrer',
        text: 'Jayesh Jadhav',
      }),
      ' · ',
      el('a', { href: '#/about', text: 'About this project' }),
    ]),
    el('div', { class: 'footer-caveats' }, [
      'Personal study tool. Not an official NPTEL website. ',
      'Check the latest official course notice for exam dates and scoring. ',
      'Progress is saved in this browser only.',
    ]),
  ]);

  // Back-to-top button (single shared instance, shown/hidden per page)
  const toTop = el('button', {
    class: 'to-top',
    'aria-label': 'Back to top',
    type: 'button',
  });
  toTop.append(icon({ name: 'arrowUp' }));
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  const main = el('div', { class: 'main' }, [topbar, content, footer, toTop]);

  mount(app, skip, el('div', { class: 'shell' }, [sidebar, main]));

  // Show/hide back-to-top based on scroll
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      toTop.classList.toggle('visible', window.scrollY > 400);
      ticking = false;
    });
  }, { passive: true });
}

/**
 * Match a nav href against the current path.
 * - Exact match for '/' (home only)
 * - Otherwise match by the longest shared segment prefix
 *   (so /week/3 matches /weeks → no; /week/3 matches /week → yes)
 */
function isNavActive(href: string, path: string): boolean {
  if (href === '/') return path === '/';
  const a = href.split('/').filter(Boolean);
  const b = path.split('/').filter(Boolean);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return false;
  }
  // href must equal the longest matching path segment (not just start-with anything)
  return a.length <= b.length;
}

function setActiveNav(): void {
  const path = currentRoute().path;
  document.querySelectorAll<HTMLAnchorElement>('a[data-nav]').forEach((a) => {
    const href = a.getAttribute('data-nav') || '';
    a.classList.toggle('active', isNavActive(href, path));
  });
}

/** Human-readable per-route title suffix; falls back to a title-cased path leaf. */
const ROUTE_TITLES: Record<string, string> = {
  '/': 'Home',
  '/weeks': 'Weeks',
  '/week': 'Week detail',
  '/transcripts': 'Transcripts',
  '/transcript': 'Transcript reader',
  '/grammar': 'Grammar',
  '/vocab': 'Vocabulary',
  '/questions': 'Practice questions',
  '/important': 'Important questions',
  '/mocks': 'Mock tests',
  '/mock': 'Mock test',
  '/plan': 'Revision plan',
  '/evidence': 'Data notes',
  '/resources': 'Study Resources',
  '/reader': 'Documents',
  '/search': 'Search',
  '/tools': 'Study tools',
  '/about': 'About',
};

const SITE_TITLE = 'German I Study Desk | Jayesh Jadhav';

function setTitle(path: string): void {
  const base = path.split('?')[0];
  const segs = base.split('/').filter(Boolean);
  let suffix: string;
  if (segs.length === 0) suffix = 'Home';
  else {
    const root = `/${segs[0]}`;
    if (ROUTE_TITLES[root]) suffix = ROUTE_TITLES[root];
    else {
      const leaf = segs[segs.length - 1].replace(/[-_]/g, ' ');
      suffix = leaf.charAt(0).toUpperCase() + leaf.slice(1);
    }
  }
  document.title = suffix === 'Home' ? SITE_TITLE : `${suffix} · ${SITE_TITLE}`;
}

function guard(page: (c: HTMLElement) => Promise<void> | void) {
  return async () => {
    const sidebar = document.getElementById('sidebar');
    sidebar?.classList.remove('open');
    setActiveNav();
    setTitle(currentRoute().path);
    const slot = document.getElementById('crumb-slot');
    if (slot) mount(slot, breadcrumbs(crumbsFor(currentRoute().path)));
    content.setAttribute('tabindex', '-1');
    try {
      await page(content);
    } catch (e) {
      mount(content, pageHead('Something went wrong'), el('div', { class: 'error-box', text: String(e) }));
    }
    window.scrollTo({ top: 0 });
  };
}

route('/', guard(renderHome));
route('/weeks', guard(renderWeeks));
route('/week/:n', guard(renderWeekDetail));
route('/transcripts', guard(renderTranscripts));
route('/transcript', guard(renderTranscriptReader));
route('/grammar', guard(renderGrammar));
route('/vocab', guard(renderVocabulary));
route('/questions', guard(renderQuestions));
route('/important', guard(renderImportant));
route('/mocks', guard(renderMocks));
route('/mock/:n', guard(renderMockTest));
route('/plan', guard(renderPlan));
route('/evidence', guard(renderEvidence));
route('/resources', guard(renderResources));
route('/reader', guard(renderReader));
route('/reader/*', guard(renderReader));
route('/search', guard(renderSearch));
route('/tools', guard(renderTools));
route('/about', guard(renderAbout));

setNotFound(() => {
  const slot = document.getElementById('crumb-slot');
  if (slot) mount(slot, breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Page not found' }]));
  document.title = `Page not found · ${SITE_TITLE}`;
  mount(content,
    pageHead('Page not found'),
    el('p', { class: 'lead', text: 'This page does not exist.' }),
    el('a', { href: '#/', text: 'Back to home' }),
  );
});

buildShell();

async function boot(): Promise<void> {
  await initApi();
  startRouter();


  initExamGoodLuckPopup();

  import('./visitor-client').then(({ initVisitorCounter }) => {
    initVisitorCounter().catch((err) => console.warn('[visitor-counter]', err));
  });
}
void boot();
