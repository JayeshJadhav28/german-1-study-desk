/**
 * build-public-data.mjs
 * Builds public-safe data into public/data/ from an existing FULL data set
 * (public/data/ produced by import-course-data.mjs + import-study-resources.mjs).
 *
 * Excludes anything whose redistribution rights are not confirmed:
 *   - data/markdown/**            (verbatim NPTEL/analysis Markdown copies)
 *   - data/markdown-index.json    (index of those copies)
 *   - data/transcripts/*.json     (verbatim ASR lecture subtitle cues)
 *   - data/questions/week-*.json  (verbatim scraped assignment questions + keys)
 *   - data/concepts.json          (derived counts of the scraped question ledger)
 *   - data/mock-items.json        (newly written items; kept local)
 *   - data/vocabulary.json        (course word lists)
 *
 * Publishes only: course metadata + syllabus, week structure, lesson index
 * (titles/topics/video links), assignment index (titles/dates only), the
 * Study Resources link catalog, and the author-written revision checklist.
 *
 * The full set must already exist. This script never reads the source folders.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASH_ROOT = path.resolve(__dirname, '..');
const SRC = path.join(DASH_ROOT, 'public', 'data');
const DEST = path.join(DASH_ROOT, 'public', 'data-public');

function must(p, label) {
  if (!fs.existsSync(p)) { console.error(`[public] missing ${label}: ${p}`); process.exit(1); }
}

for (const f of ['course.json', 'weeks.json', 'lessons.json', 'assignments.json', 'study-resources.json', 'revision-plan.json', 'video-links.json']) {
  must(path.join(SRC, f), f);
}

// ---------- safe readers ----------
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));

// Strip any absolute Windows path (drive letter or UNC) from a string, so no
// local machine path can reach the public site. Returns the cleaned string.
function stripLocalPaths(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/[A-Za-z]:\\[^\s"'`|,)]*/g, '[local file]')
    .replace(/\\\\[^\s"'`|,)]*/g, '[local file]')
    .replace(/file:\/\/\/[^\s"'`|,)]*/gi, '[local file]');
}
function deepStrip(obj) {
  if (typeof obj === 'string') return stripLocalPaths(obj);
  if (Array.isArray(obj)) return obj.map(deepStrip);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = deepStrip(v);
    return out;
  }
  return obj;
}

// ---------- course metadata (syllabus outline only) ----------
const course = readJson(path.join(SRC, 'course.json'));
const publicCourse = deepStrip({
  title: course.title,
  courseName: course.courseName,
  courseCode: course.courseCode,
  instructor: course.instructor,
  examDateRendered: course.examDateRendered,
  sessions: course.sessions,
  scoringNote: course.scoringNote,
  textbook: course.textbook,
  syllabus: course.syllabus,
  disclaimers: course.disclaimers,
});

// ---------- weeks (theme/grammar + counts) ----------
const weeks = readJson(path.join(SRC, 'weeks.json')).map((w) => ({
  weekNum: w.weekNum,
  theme: stripLocalPaths(w.theme),
  grammar: stripLocalPaths(w.grammar),
  lessonCount: w.lessonCount,
  realQuestions: w.realQuestions,
  assignmentTitle: stripLocalPaths(w.assignmentTitle || ''),
  assignmentDue: w.assignmentDue || '',
  // transcriptCount/lessonIds reference excluded data; keep only the flag
  hasTranscripts: Number(w.transcriptCount || 0) > 0,
}));

// ---------- lessons (metadata only, no local paths / no excluded pointers) ----------
const lessons = readJson(path.join(SRC, 'lessons.json')).map((l) => ({
  lessonId: l.lessonId,
  unit: stripLocalPaths(l.unit),
  title: stripLocalPaths(l.title),
  type: l.type,
  weekNum: l.weekNum,
  videoUrl: l.videoUrl || '',
  videoId: l.videoId || '',
  vttRemoteUrl: l.vttRemoteUrl || '',
  vttLanguageLabel: l.vttLanguageLabel || 'English',
  links: (l.links || []).map((lk) => ({ text: stripLocalPaths(lk.text), url: lk.url })),
  hasTranscript: !!l.hasLocalVtt,
}));

// ---------- assignments (titles + dates only, no question text or keys) ----------
const assignments = readJson(path.join(SRC, 'assignments.json')).map((a) => ({
  assessmentId: a.assessmentId,
  weekNum: a.weekNum,
  unit: stripLocalPaths(a.unit),
  title: stripLocalPaths(a.title),
  dueDate: a.dueDate,
  realQuestions: a.realQuestions,
}));

// ---------- study resources (external links only; no internal file mentions) ----------
const fullResourcesDoc = deepStrip(readJson(path.join(SRC, 'study-resources.json')));
const externalResources = (fullResourcesDoc.resources || []).filter((r) => r.linkKind === 'external');
const byCategory = {};
for (const r of externalResources) byCategory[r.category] = (byCategory[r.category] || 0) + 1;
const resourcesDoc = {
  generatedAt: fullResourcesDoc.generatedAt,
  disclaimer: fullResourcesDoc.disclaimer,
  summary: {
    ...fullResourcesDoc.summary,
    distinctResources: externalResources.length,
    distinctExternalUrls: externalResources.length,
    fileMentions: 0,
    fileMentionPatternsSkipped: 0,
    fileMentionsUnresolved: 0,
    totalOccurrences: externalResources.reduce((s, r) => s + (r.occurrenceCount || 0), 0),
    byCategory,
  },
  resources: externalResources,
};

// ---------- revision checklist (author-written, safe) ----------
const plan = deepStrip(readJson(path.join(SRC, 'revision-plan.json')));

// ---------- video links (public NPTEL/YouTube pages) ----------
const videoLinks = readJson(path.join(SRC, 'video-links.json')).map((v) => ({
  type: v.type,
  title: stripLocalPaths(v.title),
  url: v.url,
  unit: stripLocalPaths(v.unit),
  lessonId: v.lessonId,
}));

// ---------- write ----------
fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
const write = (name, obj) => fs.writeFileSync(path.join(DEST, name), JSON.stringify(obj));

write('course.json', publicCourse);
write('weeks.json', weeks);
write('lessons.json', lessons);
write('assignments.json', assignments);
write('study-resources.json', resourcesDoc);
write('revision-plan.json', plan);
write('video-links.json', videoLinks);

write('manifest.json', {
  app: 'German I Study Desk (public)',
  edition: 'public',
  generatedAt: new Date().toISOString(),
  disclaimer: 'Independent study resource. Not an official NPTEL/SWAYAM website.',
  note: 'Public-safe subset. Verbatim course content (lesson pages, subtitles, assignment questions and answer keys) is excluded because redistribution rights are not confirmed.',
  files: [
    { name: 'course.json', description: 'Course metadata and 12-week syllabus outline' },
    { name: 'weeks.json', description: 'Week themes, grammar topics and counts' },
    { name: 'lessons.json', description: 'Lesson titles/topics and public video links' },
    { name: 'assignments.json', description: 'Assignment titles and due dates' },
    { name: 'study-resources.json', description: 'Catalog of external resource links only (no internal file mentions)' },
    { name: 'revision-plan.json', description: 'Seven-day revision checklist' },
    { name: 'video-links.json', description: 'Public lecture video links' },
  ],
});

// summary
const size = (f) => fs.statSync(path.join(DEST, f)).size;
console.log('[public] public-safe data written to public/data-public/');
for (const f of ['course.json', 'weeks.json', 'lessons.json', 'assignments.json', 'study-resources.json', 'revision-plan.json', 'video-links.json']) {
  if (fs.existsSync(path.join(DEST, f))) console.log(`  ${f}\t${size(f)} bytes`);
}
const total = fs.readdirSync(DEST).reduce((s, f) => s + fs.statSync(path.join(DEST, f)).size, 0);
console.log(`[public] total: ${(total / 1024).toFixed(1)} KB in ${fs.readdirSync(DEST).length} files`);
console.log('[public] EXCLUDED (local only): markdown copies, subtitle cues, question ledger, concepts, mocks, vocabulary, internal file mentions');
