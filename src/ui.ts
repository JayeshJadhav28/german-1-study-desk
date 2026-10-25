/** Tiny DOM helpers. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | number | undefined> = {},
  children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function mount(container: HTMLElement, ...children: (Node | string | null | undefined)[]): void {
  clear(container);
  for (const c of children) {
    if (c === null || c === undefined) continue;
    container.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

export function badge(text: string, kind: '' | 'good' | 'warn' | 'bad' | 'accent' = ''): HTMLElement {
  return el('span', { class: `badge ${kind}`.trim(), text });
}

export function notice(text: string, kind: '' | 'bad' | 'good' = ''): HTMLElement {
  return el('div', { class: `notice ${kind}`.trim(), text });
}

export function card(num: string | number, lbl: string): HTMLElement {
  return el('div', { class: 'card' }, [el('div', { class: 'num', text: String(num) }), el('div', { class: 'lbl', text: lbl })]);
}

export function pageHead(title: string, lead?: string): HTMLElement {
  return el('div', {}, [el('h1', { text: title }), lead ? el('p', { class: 'lead', text: lead }) : null]);
}

export function errBox(message: string): HTMLElement {
  return el('div', { class: 'error-box', role: 'alert', text: message });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout> | undefined;
  return ((...args: never[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function fmtSec(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/* ---------- Phase 1 additions ---------- */

/**
 * Inline SVG icon. Returns an <svg> element with aria-hidden by default
 * (icons are decorative when paired with text labels).
 * Icons are 16px by default, stroke-based, currentColor.
 */
const ICON_PATHS: Record<string, string> = {
  // Navigation / structure
  home:        '<path d="M3 9l5-5 5 5v9a1 1 0 0 1-1 1h-2v-5H7v5H5a1 1 0 0 1-1-1z"/>',
  calendar:    '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="M3 9h14M7 3v4M13 3v4"/>',
  transcript:  '<path d="M4 5h12v10H4z"/><path d="M7 9h6M7 12h4M7 14h3"/>',
  grammar:     '<path d="M4 4h10M4 8h10M4 12h7M4 16h9"/><circle cx="16" cy="14" r="2"/>',
  vocab:       '<path d="M4 5a2 2 0 0 1 2-2h6l4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M12 3v5h4"/>',
  questions:   '<path d="M4 5h13v10H4z"/><path d="M7 9h7M7 12h5M7 15h4"/>',
  star:        '<path d="M10 2l2.5 5 5.5.8-4 3.9.9 5.5L10 14.8 5.1 17.2l.9-5.5-4-3.9 5.5-.8z"/>',
  mock:        '<path d="M5 4h10v12H5z"/><path d="M8 7h4M8 10h4M8 13h2"/>',
  plan:        '<path d="M4 6h12M4 10h12M4 14h8"/><circle cx="18" cy="6" r="1.5"/><circle cx="16" cy="10" r="1.5"/><circle cx="14" cy="14" r="1.5"/>',
  heart:       '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>',
  evidence:    '<circle cx="8" cy="8" r="4"/><path d="M11 11l5 5"/>',
  resources:   '<path d="M4 5a2 2 0 0 1 2-2h4l4 4h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
  reader:      '<path d="M3 5h6v12H3zM11 5h6v12h-6z"/>',
  search:      '<circle cx="8" cy="8" r="4"/><path d="M11 11l5 5"/>',
  tools:       '<path d="M14 4l2 2-8 8H6v-2z"/><path d="M12 6l2 2"/>',
  // Status / actions
  check:       '<path d="M4 9l4 4 8-8"/>',
  cross:       '<path d="M5 5l10 10M15 5L5 15"/>',
  warn:        '<path d="M10 3l8 14H2z"/><path d="M10 9v4M10 15v.5"/>',
  info:        '<circle cx="10" cy="10" r="7"/><path d="M10 9v4M10 6v.5"/>',
  arrowUp:     '<path d="M5 12l5-5 5 5"/>',
  menu:        '<path d="M3 6h14M3 10h14M3 14h14"/>',
  close:       '<path d="M5 5l10 10M15 5L5 15"/>',
  chevronRight:'<path d="M7 4l6 6-6 6"/>',
  chevronDown: '<path d="M4 7l6 6 6-6"/>',
  play:        '<path d="M6 4v12l10-6z"/>',
  pause:       '<path d="M6 4h4v12H6zM14 4h4v12h-4z"/>',
};

export interface IconOpts {
  name: keyof typeof ICON_PATHS | string;
  size?: number;
  label?: string; // if provided, becomes aria-label instead of aria-hidden
}

export function icon(opts: IconOpts): SVGElement {
  const path = ICON_PATHS[opts.name];
  const size = opts.size ?? 16;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGElement;
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', 'icon');
  if (opts.label) svg.setAttribute('aria-label', opts.label);
  else svg.setAttribute('aria-hidden', 'true');
  if (path) svg.innerHTML = path;
  return svg;
}

/** Render an icon next to a text label, e.g. iconSpan('home', 'Home'). */
export function iconSpan(name: string, label: string): HTMLElement {
  return el('span', { class: 'ic' }, [icon({ name }), label]);
}

/**
 * Breadcrumb trail. Last item is current page (rendered as <span>, not <a>).
 * Returns null if `trail` has fewer than 2 items (no breadcrumb needed).
 */
export interface Crumb { label: string; href?: string; }

export function breadcrumbs(trail: Crumb[]): HTMLElement | null {
  if (!trail || trail.length < 2) return null;
  const nav = el('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' });
  const ol = el('ol');
  trail.forEach((c, i) => {
    const isLast = i === trail.length - 1;
    const li = el('li');
    if (c.href && !isLast) {
      li.append(el('a', { href: `#${c.href}`, text: c.label }));
      li.append(icon({ name: 'chevronRight', size: 12 }));
    } else {
      const span = el('span', { text: c.label });
      if (isLast) span.setAttribute('aria-current', 'page');
      li.append(span);
    }
    ol.append(li);
  });
  nav.append(ol);
  return nav;
}

/* ---------- Public-edition content gating ---------- */

/**
 * Friendly, informative panel explaining that a page's richer content is not
 * published in the public edition, and why. Never a dead end: it always lists
 * what the visitor *can* reach and the reason for the omission (content rights).
 *
 * This is distinct from an error — the public site is complete for what it
 * publishes; the excluded material simply cannot be redistributed.
 */
export interface GateOption {
  title: string;          // e.g. "Practice questions"
  reason: string;         // short, plain-language why
  alternatives?: Crumb[]; // links the visitor can follow right now
}

export function contentGate(opt: GateOption): HTMLElement {
  const alts = (opt.alternatives ?? []).filter((a) => a.href);
  return el('div', { class: 'content-gate', role: 'note' }, [
    el('div', { class: 'gate-head' }, [
      icon({ name: 'info', size: 18, label: 'Information' }),
      el('h2', { text: `${opt.title} — not in the public edition` }),
    ]),
    el('p', { text: opt.reason }),
    el('p', { class: 'muted', text: 'This page belongs to the richer local edition. The public edition shares only material whose redistribution rights are confirmed.' }),
    alts.length
      ? el('div', { class: 'gate-alts' }, [
          el('strong', { text: 'Available right now:' }),
          el('div', { class: 'quicklinks' }, alts.map((a) =>
            el('a', { href: `#${a.href}`, text: a.label }))),
        ])
      : null,
    el('p', { class: 'tiny', text: 'If you have a local copy of the full study desk, this page is available there.' }),
  ]);
}
