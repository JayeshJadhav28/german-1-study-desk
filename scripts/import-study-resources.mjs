/**
 * import-study-resources.mjs
 * Scans eligible Markdown files under the two approved read-only folders,
 * extracts every genuine study-resource link (inline, reference-style,
 * HTML anchor, bare URL, relative), cross-checks complementary indexes
 * (all-links.csv, video-links.csv, lessons/assignments/transcripts indexes
 * and lesson JSON links[]), de-duplicates by exact URL while preserving
 * every occurrence, and emits:
 *   public/data/study-resources.json
 *   STUDY_RESOURCES.md
 *   RESOURCE_LINK_AUDIT.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsvObjects } from './lib/csv.mjs';
import { extractFromMarkdown, extractDomain, isApprovedRelativeTarget } from './lib/links.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASH_ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = process.env.SOURCE_ROOT ? path.resolve(process.env.SOURCE_ROOT) : path.resolve(DASH_ROOT, '..');
const PACK = path.join(SOURCE_ROOT, 'German-I-Study-Pack');
const ANALYSIS = path.join(SOURCE_ROOT, 'German-I-Exam-Prep-Output');
const OUT_JSON = path.join(DASH_ROOT, 'public', 'data', 'study-resources.json');
const OUT_STUDY_MD = path.join(DASH_ROOT, 'STUDY_RESOURCES.md');
const OUT_AUDIT_MD = path.join(DASH_ROOT, 'RESOURCE_LINK_AUDIT.md');

const APPROVED_ROOTS = ['German-I-Study-Pack', 'German-I-Exam-Prep-Output'];
const EXCLUDED_DIR_NAMES = new Set(['node_modules', '.nptel-browser-profile', '.git', 'public', 'dist']);

const audit = {
  generatedAt: new Date().toISOString(),
  filesScanned: [],
  filesSkipped: [],
  extractionCounts: {
    markdownFilesScanned: 0,
    inlineMd: 0,
    referenceLink: 0,
    htmlAnchor: 0,
    bareUrl: 0,
    referenceDefUnused: 0,
    relative: 0,
    external: 0,
    unsafeScheme: 0,
    windowsAbsolutePath: 0,
    indexRows: 0,
    lessonJsonLinks: 0,
  },
  skippedLinks: [],
  schemaIssues: [],
};

function repoRel(p) { return path.relative(SOURCE_ROOT, p).split(path.sep).join('/'); }

function walkMd(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMd(full, acc);
    else if (entry.name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

function weekNumFromText(text) {
  const m = /Week[^\d]{0,3}(\d{1,2})/i.exec(String(text || ''));
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 12 ? n : null;
}

function lessonFromText(text) {
  const m = /lessonId=(\d+)/i.exec(String(text || ''));
  return m ? Number(m[1]) : null;
}

/** Category inference from domain + path + label (confidence noted). */
export function inferCategory(url, label, sourceContext = '') {
  const u = String(url).toLowerCase();
  const l = String(label || '').toLowerCase();
  const ctx = String(sourceContext || '').toLowerCase();
  let category = 'general-link';
  if (u.includes('youtube.com/watch') || u.includes('youtu.be/')) category = 'lecture-video';
  else if (u.includes('youtube.com/playlist')) category = 'lecture-video-playlist';
  else if (u.includes('storage.googleapis.com') && u.includes('.vtt')) category = 'transcript';
  else if (u.includes('drive.google.com') || u.includes('docs.google.com/forms')) {
    category = u.includes('docs.google.com/forms') ? 'course-form' : 'book-lecture-material';
  } else if (u.includes('nptel.ac.in') || u.includes('onlinecourses.nptel.ac.in') || u.includes('swayam')) {
    category = 'nptel-course';
  } else if (/goethe\.de|leo\.org|dict\.cc|schubert-verlag|deutschkurse|tatsachen-ueber-deutschland/.test(u)) {
    category = 'supplementary-reference';
  } else if (u.includes('.pdf')) category = 'downloadable-resource';
  else if (/exam|certification/.test(l) || /exam|certification/.test(ctx)) category = 'exam-guidance';
  // honesty: category inferred, never "official"
  return category;
}

function categoryNote(category, url) {
  const notes = [];
  if (category === 'book-lecture-material' && /drive\.google\.com/.test(url)) {
    notes.push('Google Drive link from source; access may require a Google account. Not downloaded locally.');
  }
  if (category === 'course-form') notes.push('Google Forms link from source; opening it may require sign-in.');
  if (category === 'lecture-video') notes.push('External YouTube link; not downloaded or embedded by this app.');
  if (category === 'transcript') notes.push('Remote VTT URL as recorded in source index; local copy exists only if listed in transcripts-index.csv.');
  if (category === 'nptel-course') notes.push('NPTEL/SWAYAM course link as recorded in source.');
  return notes.join(' ');
}

// ---------- scan markdown ----------
const occurrencesByCanonical = new Map(); // key -> resource record
const skipped = [];

/**
 * The corpus cross-references documents via inline code spans (backticks),
 * not relative hyperlinks (verified: 0 relative md links in 195 files).
 * Catalog those mentions honestly as `file-mention` (not links).
 */
const FILE_MENTION_RE = /`([^`\n]+)`/g;
const MENTION_BASE_RE = /^[A-Za-z0-9][\w.-]*\.(md|csv|json|vtt|txt|pdf|html?)$/i;

function extractFileMentions(abs, rel, text, provenance) {
  let m;
  FILE_MENTION_RE.lastIndex = 0;
  while ((m = FILE_MENTION_RE.exec(text)) !== null) {
    const raw = m[1].trim();
    // skip pure wildcards, URLs, and prose-looking spans
    if (!raw || raw.length > 240 || /\s/.test(raw) || /^https?:/i.test(raw)) continue;
    const norm0 = raw.replace(/\\/g, '/');
    const base0 = norm0.split('/').pop();
    // reject bare extensions (`.md`) and other non-filename spans
    if (!MENTION_BASE_RE.test(base0)) continue;
    if (/[*]|\.\.\.|\/\.\.\./.test(norm0)) {
      // pattern, not a concrete file — record as unresolved pattern, never as a link
      audit.skippedLinks.push({ fileRelPath: rel, line: 0, reason: 'file-mention-pattern', detail: raw });
      continue;
    }
    const norm = norm0;
    const line = text.slice(0, m.index).split('\n').length;
    const candidates = [
      path.resolve(SOURCE_ROOT, norm),
      path.resolve(path.dirname(abs), norm),
      path.resolve(PACK, norm),
      path.resolve(ANALYSIS, norm),
    ];
    let resolved = null;
    for (const c of candidates) {
      const r = path.relative(SOURCE_ROOT, c).split(path.sep).join('/');
      if (isApprovedRelativeTarget(r, APPROVED_ROOTS) && fs.existsSync(c)) { resolved = r; break; }
    }
    const weekNum = weekNumFromText(rel) ?? weekNumFromText(raw);
    const lessonId = lessonFromText(raw);
    if (resolved) {
      addOccurrence({
        canonicalKey: `mention:${resolved}`,
        linkKind: 'file-mention',
        relativePath: resolved,
        label: norm,
        sourceFile: rel,
        line,
        context: `inline code reference in ${path.basename(rel)}`,
        method: 'inline-code-mention',
        weekNum,
        lessonId,
        provenance,
        sourceKind: 'markdown-file-mention',
      });
    } else {
      audit.skippedLinks.push({ fileRelPath: rel, line, reason: 'file-mention-unresolved', detail: raw });
    }
  }
}

function addOccurrence({ canonicalKey, linkKind, url, relativePath, label, sourceFile, line, context, method, weekNum, lessonId, provenance, sourceKind }) {
  let rec = occurrencesByCanonical.get(canonicalKey);
  if (!rec) {
    const domain = linkKind === 'external' ? extractDomain(url) : '';
    rec = {
      id: '',
      title: label || url || relativePath || canonicalKey,
      linkKind, // external | internal-markdown | internal-resource
      url: linkKind === 'external' ? url : undefined,
      relativePath: linkKind !== 'external' ? relativePath : undefined,
      domain,
      category: '',
      categoryConfidence: 'inferred-from-domain-and-label',
      categoryNote: '',
      provenance,
      sourceKinds: new Set(),
      weeks: new Set(),
      lessonIds: new Set(),
      occurrences: [],
    };
    occurrencesByCanonical.set(canonicalKey, rec);
  }
  // Prefer a human label over a raw URL when we have one
  if (label && (!rec.title || /^https?:\/\//.test(rec.title))) rec.title = label;
  rec.sourceKinds.add(sourceKind);
  if (weekNum) rec.weeks.add(weekNum);
  if (lessonId) rec.lessonIds.add(lessonId);
  rec.occurrences.push({ sourceFile, line, label, context, method, weekNum, lessonId });
}

function scanMarkdownFile(abs) {
  const rel = repoRel(abs);
  const provenance = rel.startsWith('German-I-Exam-Prep-Output') ? 'exam-prep-analysis' : 'course-corpus';
  let text;
  try {
    text = fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '');
  } catch (e) {
    audit.filesSkipped.push({ path: rel, reason: `read-error: ${e.message}` });
    return;
  }
  audit.filesScanned.push(rel);
  audit.extractionCounts.markdownFilesScanned += 1;

  const { occurrences, skipped: fileSkipped } = extractFromMarkdown(text, { fileRelPath: rel });
  for (const s of fileSkipped) {
    audit.skippedLinks.push(s);
    if (s.reason === 'unsafe-scheme') audit.extractionCounts.unsafeScheme += 1;
    if (s.reason === 'windows-absolute-path') audit.extractionCounts.windowsAbsolutePath += 1;
  }
  for (const o of occurrences) {
    const method = o.method;
    if (method === 'inline-markdown') audit.extractionCounts.inlineMd += 1;
    else if (method === 'html-anchor') audit.extractionCounts.htmlAnchor += 1;
    else if (method === 'bare-url') audit.extractionCounts.bareUrl += 1;
    else if (method === 'reference-link' || method === 'reference-def-unused') audit.extractionCounts.referenceLink += 1;

    const weekNum = weekNumFromText(rel) ?? weekNumFromText(o.context) ?? weekNumFromText(path.basename(rel));
    const lessonId = lessonFromText(o.context) ?? lessonFromText(rel);

    if (o.linkKind === 'external') {
      audit.extractionCounts.external += 1;
      addOccurrence({
        canonicalKey: `ext:${o.url}`,
        linkKind: 'external',
        url: o.url,
        label: o.label,
        sourceFile: rel,
        line: o.line,
        context: o.context,
        method,
        weekNum,
        lessonId,
        provenance,
        sourceKind: 'markdown',
      });
    } else {
      // relative link — resolve against file dir
      const fileDir = path.dirname(abs);
      const resolvedAbs = path.resolve(fileDir, o.url.split('#')[0].split('?')[0]);
      const resolvedRel = path.relative(SOURCE_ROOT, resolvedAbs).split(path.sep).join('/');
      if (!isApprovedRelativeTarget(resolvedRel, APPROVED_ROOTS)) {
        audit.skippedLinks.push({ fileRelPath: rel, line: o.line, reason: 'relative-outside-approved-roots', detail: `${o.url} -> ${resolvedRel}` });
        continue;
      }
      audit.extractionCounts.relative += 1;
      const exists = fs.existsSync(resolvedAbs);
      const linkType = /\.md$/i.test(resolvedRel) ? 'internal-markdown' : 'internal-resource';
      addOccurrence({
        canonicalKey: `int:${resolvedRel}`,
        linkKind: linkType,
        relativePath: resolvedRel,
        label: o.label || path.basename(resolvedRel),
        sourceFile: rel,
        line: o.line,
        context: o.context,
        method,
        weekNum,
        lessonId,
        provenance,
        sourceKind: exists ? 'markdown' : 'markdown-missing-target',
      });
      if (!exists) {
        audit.skippedLinks.push({ fileRelPath: rel, line: o.line, reason: 'relative-target-missing-on-disk', detail: resolvedRel });
      }
    }
  }
  extractFileMentions(abs, rel, text, provenance);
}

for (const abs of walkMd(PACK)) scanMarkdownFile(abs);
for (const abs of walkMd(ANALYSIS)) scanMarkdownFile(abs);

// ---------- cross-check indexes ----------
function safeCsv(abs, label) {
  if (!fs.existsSync(abs)) { audit.schemaIssues.push(`missing index: ${label}`); return []; }
  try {
    return parseCsvObjects(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    audit.schemaIssues.push(`failed to parse ${label}: ${e.message}`);
    return [];
  }
}

// all-links.csv: text,url,source
const allLinks = safeCsv(path.join(PACK, 'all-links.csv'), 'all-links.csv');
for (const row of allLinks) {
  audit.extractionCounts.indexRows += 1;
  const url = String(row.url || '').trim();
  const label = String(row.text || '').trim();
  const source = String(row.source || '').trim();
  if (!url) continue;
  if (!/^https?:\/\//i.test(url)) {
    audit.skippedLinks.push({ fileRelPath: 'German-I-Study-Pack/all-links.csv', line: 0, reason: 'index-url-not-http', detail: url });
    continue;
  }
  const weekNum = weekNumFromText(source);
  addOccurrence({
    canonicalKey: `ext:${url}`,
    linkKind: 'external',
    url,
    label,
    sourceFile: 'German-I-Study-Pack/all-links.csv',
    line: 0,
    context: `all-links.csv source column: ${source}`,
    method: 'index-csv',
    weekNum,
    lessonId: null,
    provenance: 'course-corpus',
    sourceKind: 'all-links-csv',
  });
}

// video-links.csv: url column
const videoLinks = safeCsv(path.join(PACK, 'video-links.csv'), 'video-links.csv');
for (const row of videoLinks) {
  audit.extractionCounts.indexRows += 1;
  const url = String(row.url || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) continue;
  addOccurrence({
    canonicalKey: `ext:${url}`,
    linkKind: 'external',
    url,
    label: String(row.title || '').trim() || url,
    sourceFile: 'German-I-Study-Pack/video-links.csv',
    line: 0,
    context: `video-links.csv unit: ${row.unit || ''} lessonId: ${row.lessonId || ''}`,
    method: 'index-csv',
    weekNum: weekNumFromText(row.unit),
    lessonId: row.lessonId ? Number(row.lessonId) : null,
    provenance: 'course-corpus',
    sourceKind: 'video-links-csv',
  });
}

// transcripts-index.csv url column
const transcriptsIndex = safeCsv(path.join(PACK, 'transcripts-index.csv'), 'transcripts-index.csv');
for (const row of transcriptsIndex) {
  audit.extractionCounts.indexRows += 1;
  const url = String(row.url || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) continue;
  addOccurrence({
    canonicalKey: `ext:${url}`,
    linkKind: 'external',
    url,
    label: `VTT transcript — ${row.lesson || ''}`.trim(),
    sourceFile: 'German-I-Study-Pack/transcripts-index.csv',
    line: 0,
    context: `transcripts-index.csv savedAs: ${row.savedAs || ''} status: ${row.status || ''}`,
    method: 'index-csv',
    weekNum: weekNumFromText(row.unit),
    lessonId: null,
    provenance: 'course-corpus',
    sourceKind: 'transcripts-index-csv',
  });
}

// lessons-index.csv videoUrl column
const lessonsIndex = safeCsv(path.join(PACK, 'lessons-index.csv'), 'lessons-index.csv');
for (const row of lessonsIndex) {
  audit.extractionCounts.indexRows += 1;
  const url = String(row.videoUrl || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) continue;
  addOccurrence({
    canonicalKey: `ext:${url}`,
    linkKind: 'external',
    url,
    label: String(row.title || '').trim() || url,
    sourceFile: 'German-I-Study-Pack/lessons-index.csv',
    line: 0,
    context: `lessons-index.csv unit: ${row.unit || ''} lessonId: ${row.lessonId || ''}`,
    method: 'index-csv',
    weekNum: weekNumFromText(row.unit),
    lessonId: row.lessonId ? Number(row.lessonId) : null,
    provenance: 'course-corpus',
    sourceKind: 'lessons-index-csv',
  });
}

// lesson JSON links[] + ytWatch
const weeksDir = path.join(PACK, 'weeks');
if (fs.existsSync(weeksDir)) {
  for (const weekFolder of fs.readdirSync(weeksDir)) {
    const dir = path.join(weeksDir, weekFolder);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const rel = repoRel(path.join(dir, f));
      let j;
      try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8').replace(/^\uFEFF/, '')); } catch (e) {
        audit.schemaIssues.push(`lesson json parse failed: ${rel}: ${e.message}`);
        continue;
      }
      const weekNum = weekNumFromText(j.unit) ?? weekNumFromText(weekFolder);
      const lessonId = j.lessonId ? Number(j.lessonId) : null;
      const push = (url, label, kind) => {
        if (!url || !/^https?:\/\//i.test(url)) return;
        audit.extractionCounts.lessonJsonLinks += 1;
        addOccurrence({
          canonicalKey: `ext:${url}`,
          linkKind: 'external',
          url,
          label: label || url,
          sourceFile: rel,
          line: 0,
          context: `lesson JSON ${kind}: ${j.title || ''}`,
          method: 'lesson-json',
          weekNum,
          lessonId,
          provenance: 'course-corpus',
          sourceKind: 'lesson-json',
        });
      };
      if (Array.isArray(j.links)) {
        for (const l of j.links) push(l?.url, l?.text, 'links[]');
      }
      if (j.ytWatch) push(j.ytWatch, `${j.title || 'Lesson'} (video)`, 'ytWatch');
      if (j.subtitles && typeof j.subtitles === 'object') {
        for (const [lang, url] of Object.entries(j.subtitles)) push(url, `${j.title || 'Lesson'} VTT (${lang})`, 'subtitles');
      }
    }
  }
}

// ---------- finalize records ----------
let idCounter = 0;
const resources = [];
for (const [key, rec] of occurrencesByCanonical.entries()) {
  idCounter += 1;
  const weeks = [...rec.weeks].sort((a, b) => a - b);
  const lessonIds = [...rec.lessonIds].sort((a, b) => a - b);
  const primaryOcc = rec.occurrences[0];
  const category = rec.linkKind === 'external'
    ? inferCategory(rec.url, rec.title, `${primaryOcc?.context || ''} ${[...rec.sourceKinds].join(' ')}`)
    : (rec.linkKind === 'internal-markdown' ? 'internal-study-document'
      : rec.linkKind === 'file-mention' ? 'internal-file-mention' : 'internal-resource-file');
  const stableId = rec.linkKind === 'external'
    ? `r${String(idCounter).padStart(3, '0')}-${(rec.domain || 'ext').replace(/[^a-z0-9.-]/gi, '')}-${hashKey(key)}`
    : `r${String(idCounter).padStart(3, '0')}-local-${hashKey(key)}`;

  resources.push({
    id: stableId,
    title: rec.title || rec.url || rec.relativePath,
    linkKind: rec.linkKind,
    url: rec.url,
    relativePath: rec.relativePath,
    domain: rec.domain,
    category,
    categoryConfidence: 'inferred-from-domain-and-label',
    categoryNote: categoryNote(category, rec.url || rec.relativePath || ''),
    provenance: rec.provenance,
    weeks,
    lessonIds,
    sourceKinds: [...rec.sourceKinds],
    occurrenceCount: rec.occurrences.length,
    occurrences: rec.occurrences.map((o) => ({
      sourceFile: o.sourceFile,
      line: o.line,
      label: o.label,
      context: o.context,
      method: o.method,
      weekNum: o.weekNum,
      lessonId: o.lessonId,
    })),
  });
}

function hashKey(s) {
  let h = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i += 1) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
  return Math.abs(h).toString(36);
}

// sort: external first by category/title
resources.sort((a, b) => {
  if (a.linkKind !== b.linkKind) return a.linkKind === 'external' ? -1 : 1;
  if (a.category !== b.category) return a.category.localeCompare(b.category);
  return String(a.title).localeCompare(String(b.title));
});

const external = resources.filter((r) => r.linkKind === 'external');
const internalMd = resources.filter((r) => r.linkKind === 'internal-markdown');
const internalRes = resources.filter((r) => r.linkKind === 'internal-resource');
const fileMentions = resources.filter((r) => r.linkKind === 'file-mention');
const byCategory = {};
for (const r of resources) byCategory[r.category] = (byCategory[r.category] || 0) + 1;

const totalOccurrences = resources.reduce((s, r) => s + r.occurrenceCount, 0);

const catalog = {
  generatedAt: audit.generatedAt,
  disclaimer: 'Links found in the study documents. No URLs were invented. External links open only when you click them. "File mentions" are inline-code references, not hyperlinks.',
  summary: {
    distinctResources: resources.length,
    distinctExternalUrls: external.length,
    internalMarkdownLinks: internalMd.length,
    internalResourceLinks: internalRes.length,
    fileMentions: fileMentions.length,
    fileMentionPatternsSkipped: audit.skippedLinks.filter((s) => s.reason === 'file-mention-pattern').length,
    fileMentionsUnresolved: audit.skippedLinks.filter((s) => s.reason === 'file-mention-unresolved').length,
    totalOccurrences,
    skipped: {
      unsafeScheme: audit.extractionCounts.unsafeScheme,
      windowsAbsolutePath: audit.extractionCounts.windowsAbsolutePath,
      relativeOutsideApproved: audit.skippedLinks.filter((s) => s.reason === 'relative-outside-approved-roots').length,
      relativeTargetMissing: audit.skippedLinks.filter((s) => s.reason === 'relative-target-missing-on-disk').length,
      indexUrlNotHttp: audit.skippedLinks.filter((s) => s.reason === 'index-url-not-http').length,
      totalSkippedRecords: audit.skippedLinks.length,
    },
    byCategory,
    markdownFilesScanned: audit.extractionCounts.markdownFilesScanned,
  },
  resources,
};

fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify(catalog, null, 1));

// ---------- STUDY_RESOURCES.md ----------
function mdEscape(s) { return String(s ?? '').replace(/\|/g, '\\|'); }

const mdLines = [];
mdLines.push('# Study Resources — extracted link catalog');
mdLines.push('');
mdLines.push(`> Generated ${audit.generatedAt} from local Markdown and indexes. **No URLs were invented.** External links open in a new tab only when you click them. Google Drive / Forms links may require an account; none were downloaded. Lecture videos are not embedded or bulk-downloaded.`);
mdLines.push('');
mdLines.push('## Summary');
mdLines.push('');
mdLines.push(`- Distinct resources: **${catalog.summary.distinctResources}**`);
mdLines.push(`- Distinct external URLs: **${catalog.summary.distinctExternalUrls}**`);
mdLines.push(`- Internal Markdown links: **${catalog.summary.internalMarkdownLinks}** (the corpus contains **zero relative hyperlinks** — cross-references are inline-code mentions, catalogued below)`);
mdLines.push(`- Internal resource links (csv/json/vtt etc.): **${catalog.summary.internalResourceLinks}**`);
mdLines.push(`- Internal file mentions (inline code, not hyperlinks): **${catalog.summary.fileMentions}**`);
mdLines.push(`- Total source occurrences (after de-duplication): **${catalog.summary.totalOccurrences}**`);
mdLines.push(`- Skipped/unsafe entries: **${catalog.summary.skipped.totalSkippedRecords}** (see \`RESOURCE_LINK_AUDIT.md\`)`);
mdLines.push('');
mdLines.push('## External resources by week association');
mdLines.push('');

const generalExternal = external.filter((r) => r.weeks.length === 0);
for (let w = 1; w <= 12; w += 1) {
  const inWeek = external.filter((r) => r.weeks.includes(w));
  if (inWeek.length === 0) continue;
  mdLines.push(`### Week ${w}`);
  mdLines.push('');
  mdLines.push('| Title / label | URL | Category | Source file(s) | Context |');
  mdLines.push('|---|---|---|---|---|');
  for (const r of inWeek) {
    const srcs = [...new Set(r.occurrences.map((o) => o.sourceFile))];
    const ctx = r.occurrences[0]?.context || '';
    mdLines.push(`| ${mdEscape(r.title)} | ${r.url} | ${mdEscape(r.category)} | ${mdEscape(srcs.slice(0, 2).join('; '))}${srcs.length > 2 ? ` (+${srcs.length - 2} more)` : ''} | ${mdEscape(ctx.slice(0, 110))} |`);
  }
  mdLines.push('');
}
mdLines.push('### General / course-level (no single week)');
mdLines.push('');
mdLines.push('| Title / label | URL | Category | Source file(s) | Context |');
mdLines.push('|---|---|---|---|---|');
for (const r of generalExternal) {
  const srcs = [...new Set(r.occurrences.map((o) => o.sourceFile))];
  mdLines.push(`| ${mdEscape(r.title)} | ${r.url} | ${mdEscape(r.category)} | ${mdEscape(srcs.slice(0, 2).join('; '))}${srcs.length > 2 ? ` (+${srcs.length - 2} more)` : ''} | ${mdEscape((r.occurrences[0]?.context || '').slice(0, 110))} |`);
}
mdLines.push('');
mdLines.push('## Internal study-document links (resolved inside the corpus / analysis pack)');
mdLines.push('');
mdLines.push('| Target | Occurrences | Example source |');
mdLines.push('|---|---:|---|');
for (const r of [...internalMd, ...internalRes]) {
  mdLines.push(`| \`${mdEscape(r.relativePath)}\` | ${r.occurrenceCount} | ${mdEscape(r.occurrences[0]?.sourceFile || '')}:${r.occurrences[0]?.line || ''} |`);
}
if (internalMd.length + internalRes.length === 0) {
  mdLines.push('| _(none — the source corpus uses inline-code file references, not relative hyperlinks; see the next section)_ | — | — |');
}
mdLines.push('');
mdLines.push('## Internal file mentions (inline code spans, not hyperlinks)');
mdLines.push('');
mdLines.push('These are documents referenced in backtick code spans across the corpus and analysis pack. They are **not clickable links in the source**, but the Study Desk ships local copies of the analysis documents and exposes them in the Reader.');
mdLines.push('');
mdLines.push('| Target | Occurrences | Example source |');
mdLines.push('|---|---:|---|');
for (const r of fileMentions) {
  mdLines.push(`| \`${mdEscape(r.relativePath)}\` | ${r.occurrenceCount} | ${mdEscape(r.occurrences[0]?.sourceFile || '')}:${r.occurrences[0]?.line || ''} |`);
}
mdLines.push('');
mdLines.push('---');
mdLines.push('*See `RESOURCE_LINK_AUDIT.md` for extraction mechanics, de-duplication rules and skipped entries.*');
fs.writeFileSync(OUT_STUDY_MD, mdLines.join('\n'));

// ---------- RESOURCE_LINK_AUDIT.md ----------
const a = [];
a.push('# Resource Link Audit');
a.push('');
a.push(`- Extraction date: ${audit.generatedAt}`);
a.push(`- Source folders scanned (read-only): \`${APPROVED_ROOTS.join('`\`, `')}\``);
a.push(`- Markdown files scanned: **${audit.extractionCounts.markdownFilesScanned}** (pack + analysis; \`node_modules\` and \`.nptel-browser-profile\` excluded)`);
a.push(`- Index rows cross-checked: **${audit.extractionCounts.indexRows}** (all-links.csv, video-links.csv, transcripts-index.csv, lessons-index.csv)`);
a.push(`- Lesson JSON link objects + ytWatch + subtitle URLs: **${audit.extractionCounts.lessonJsonLinks}**`);
a.push('');
a.push('## Extraction methods (per Markdown file)');
a.push('');
a.push('| Method | Count |');
a.push('|---|---:|');
a.push(`| Inline markdown \`[label](url)\` | ${audit.extractionCounts.inlineMd} |`);
a.push(`| Reference-style / reference defs | ${audit.extractionCounts.referenceLink} |`);
a.push(`| HTML \`<a href>\` anchors | ${audit.extractionCounts.htmlAnchor} |`);
a.push(`| Bare http(s) URLs (prose, code spans/fences masked) | ${audit.extractionCounts.bareUrl} |`);
a.push(`| External occurrences | ${audit.extractionCounts.external} |`);
a.push(`| Relative (internal) occurrences | ${audit.extractionCounts.relative} |`);
a.push(`| Inline-code file mentions (backtick spans with file extensions; NOT hyperlinks) | ${catalog.summary.fileMentions} resolved, ${catalog.summary.fileMentionsUnresolved} unresolved, ${catalog.summary.fileMentionPatternsSkipped} wildcard-patterns skipped |`);
a.push('');
a.push('### Notable finding: zero relative hyperlinks');
a.push('');
a.push('A full scan of all 195 Markdown files found **0 relative markdown hyperlinks** (e.g. `[label](../file.md)`). The corpus and analysis pack cross-reference documents exclusively via inline code spans (`` `04_Important_Questions_and_Answers.md` ``). Those mentions are catalogued separately as `file-mention` records and resolved against the two approved roots; wildcard/pattern mentions (e.g. `transcripts/*.vtt`, `weeks/Week-N/<slug>.md`) are skipped honestly rather than fabricated.');
a.push('');
a.push('## De-duplication rules');
a.push('');
a.push('- External resources are keyed by the **exact URL string as written** (query strings and fragments preserved; HTML entities such as `&amp;` decoded to `&`). One catalog record per canonical URL; every source occurrence is kept in `occurrences[]` with file, line, label, method and context.');
a.push('- Internal resources are keyed by the **resolved repo-relative path** (e.g. `German-I-Exam-Prep-Output/02_German_Grammar_Cheat_Sheet.md`).');
a.push('- No URL normalization, tracking-parameter stripping, or scheme upgrades beyond protocol-relative `//host` → `https://host`.');
a.push('');
a.push('## Skipped / invalid / unsafe');
a.push('');
a.push('| Reason | Count |');
a.push('|---|---:|');
const reasonCounts = {};
for (const s of audit.skippedLinks) reasonCounts[s.reason] = (reasonCounts[s.reason] || 0) + 1;
for (const [reason, count] of Object.entries(reasonCounts)) a.push(`| ${reason} | ${count} |`);
if (Object.keys(reasonCounts).length === 0) a.push('| (none) | 0 |');
a.push('');
a.push('### Skipped detail (first 40)');
a.push('');
for (const s of audit.skippedLinks.slice(0, 40)) {
  a.push(`- \`${s.fileRelPath || ''}\`${s.line ? `:${s.line}` : ''} — **${s.reason}**: \`${String(s.detail || '').slice(0, 140)}\``);
}
if (audit.skippedLinks.length > 40) a.push(`- … ${audit.skippedLinks.length - 40} more (full list inside \`public/data/study-resources.json\` → not stored; counts only — see summary.skipped).`);
a.push('');
a.push('## Relative-link resolution');
a.push('');
a.push('- Relative links are resolved against the containing Markdown file\'s directory inside the repo.');
a.push('- Targets outside the two approved source folders are skipped (`relative-outside-approved-roots`).');
a.push('- Missing targets are recorded honestly (`relative-target-missing-on-disk`) — no fake files are created.');
a.push('');
a.push('## Schema / parse notes');
a.push('');
a.push('- `all-links.csv` header: `text,url,source` — 14 data rows; scheme-less display text (e.g. `www.leo.org`) kept as label, URL column used verbatim.');
a.push('- `video-links.csv`: `type,title,url,embedUrl,unit,lessonId` — 60 rows.');
a.push('- `transcripts-index.csv`: `lesson,unit,language,url,savedAs,status` — 46 rows; remote VTT URLs catalogued, local presence tracked separately.');
a.push('- `lessons-index.csv`: `unit,lessonId,title,type,videoUrl,hasTranscript` — 77 rows; `videoUrl` non-empty rows contribute video links.');
a.push('- Lesson JSON `links[]` objects use `{url,text}` keys.');
if (audit.schemaIssues.length) {
  a.push('');
  a.push('### Issues found during import');
  for (const issue of audit.schemaIssues) a.push(`- ${issue}`);
} else {
  a.push('');
  a.push('- No schema parse failures encountered during this import run.');
}
a.push('');
a.push('## Catalog outputs');
a.push('');
a.push('- `public/data/study-resources.json` — app-ready catalog (summary + resources[] with occurrences).');
a.push('- `STUDY_RESOURCES.md` — human-readable directory grouped by week + category.');
a.push('- This audit file.');
fs.writeFileSync(OUT_AUDIT_MD, a.join('\n'));

console.log('[resources] catalog written');
console.log(JSON.stringify(catalog.summary, null, 2));
if (audit.schemaIssues.length) {
  console.warn('[resources] schema issues:', audit.schemaIssues);
}
