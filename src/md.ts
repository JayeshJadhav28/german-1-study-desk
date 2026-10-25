/** Safe Markdown rendering: marked + DOMPurify + link rewriting. */
import { marked } from 'marked';
import type { Tokens, Token } from 'marked';
import DOMPurify from 'dompurify';
import { hrefFor } from './router';

marked.setOptions({ gfm: true, breaks: false });

const UNSAFE_SCHEME = /^\s*(javascript|data|vbscript|file|blob|about):/i;
const WIN_PATH = /^[a-zA-Z]:[\\/]/;

function rewriteHref(href: string, currentMdId: string): string | null {
  const h = String(href || '').trim();
  if (!h || h.startsWith('#')) return h || null;
  if (UNSAFE_SCHEME.test(h) || WIN_PATH.test(h) || h.startsWith('\\\\')) return null;
  if (/^https?:\/\//i.test(h) || h.startsWith('//')) {
    const url = h.startsWith('//') ? `https:${h}` : h;
    return url;
  }
  // relative link → resolve against current file dir, map to reader route if inside approved copies
  const currentDir = currentMdId.split('/').slice(0, -1).join('/');
  const resolved = new URL(h.replace(/[#?].*$/, ''), `file:///${currentDir}/`).pathname.replace(/^\//, '');
  if (/\.md$/i.test(resolved)) return hrefFor(`/reader/${resolved.split('/').map(encodeURIComponent).join('/')}`);
  return null; // non-md relative target: not linkable in-app
}

export interface RenderedMd {
  html: string;
  toc: { id: string; text: string; level: number }[];
}

function slug(text: string, used: Map<string, number>): string {
  // keep unicode letters (umlauts)
  const base = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'section';
  const n = used.get(base) || 0;
  used.set(base, n + 1);
  return n === 0 ? base : `${base}-${n}`;
}

export function renderMarkdown(mdText: string, opts: { mdId?: string } = {}): RenderedMd {
  const mdId = opts.mdId || '';
  const usedSlugs = new Map<string, number>();
  const toc: RenderedMd['toc'] = [];

  const renderer = new marked.Renderer();
  // marked v15 object-token renderer API
  renderer.heading = function heading(this: { parser: { parseInline(t: Token[]): string } }, token: Tokens.Heading) {
    const html = this.parser.parseInline(token.tokens ?? []) as string;
    const plain = String(html).replace(/<[^>]*>/g, '');
    const id = slug(plain, usedSlugs);
    toc.push({ id, text: plain, level: token.depth });
    return `<h${token.depth} id="${id}">${html}</h${token.depth}>`;
  };
  renderer.link = function link(this: { parser: { parseInline(t: Token[]): string } }, token: Tokens.Link) {
    const text = this.parser.parseInline(token.tokens ?? []) as string;
    const safe = rewriteHref(token.href, mdId);
    if (safe === null) return `<span class="link-blocked" title="Unsafe or non-navigable link removed">${text}</span>`;
    if (/^https?:/i.test(safe)) {
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer"${token.title ? ` title="${token.title}"` : ''}>${text}</a>`;
    }
    return `<a href="${safe}"${token.title ? ` title="${token.title}"` : ''}>${text}</a>`;
  };

  const rawHtml = marked.parse(mdText, { renderer, async: false }) as string;

  const clean = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel', 'href', 'id', 'class'],
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'style'],
  });

  // Enforce external anchors open safely (post-sanitize pass)
  const div = document.createElement('div');
  div.innerHTML = clean;
  div.querySelectorAll('table').forEach((table) => {
    const wrap = document.createElement('div');
    wrap.className = 'md-table-wrap';
    table.parentNode?.insertBefore(wrap, table);
    wrap.appendChild(table);
  });
  div.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (UNSAFE_SCHEME.test(href) || WIN_PATH.test(href)) {
      a.removeAttribute('href');
      a.classList.add('link-blocked');
    } else if (/^https?:/i.test(href)) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });

  return { html: div.innerHTML, toc };
}

export function plainFromMd(mdText: string): string {
  return mdText
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/[#*_>~\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
