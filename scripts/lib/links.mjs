/**
 * Markdown link extraction for the Study Resources catalog.
 * Supports: inline links, reference-style links (defs + usages), HTML anchors,
 * bare http(s) URLs, and relative links. Preserves URLs exactly (including
 * query strings). Records unsafe schemes instead of emitting them as links.
 */

const INLINE_MD_RE = /\[([^\]]*)\]\(\s*([^()\s]+(?:\([^()\s]*\)[^()\s]*)*)\s*\)/g;
const HTML_A_RE = /<a\s+[^>]*?href\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
const REF_DEF_RE = /^\s{0,3}\[([^\]]+)\]:\s*(\S+)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/;
const REF_USE_RE = /\[([^\]]*)\]\[([^\]]*)\]/g;
const BARE_URL_RE = /https?:\/\/[^\s<>"'`]+/g;

const UNSAFE_SCHEME_RE = /^(javascript|data|vbscript|file|blob|about):/i;
const EXTERNAL_SCHEME_RE = /^https?:\/\//i;
const WINDOWS_ABS_RE = /^[a-zA-Z]:[\\/]/;
const UNC_ABS_RE = /^\\\\/;

const TRAILING_PUNCT_RE = /[.,;:!?"'\u201d\u2019\]]+$/;

export function decodeHtmlEntities(s) {
  return String(s ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'");
}

export function stripTrailingPunct(url) {
  let u = String(url);
  // Keep trailing ) only if balanced (e.g. Wikipedia-style), else trim punctuation
  while (TRAILING_PUNCT_RE.test(u) && !/\.pdf$/i.test(u)) {
    const last = u[u.length - 1];
    if (last === ')') {
      const opens = (u.match(/\(/g) || []).length;
      const closes = (u.match(/\)/g) || []).length;
      if (closes <= opens) break;
    }
    u = u.slice(0, -1);
  }
  return u;
}

export function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function makeContext(line, maskStart, maskLen, label) {
  const raw = String(line);
  const before = raw.slice(0, maskStart);
  const after = raw.slice(maskStart + maskLen);
  const masked = `${before}[${label || 'link'}]${after}`.replace(/\s+/g, ' ').trim();
  return masked.length > 170 ? `${masked.slice(0, 167)}…` : masked;
}

function placeholder() { return '\u0000LINK\u0000'; }

/**
 * Extract link occurrences from one Markdown file's text.
 * @param {string} text
 * @param {{ fileRelPath?: string }} [opts]
 */
export function extractFromMarkdown(text, opts = {}) {
  const source = String(text ?? '');
  const lines = source.split(/\r?\n/);
  const fileRelPath = opts.fileRelPath || '';

  const refDefs = new Map(); // id(lower) -> { url, line, title, used }
  const occurrences = [];
  const skipped = [];

  // Pass 0: collect reference definitions (case-insensitive ids per CommonMark)
  lines.forEach((line, idx) => {
    const m = REF_DEF_RE.exec(line);
    if (m) {
      const id = m[1].trim().toLowerCase();
      const url = decodeHtmlEntities(m[2]);
      refDefs.set(id, { url, line: idx + 1, title: m[3] || m[4] || m[5] || '', used: false, rawLine: line });
    }
  });

  let inFence = false;
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    // Skip fenced code blocks (``` toggles) — preserve line numbering
    if (/^\s{0,3}```/.test(line) || /^\s{0,3}~~~/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    // Reference definitions are handled in the dedicated pass — do not
    // double-count their URLs as bare-url occurrences.
    if (REF_DEF_RE.test(line)) return;
    let work = line;
    // Mask inline code spans so pseudo-links inside backticks are not extracted
    work = work.replace(/`[^`]*`/g, placeholder());
    const push = (entry) => {
      occurrences.push({ fileRelPath, line: lineNo, ...entry });
    };
    const pushSkipped = (reason, detail) => {
      skipped.push({ fileRelPath, line: lineNo, reason, detail: String(detail).slice(0, 200) });
    };

    const classify = (rawUrl, label, method, maskStart, maskLen) => {
      const url = decodeHtmlEntities(String(rawUrl).trim());
      if (!url) return;
      if (UNSAFE_SCHEME_RE.test(url)) {
        pushSkipped('unsafe-scheme', url);
        return;
      }
      if (WINDOWS_ABS_RE.test(url) || UNC_ABS_RE.test(url)) {
        pushSkipped('windows-absolute-path', url);
        return;
      }
      if (url.startsWith('#')) {
        // in-document anchor — not a study resource link
        return;
      }
      if (EXTERNAL_SCHEME_RE.test(url)) {
        push({
          label: decodeHtmlEntities(String(label || '').replace(/\s+/g, ' ').trim()),
          url,
          linkKind: 'external',
          method,
          context: makeContext(line, maskStart, maskLen, label),
        });
        return;
      }
      // protocol-relative
      if (url.startsWith('//')) {
        push({
          label: decodeHtmlEntities(String(label || '').replace(/\s+/g, ' ').trim()),
          url: `https:${url}`,
          linkKind: 'external',
          method,
          context: makeContext(line, maskStart, maskLen, label),
        });
        return;
      }
      // relative / local path
      push({
        label: decodeHtmlEntities(String(label || '').replace(/\s+/g, ' ').trim()),
        url,
        linkKind: 'relative',
        method,
        context: makeContext(line, maskStart, maskLen, label),
      });
    };

    // 1) HTML anchors
    work = work.replace(HTML_A_RE, (full, _q, dq, sq, innerText) => {
      const href = dq != null ? dq : sq;
      const start = work.indexOf(full);
      classify(href, String(innerText).replace(/<[^>]*>/g, ''), 'html-anchor', start >= 0 ? start : 0, full.length);
      return placeholder();
    });

    // 2) Inline markdown links
    work = work.replace(INLINE_MD_RE, (full, label, url) => {
      const start = work.indexOf(full);
      classify(url, label, 'inline-markdown', start >= 0 ? start : 0, full.length);
      return placeholder();
    });

    // 3) Reference-style usages [label][id] / collapsed [label][]
    work = work.replace(REF_USE_RE, (full, label, idRaw) => {
      const id = (idRaw || label).trim().toLowerCase();
      const def = refDefs.get(id);
      if (def) {
        def.used = true;
        const start = work.indexOf(full);
        classify(def.url, label || def.title || id, 'reference-link', start >= 0 ? start : 0, full.length);
      } else {
        // reference without definition — not a URL; ignore silently (not a link)
      }
      return placeholder();
    });

    // 4) Bare URLs in whatever remains
    let m;
    BARE_URL_RE.lastIndex = 0;
    while ((m = BARE_URL_RE.exec(work)) !== null) {
      const raw = stripTrailingPunct(m[0]);
      classify(raw, raw, 'bare-url', m.index, raw.length);
    }
  });

  // Unused reference definitions still carry a URL — record them
  for (const def of refDefs.values()) {
    if (def.used) continue;
    const url = decodeHtmlEntities(def.url);
    if (!url || UNSAFE_SCHEME_RE.test(url) || WINDOWS_ABS_RE.test(url) || UNC_ABS_RE.test(url) || url.startsWith('#')) {
      skipped.push({ fileRelPath, line: def.line, reason: UNSAFE_SCHEME_RE.test(url) ? 'unsafe-scheme' : 'relative-or-special', detail: url.slice(0, 200) });
      continue;
    }
    if (EXTERNAL_SCHEME_RE.test(url) || url.startsWith('//')) {
      occurrences.push({
        fileRelPath,
        line: def.line,
        label: def.title || '',
        url: url.startsWith('//') ? `https:${url}` : url,
        linkKind: 'external',
        method: 'reference-def-unused',
        context: String(def.rawLine || '').trim().slice(0, 170),
      });
    } else {
      occurrences.push({
        fileRelPath,
        line: def.line,
        label: def.title || '',
        url,
        linkKind: 'relative',
        method: 'reference-def-unused',
        context: String(def.rawLine || '').trim().slice(0, 170),
      });
    }
  }

  return { occurrences, skipped, refDefs: Object.fromEntries([...refDefs.entries()].map(([k, v]) => [k, { url: v.url, line: v.line, used: v.used }])) };
}

/**
 * True if a relative link target resolves inside an approved source folder.
 */
export function isApprovedRelativeTarget(resolvedRepoPath, approvedRoots) {
  const norm = String(resolvedRepoPath).replace(/\\/g, '/');
  return approvedRoots.some((root) => norm.startsWith(`${root}/`) || norm === root);
}
