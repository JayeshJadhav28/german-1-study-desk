/**
 * import-course-data.mjs
 * Reads the read-only source folders and emits normalized app data to public/data/.
 *
 * Source roots (relative to this dashboard folder unless SOURCE_ROOT is set):
 *   ../../German-I-Study-Pack
 *   ../../German-I-Exam-Prep-Output
 *
 * Outputs:
 *   public/data/manifest.json, course.json, weeks.json, lessons.json,
 *   assignments.json, transcripts.json (+ transcripts/*.json cues),
 *   questions/week-1..12.json, questions-meta.json, concepts.json,
 *   vocabulary.json, patterns.json, mocks.json, revision-plan.json,
 *   markdown/ (copies) + markdown-index.json, import-summary.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsvObjects } from './lib/csv.mjs';
import { parseVtt, hasWebVttHeader } from './lib/vtt.mjs';
import { parseMocks } from './lib/parse-mocks.mjs';
import { parseRevisionPlan } from './lib/parse-plan.mjs';
import { parseVocabulary } from './lib/parse-vocab.mjs';
import { parsePatternConcepts } from './lib/parse-patterns.mjs';
import { extractFromMarkdown } from './lib/links.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASH_ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = process.env.SOURCE_ROOT
  ? path.resolve(process.env.SOURCE_ROOT)
  : path.resolve(DASH_ROOT, '..');
const PACK = path.join(SOURCE_ROOT, 'German-I-Study-Pack');
const ANALYSIS = path.join(SOURCE_ROOT, 'German-I-Exam-Prep-Output');
const OUT_DATA = path.join(DASH_ROOT, 'public', 'data');
const OUT_VTT = path.join(OUT_DATA, 'transcripts');
const OUT_Q = path.join(OUT_DATA, 'questions');
const OUT_MD = path.join(OUT_DATA, 'markdown');

const summary = {
  generatedAt: new Date().toISOString(),
  sourceRoot: SOURCE_ROOT,
  counts: {},
  skippedFiles: [],
  warnings: [],
  errors: [],
};

function die(msg) {
  summary.errors.push(msg);
  console.error(`[import] ERROR: ${msg}`);
  process.exitCode = 1;
}

function mustExist(p, label) {
  if (!fs.existsSync(p)) {
    die(`missing required ${label}: ${p}`);
    return false;
  }
  return true;
}

function readJson(p, label) {
  const raw = fs.readFileSync(p, 'utf8');
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (e) {
    die(`malformed JSON in ${label || p}: ${e.message}`);
    throw e;
  }
}

function readText(p) {
  return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj));
}

function walkFiles(dir, filter, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.nptel-browser-profile') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, filter, acc);
    else if (filter(entry.name, full)) acc.push(full);
  }
  return acc;
}

function repoRel(absPath) {
  return path.relative(SOURCE_ROOT, absPath).split(path.sep).join('/');
}

function dashRelFromRepo(repoPath) {
  // path of a source file as referenced from the dashboard project (..)
  return `../${repoPath}`;
}

function stripHtml(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function weekNumFromLabel(label) {
  const m = /Week\s*(\d{1,2})/i.exec(String(label || ''));
  return m ? Number(m[1]) : null;
}

// ---------- validate required inputs ----------
const requiredInputs = [
  [path.join(PACK, 'course-overview.md'), 'course-overview.md'],
  [path.join(PACK, 'outline.json'), 'outline.json'],
  [path.join(PACK, 'lessons-index.csv'), 'lessons-index.csv'],
  [path.join(PACK, 'assignments-index.csv'), 'assignments-index.csv'],
  [path.join(PACK, 'transcripts-index.csv'), 'transcripts-index.csv'],
  [path.join(PACK, 'video-links.csv'), 'video-links.csv'],
  [path.join(PACK, 'all-links.csv'), 'all-links.csv'],
  [path.join(ANALYSIS, 'question_bank_analysis.json'), 'question_bank_analysis.json'],
  [path.join(ANALYSIS, 'analysis_summary.json'), 'analysis_summary.json'],
  [path.join(ANALYSIS, '00_Corpus_Audit.md'), '00_Corpus_Audit.md'],
  [path.join(ANALYSIS, '01_Recurring_Patterns.md'), '01_Recurring_Patterns.md'],
  [path.join(ANALYSIS, '02_German_Grammar_Cheat_Sheet.md'), '02_German_Grammar_Cheat_Sheet.md'],
  [path.join(ANALYSIS, '03_Vocabulary_Master.md'), '03_Vocabulary_Master.md'],
  [path.join(ANALYSIS, '04_Important_Questions_and_Answers.md'), '04_Important_Questions_and_Answers.md'],
  [path.join(ANALYSIS, '05_Three_Mock_Tests.md'), '05_Three_Mock_Tests.md'],
  [path.join(ANALYSIS, '06_Seven_Day_Revision_Plan.md'), '06_Seven_Day_Revision_Plan.md'],
  [path.join(ANALYSIS, '07_Source_Map_and_Evidence.md'), '07_Source_Map_and_Evidence.md'],
];
let inputsOk = true;
for (const [p, label] of requiredInputs) {
  if (!mustExist(p, label)) inputsOk = false;
}
if (!inputsOk) {
  writeJson(path.join(OUT_DATA, 'import-summary.json'), summary);
  console.error('[import] Aborting: required inputs missing.');
  process.exit(1);
}

// ---------- clean output dirs (only inside dashboard) ----------
for (const dir of [OUT_DATA, OUT_VTT, OUT_Q, OUT_MD]) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

// ---------- course info ----------
const outline = readJson(path.join(PACK, 'outline.json'), 'outline.json');
const courseInfo = outline?.course_info?.course || {};
const overviewMd = readText(path.join(PACK, 'course-overview.md'));

// Week theme/grammar from course-overview.md plain lines
const weekSyllabus = {};
const weekLineRe = /^Week\s+(\d+):\s*(.+)$/gm;
let wm;
while ((wm = weekLineRe.exec(overviewMd)) !== null) {
  const n = Number(wm[1]);
  const rest = wm[2].replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
  const gSplit = /\/?\s*Grammar\s*:\s*/i.exec(rest);
  let theme = rest; let grammar = '';
  if (gSplit) {
    theme = rest.slice(0, gSplit.index).replace(/^Themes?\s*:\s*/i, '').replace(/\/\s*$/, '').trim();
    grammar = rest.slice(gSplit.index + gSplit[0].length).trim();
  }
  weekSyllabus[n] = { theme, grammar };
}

// Books/web resources links from overview (bare URLs + markdown)
const overviewLinks = extractFromMarkdown(overviewMd, { fileRelPath: 'German-I-Study-Pack/course-overview.md' });

// HTML books_and_references anchors (source HTML — extract only, never inject)
const booksHtmlLinks = [];
{
  const html = String(courseInfo.books_and_references || '');
  const re = /<a\s+[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    booksHtmlLinks.push({ url: m[1], label: m[2].replace(/<[^>]*>/g, '').trim() });
  }
}

const course = {
  title: 'German I Study Desk',
  courseName: 'German - I',
  courseCode: 'noc26_hs174',
  instructor: courseInfo.explorer_instructor_name || 'Prof. Milind Brahme',
  examDateRendered: '25 October 2026',
  examDateRawMetadata: courseInfo.exam_date || '',
  sessions: ['Morning session 9am to 12 noon', 'Afternoon session 2pm to 5pm'],
  scoringNote: 'Average assignment score = 25% of best 8 of 12 assignments; Exam score = 75%. Certificate requires assignment ≥ 10/25 AND exam ≥ 30/75. Verify against the current official course notice.',
  certificateFee: 'Optional certification exam fee listed as Rs 1000/-. Verify officially.',
  textbook: 'NETZWERK Deutsch als Fremdsprache A1 (Goyal, New Delhi, 2015)',
  otherBooks: ['Schulz-Griesbach: Deutsch als Fremdsprache. Grundstufe in einem Band (for Grammar)'],
  syllabus: weekSyllabus,
  webResourcesFromOverview: overviewLinks.occurrences.filter((o) => o.linkKind === 'external'),
  webResourcesFromOutlineHtml: booksHtmlLinks,
  disclaimers: [
    'Local study tool — not an official NPTEL site.',
    'Exam paper structure (question count, timing, negative marking) is not established by the local corpus.',
    'Answer keys are present only where the scraped assignment data included them.',
  ],
};

// ---------- indexes ----------
const lessonsIndex = parseCsvObjects(readText(path.join(PACK, 'lessons-index.csv')));
const assignmentsIndex = parseCsvObjects(readText(path.join(PACK, 'assignments-index.csv')));
const transcriptsIndex = parseCsvObjects(readText(path.join(PACK, 'transcripts-index.csv')));
const videoLinks = parseCsvObjects(readText(path.join(PACK, 'video-links.csv')));
const allLinks = parseCsvObjects(readText(path.join(PACK, 'all-links.csv')));

summary.counts.lessonsIndexRows = lessonsIndex.length;
summary.counts.assignmentsIndexRows = assignmentsIndex.length;
summary.counts.transcriptsIndexRows = transcriptsIndex.length;
summary.counts.videoLinksRows = videoLinks.length;
summary.counts.allLinksRows = allLinks.length;

// ---------- questions ledger ----------
const bank = readJson(path.join(ANALYSIS, 'question_bank_analysis.json'), 'question_bank_analysis.json');
if (!Array.isArray(bank)) die('question_bank_analysis.json is not an array');

const PROVENANCE_DISPLAY = {
  'course-accepted-response-list': 'Course accepted response',
  'student-full-score-inference': 'Inferred from full-score submission',
  none: 'No local answer key',
};
const VALIDATION_DISPLAY = {
  ok: 'Course accepted response',
  'inferred-from-student-score': 'Inferred from full-score submission',
  'answer-unavailable': 'No local answer key',
  'stimulus-external-no-local-answer': 'No local answer key',
  'instruction-block': 'Instruction block',
};

// ---------- stimuli (audio/images captured by extract-stimuli.mjs) ----------
// stimuli-map.json maps "assignmentId:questionIndex" -> [{kind,url,localPath,status}]
// localPath is relative to the pack root (stimuli/images/… or stimuli/audio/…).
const stimuliMapPath = path.join(PACK, 'stimuli-map.json');
let stimuliByKey = {};
let stimuliMeta = null;
if (fs.existsSync(stimuliMapPath)) {
  const smap = readJson(stimuliMapPath, 'stimuli-map.json');
  stimuliMeta = smap.counts || null;
  for (const [key, list] of Object.entries(smap.questions || {})) {
    const media = (Array.isArray(list) ? list : [])
      .filter((m) => m && m.localPath && (m.status === 'downloaded' || m.status === 'cached'))
      .map((m) => ({
        kind: m.kind === 'audio' ? 'audio' : 'image',
        // localPath is relative to the pack root (stimuli/…); files are copied
        // under public/data/media/, so the served path gains the media/ prefix.
        src: `media/${m.localPath}`,
        sourceUrl: m.sourceUrl || m.url || '',
      }));
    if (media.length) stimuliByKey[key] = media;
  }
} else {
  summary.warnings.push('stimuli-map.json not found — run scripts/extract-stimuli.mjs to attach audio/images to questions.');
}

function normalizeQuestion(q) {
  const provenance = PROVENANCE_DISPLAY[q.answerSource] || PROVENANCE_DISPLAY.none;
  const validationDisplay = VALIDATION_DISPLAY[q.validationStatus] || provenance;
  const stimulusMedia = stimuliByKey[`${q.assignmentId}:${q.questionIndex}`] || [];
  const normalized = {
    id: `${q.assignmentId}-${q.questionIndex}-${q.questionId}`,
    weekNum: q.weekNum,
    week: q.week,
    assignmentId: q.assignmentId,
    assignmentTitle: q.assignmentTitle,
    questionIndex: q.questionIndex,
    questionId: q.questionId,
    questionClass: q.questionClass,
    isInstruction: q.questionClass === 'instruction-block',
    displayNumber: q.displayNumber,
    points: q.points,
    questionText: q.questionText,
    stimulus: q.stimulus,
    options: (q.options || []).map((o) => ({ index: o.index, text: o.text })),
    recommendedAnswer: q.recommendedAnswer || [],
    recordedAnswers: q.recordedAnswers || [],
    correctChoiceAnswers: q.correctChoiceAnswers || [],
    answerSource: q.answerSource,
    provenance,
    validationStatus: q.validationStatus,
    validationDisplay,
    studentResponse: q.studentResponse || '',
    studentScore: q.studentScore,
    concepts: q.concepts || [],
    theme: q.theme,
    stimulusExternal: !!q.stimulusExternal,
    stimulusMedia,
    sourcePath: q.sourcePath,
  };
  return applyOverlay(normalized);
}

// ---------- dashboard-local overlay (hand-reviewed corrections) ----------
// scripts/question-audit/question-overlays.json is applied after normalisation
// so `npm run import-data` keeps approved corrections without touching the
// read-only source corpora. Only whitelisted fields may be overridden.
const OVERLAY_PATH = path.join(DASH_ROOT, 'scripts', 'question-audit', 'question-overlays.json');
const OVERLAY_ALLOWED = new Set(['questionText', 'stimulus', 'recommendedAnswer', 'recordedAnswers', 'options', 'concepts', 'theme']);
let overlayDoc = { questions: {} };
if (fs.existsSync(OVERLAY_PATH)) {
  overlayDoc = readJson(OVERLAY_PATH, 'question-overlays.json');
  for (const [id, entry] of Object.entries(overlayDoc.questions || {})) {
    const bad = Object.keys(entry?.fields || {}).filter((f) => !OVERLAY_ALLOWED.has(f));
    if (bad.length) die(`overlay ${id} overrides non-whitelisted fields: ${bad.join(', ')}`);
  }
} else {
  summary.warnings.push('question-overlays.json not found — regeneration will not preserve hand-reviewed corrections.');
}
let overlaysApplied = 0;
function applyOverlay(normalized) {
  const entry = overlayDoc.questions?.[normalized.id];
  if (!entry || !entry.fields) return normalized;
  overlaysApplied += 1;
  return { ...normalized, ...entry.fields };
}


const questionsByWeek = {};
for (let w = 1; w <= 12; w += 1) questionsByWeek[w] = [];
const allNormalized = bank.map(normalizeQuestion);
summary.counts.overlaysApplied = overlaysApplied;
for (const q of allNormalized) {
  if (!questionsByWeek[q.weekNum]) questionsByWeek[q.weekNum] = [];
  questionsByWeek[q.weekNum].push(q);
}

let realCount = 0; let instructionCount = 0;
const byClass = {}; const byValidation = {}; const byProvenance = {};
let stimulusExternal = 0; let stimulusExternalWithMedia = 0; let blocksWithMedia = 0;
let mediaRefs = 0;
for (const q of allNormalized) {
  if (q.stimulusMedia.length) {
    blocksWithMedia += 1;
    mediaRefs += q.stimulusMedia.length;
  }
  if (q.isInstruction) { instructionCount += 1; continue; }
  realCount += 1;
  byClass[q.questionClass] = (byClass[q.questionClass] || 0) + 1;
  byValidation[q.validationStatus] = (byValidation[q.validationStatus] || 0) + 1;
  byProvenance[q.provenance] = (byProvenance[q.provenance] || 0) + 1;
  if (q.stimulusExternal) {
    stimulusExternal += 1;
    if (q.stimulusMedia.length) stimulusExternalWithMedia += 1;
  }
}

// Copy downloaded stimulus media into public/data/media/ (private edition only;
// build-public-data.mjs must exclude this folder).
const OUT_MEDIA = path.join(OUT_DATA, 'media');
let mediaFilesCopied = 0; let mediaBytesCopied = 0;
const stimSrcDir = path.join(PACK, 'stimuli');
if (fs.existsSync(stimSrcDir)) {
  for (const sub of ['images', 'audio']) {
    const from = path.join(stimSrcDir, sub);
    if (!fs.existsSync(from)) continue;
    const to = path.join(OUT_MEDIA, 'stimuli', sub);
    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(from)) {
      const srcFile = path.join(from, f);
      if (!fs.statSync(srcFile).isFile()) continue;
      fs.copyFileSync(srcFile, path.join(to, f));
      mediaFilesCopied += 1;
      mediaBytesCopied += fs.statSync(srcFile).size;
    }
  }
}

summary.counts.questionBlocks = allNormalized.length;
summary.counts.realQuestions = realCount;
summary.counts.instructionBlocks = instructionCount;
summary.counts.stimulusExternal = stimulusExternal;
summary.counts.stimulusExternalWithLocalMedia = stimulusExternalWithMedia;
summary.counts.blocksWithStimulusMedia = blocksWithMedia;
summary.counts.stimulusMediaRefs = mediaRefs;
summary.counts.stimulusMediaFilesCopied = mediaFilesCopied;
summary.counts.stimulusMediaBytesCopied = mediaBytesCopied;

for (let w = 1; w <= 12; w += 1) {
  writeJson(path.join(OUT_Q, `week-${w}.json`), {
    weekNum: w,
    blocks: questionsByWeek[w],
    realCount: questionsByWeek[w].filter((q) => !q.isInstruction).length,
    instructionCount: questionsByWeek[w].filter((q) => q.isInstruction).length,
  });
}

const questionsMeta = {
  totalBlocks: allNormalized.length,
  realQuestions: realCount,
  instructionBlocks: instructionCount,
  byClass,
  byValidation,
  byProvenance,
  stimulusExternal,
  stimulusExternalWithLocalMedia: stimulusExternalWithMedia,
  blocksWithStimulusMedia: blocksWithMedia,
  stimulusMediaFiles: mediaFilesCopied,
  weeks: Array.from({ length: 12 }, (_, i) => i + 1),
};
writeJson(path.join(OUT_DATA, 'questions-meta.json'), questionsMeta);

// ---------- concepts (recomputed from ledger + patterns md) ----------
const patternsMd = readText(path.join(ANALYSIS, '01_Recurring_Patterns.md'));
const patternConcepts = parsePatternConcepts(patternsMd);
const conceptAgg = {};
for (const q of allNormalized) {
  if (q.isInstruction) continue;
  for (const c of q.concepts) {
    if (!conceptAgg[c]) conceptAgg[c] = { concept: c, questionCount: 0, weeks: new Set(), assignments: new Set(), pointSum: 0 };
    const agg = conceptAgg[c];
    agg.questionCount += 1;
    agg.weeks.add(q.weekNum);
    agg.assignments.add(q.assignmentId);
    agg.pointSum += Number(q.points) || 0;
  }
}
const conceptTable = Object.values(conceptAgg)
  .map((c) => ({
    concept: c.concept,
    questionCount: c.questionCount,
    weekCount: c.weeks.size,
    weeks: [...c.weeks].sort((a, b) => a - b),
    assignmentCount: c.assignments.size,
    pointSum: Math.round(c.pointSum * 10) / 10,
    // pattern-doc extras (may be absent for less common tags)
    priority: (patternConcepts.find((p) => p.concept === c.concept) || {}).priority || '',
    confidence: (patternConcepts.find((p) => p.concept === c.concept) || {}).confidence || '',
    taskShape: (patternConcepts.find((p) => p.concept === c.concept) || {}).taskShape || '',
  }))
  .sort((a, b) => b.questionCount - a.questionCount);

const themeAgg = {};
for (const q of allNormalized) {
  if (q.isInstruction) continue;
  if (!q.theme) continue;
  if (!themeAgg[q.theme]) themeAgg[q.theme] = { theme: q.theme, questionCount: 0, weeks: new Set() };
  themeAgg[q.theme].questionCount += 1;
  themeAgg[q.theme].weeks.add(q.weekNum);
}
const themeTable = Object.values(themeAgg)
  .map((t) => ({ theme: t.theme, questionCount: t.questionCount, weekCount: t.weeks.size, weeks: [...t.weeks].sort((a, b) => a - b) }))
  .sort((a, b) => b.questionCount - a.questionCount);

writeJson(path.join(OUT_DATA, 'concepts.json'), {
  overlapNote: 'A question can carry multiple concept tags, so concept counts overlap and must not be added together as unique questions. Frequency reflects assignment practice in this course, not a prediction of the final exam.',
  table: conceptTable,
  themes: themeTable,
  patternDocConcepts: patternConcepts,
});
summary.counts.concepts = conceptTable.length;

// ---------- lessons ----------
const weekLessonFiles = {}; // weekNum -> [{md,json}]
for (let w = 1; w <= 12; w += 1) {
  const dir = path.join(PACK, 'weeks', `Week-${w}`);
  const mds = walkFiles(dir, (n) => n.endsWith('.md'));
  weekLessonFiles[w] = mds.map((mdPath) => {
    const jsonPath = mdPath.replace(/\.md$/, '.json');
    return { mdPath, jsonPath };
  });
}

const transcriptBySavedAs = {};
for (const row of transcriptsIndex) {
  const saved = String(row.savedAs || '').split('/').pop();
  transcriptBySavedAs[saved] = row;
}

const lessons = [];
for (const idx of lessonsIndex) {
  const lessonId = Number(idx.lessonId);
  const unit = idx.unit || '';
  const weekNum = weekNumFromLabel(unit);
  // find matching week json
  let lessonJson = null; let mdRel = null; let jsonRel = null;
  if (weekNum && weekLessonFiles[weekNum]) {
    for (const pair of weekLessonFiles[weekNum]) {
      if (!fs.existsSync(pair.jsonPath)) { summary.skippedFiles.push({ path: repoRel(pair.jsonPath), reason: 'missing json pair' }); continue; }
      const j = readJson(pair.jsonPath, repoRel(pair.jsonPath));
      if (Number(j.lessonId) === lessonId) {
        lessonJson = j;
        mdRel = repoRel(pair.mdPath);
        jsonRel = repoRel(pair.jsonPath);
        break;
      }
    }
  }
  // transcript mapping: transcripts-index savedAs like transcripts/Week-1-english-17.vtt
  let vttRow = null;
  if (lessonJson) {
    const candidate = `Week-${weekNum}-english-${lessonId}.vtt`;
    vttRow = transcriptBySavedAs[candidate] || null;
    if (!vttRow) {
      // match by lesson title
      for (const row of transcriptsIndex) {
        if (row.lesson && idx.title && row.lesson.trim() === idx.title.trim()) { vttRow = row; break; }
      }
    }
  } else if (weekNum) {
    for (const row of transcriptsIndex) {
      if (Number(row.unit?.replace(/\D/g, '')) === weekNum && row.lesson === idx.title) { vttRow = row; break; }
    }
  }
  const vttFile = vttRow ? String(vttRow.savedAs || '').split('/').pop() : null;
  const localVttExists = vttFile ? fs.existsSync(path.join(PACK, 'transcripts', vttFile)) : false;

  lessons.push({
    lessonId,
    unit,
    title: idx.title,
    type: lessonJson?.type || idx.type || '',
    weekNum,
    videoUrl: lessonJson?.ytWatch || idx.videoUrl || '',
    videoId: lessonJson?.videoId || '',
    hasLocalVtt: localVttExists,
    vttFile: localVttExists ? vttFile : null,
    vttRemoteUrl: vttRow?.url || (lessonJson?.subtitles ? Object.values(lessonJson.subtitles)[0] : '') || '',
    vttLanguageLabel: vttRow?.language || 'English',
    links: lessonJson?.links || [],
    mdRelPath: mdRel,
    jsonRelPath: jsonRel,
    isWeekLesson: !!(weekNum && mdRel),
  });
}
summary.counts.lessons = lessons.length;

// ---------- assignments ----------
const assignments = [];
for (const row of assignmentsIndex) {
  const weekNum = weekNumFromLabel(row.unit || row.title);
  const aid = Number(row.assessmentId);
  const mdPath = path.join(PACK, 'assignments', `${row.unit.replace(/\s+/g, '-')}-${row.title.replace(/[:?]/g, '').replace(/\s+/g, '-')}-${aid}.md`);
  // find actual md by scanning
  let mdRel = null;
  const assignDir = path.join(PACK, 'assignments');
  for (const f of fs.readdirSync(assignDir)) {
    if (f.endsWith(`-${aid}.md`)) { mdRel = repoRel(path.join(assignDir, f)); break; }
  }
  const real = questionsByWeek[weekNum] ? questionsByWeek[weekNum].filter((q) => !q.isInstruction && q.assignmentId === aid).length : 0;
  assignments.push({
    assessmentId: aid,
    weekNum,
    unit: row.unit,
    title: row.title,
    dueDate: row.dueDate,
    submittedFlag: row.submitted,
    indexQuestionBlocks: Number(row.questions) || null,
    realQuestions: real,
    mdRelPath: mdRel,
  });
}
summary.counts.assignments = assignments.length;

// ---------- weeks ----------
const weeks = [];
for (let w = 1; w <= 12; w += 1) {
  const weekLessons = lessons.filter((l) => l.weekNum === w && l.isWeekLesson);
  const assignment = assignments.find((a) => a.weekNum === w) || null;
  const transcriptCount = weekLessons.filter((l) => l.hasLocalVtt).length;
  weeks.push({
    weekNum: w,
    theme: weekSyllabus[w]?.theme || '',
    grammar: weekSyllabus[w]?.grammar || '',
    lessonIds: weekLessons.map((l) => l.lessonId),
    lessonCount: weekLessons.length,
    assignmentId: assignment?.assessmentId || null,
    assignmentTitle: assignment?.title || '',
    assignmentDue: assignment?.dueDate || '',
    realQuestions: questionsByWeek[w].filter((q) => !q.isInstruction).length,
    transcriptCount,
  });
}

// ---------- transcripts (parse VTT, emit cue JSON) ----------
const transcripts = [];
for (const row of transcriptsIndex) {
  const savedAs = String(row.savedAs || '');
  const fileName = savedAs.split('/').pop();
  const abs = path.join(PACK, 'transcripts', fileName);
  if (!fs.existsSync(abs)) {
    summary.skippedFiles.push({ path: savedAs, reason: 'index lists VTT but file missing on disk' });
    continue;
  }
  const raw = fs.readFileSync(abs, 'utf8');
  const parsed = parseVtt(raw);
  const weekNum = weekNumFromLabel(row.unit) ?? weekNumFromLabel(fileName);
  writeJson(path.join(OUT_VTT, `${fileName}.json`), {
    file: fileName,
    weekNum,
    unit: row.unit,
    lesson: row.lesson,
    languageLabel: row.language,
    remoteUrl: row.url,
    headerOk: parsed.headerOk,
    asrNote: 'Auto-generated subtitles (ASR): mixed German–English, may contain errors and missing umlauts (e.g. "M chte" for möchte). Raw text kept as-is.',
    cues: parsed.cues,
  });
  transcripts.push({
    file: fileName,
    weekNum,
    unit: row.unit,
    lesson: row.lesson,
    languageLabel: row.language,
    remoteUrl: row.url,
    localPath: savedAs,
    headerOk: parsed.headerOk,
    cueCount: parsed.cues.length,
    durationSec: parsed.cues.length ? parsed.cues[parsed.cues.length - 1].endSec : 0,
    issues: parsed.issues,
  });
}
summary.counts.transcripts = transcripts.length;
summary.counts.vttHeaderOk = transcripts.filter((t) => t.headerOk).length;

writeJson(path.join(OUT_DATA, 'transcripts.json'), {
  asrNote: 'Auto-generated subtitles (ASR): mixed German–English, may contain errors and missing umlauts. Raw text is kept as-is.',
  files: transcripts,
});

// ---------- video links ----------
writeJson(path.join(OUT_DATA, 'video-links.json'), videoLinks.map((v) => ({
  type: v.type, title: v.title, url: v.url, embedUrl: v.embedUrl, unit: v.unit, lessonId: Number(v.lessonId),
})));

// ---------- vocabulary / mocks / plan ----------
const vocabMd = readText(path.join(ANALYSIS, '03_Vocabulary_Master.md'));
const vocab = parseVocabulary(vocabMd);
writeJson(path.join(OUT_DATA, 'vocabulary.json'), {
  overlapNote: 'Entries come from the course vocabulary tables. Evidence is kept exactly as written.',
  sections: vocab.sections,
  entries: vocab.entries,
});
summary.counts.vocabularyEntries = vocab.entries.length;

const mocksMd = readText(path.join(ANALYSIS, '05_Three_Mock_Tests.md'));
const mocks = parseMocks(mocksMd);
writeJson(path.join(OUT_DATA, 'mocks.json'), mocks);
summary.counts.mocks = mocks.mocks.length;
summary.counts.mockItems = mocks.mocks.map((m) => ({ mock: m.mockNumber, items: m.itemCount }));

const planMd = readText(path.join(ANALYSIS, '06_Seven_Day_Revision_Plan.md'));
const plan = parseRevisionPlan(planMd);
writeJson(path.join(OUT_DATA, 'revision-plan.json'), plan);
summary.counts.planDays = plan.days.length;
summary.counts.planTasks = plan.totalTasks;

// ---------- markdown copies + index ----------
function copyMarkdownTree(srcDir, provenance) {
  const files = walkFiles(srcDir, (n) => n.endsWith('.md'));
  const indexEntries = [];
  for (const abs of files) {
    const rel = repoRel(abs);
    const dest = path.join(OUT_MD, rel.split('/').join(path.sep));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(abs, dest);
    const text = readText(abs);
    const titleMatch = /^#\s+(.+)$/m.exec(text);
    const headings = [];
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      const h = /^(#{1,3})\s+(.+)$/.exec(line);
      if (h) headings.push({ level: h[1].length, text: h[2].trim(), line: i + 1 });
    });
    const weekNum = weekNumFromLabel(rel) ?? (/Week-(\d+)/.exec(rel) ? Number(/Week-(\d+)/.exec(rel)[1]) : null);
    indexEntries.push({
      id: rel,
      relPath: rel,
      title: titleMatch ? titleMatch[1].trim() : path.basename(rel, '.md'),
      provenance,
      weekNum: /^German-I-Study-Pack\/weeks\/Week-\d+/.test(rel) || /^German-I-Study-Pack\/assignments\//.test(rel) ? weekNum : null,
      byteSize: Buffer.byteLength(text, 'utf8'),
      headings,
      hasLinks: extractFromMarkdown(text, { fileRelPath: rel }).occurrences.length > 0,
    });
  }
  return indexEntries;
}

const packMdIndex = copyMarkdownTree(PACK, 'course-corpus');
const anaMdIndex = copyMarkdownTree(ANALYSIS, 'exam-prep-analysis');
writeJson(path.join(OUT_DATA, 'markdown-index.json'), {
  files: [...packMdIndex, ...anaMdIndex],
  packCount: packMdIndex.length,
  analysisCount: anaMdIndex.length,
});
summary.counts.markdownCopies = packMdIndex.length + anaMdIndex.length;

// ---------- week syllabus + course write ----------
writeJson(path.join(OUT_DATA, 'course.json'), course);
writeJson(path.join(OUT_DATA, 'weeks.json'), weeks);
writeJson(path.join(OUT_DATA, 'lessons.json'), lessons);
writeJson(path.join(OUT_DATA, 'assignments.json'), assignments);

// ---------- manifest ----------
const manifest = {
  generatedAt: summary.generatedAt,
  app: 'German I Study Desk',
  edition: 'local',
  disclaimer: 'Local study tool — not an official NPTEL site.',
  files: [
    { name: 'course.json', description: 'Course metadata, syllabus per week, web resources extracted from course HTML' },
    { name: 'weeks.json', description: '12 weeks with theme, grammar, lesson/assignment/question counts' },
    { name: 'lessons.json', description: '77 indexed lessons enriched with video/VTT/links/paths' },
    { name: 'assignments.json', description: '12 weekly assignments with real question counts' },
    { name: 'transcripts.json', description: '46 VTT files index (cues under transcripts/<file>.json)' },
    { name: 'questions/week-1..12.json', description: 'Question ledger split by week (real + instruction blocks)' },
    { name: 'questions-meta.json', description: 'Ledger totals by class/provenance/validation' },
    { name: 'concepts.json', description: 'Concept + theme tables with overlap note' },
    { name: 'vocabulary.json', description: 'Structured vocabulary from 03_Vocabulary_Master.md tables' },
    { name: 'concepts.json', description: 'Concept + theme tables with overlap note; also embeds pattern priorities from 01_Recurring_Patterns.md as patternDocConcepts' },
    { name: 'mocks.json', description: 'Three ASSUMED-format mock tests parsed from 05' },
    { name: 'revision-plan.json', description: 'Seven-day plan parsed from 06' },
    { name: 'markdown/ + markdown-index.json', description: 'Safe copies of source Markdown for the in-app reader' },
    { name: 'media/stimuli/', description: 'Course audio (Drive) and images (GCS) attached to question cards; private edition only' },
    { name: 'study-resources.json', description: 'Link catalog (generated by import-study-resources.mjs)' },
  ],
  counts: summary.counts,
};
writeJson(path.join(OUT_DATA, 'manifest.json'), manifest);
writeJson(path.join(OUT_DATA, 'import-summary.json'), summary);

console.log('[import] course data written to public/data/');
console.log(JSON.stringify(summary.counts, null, 2));
if (summary.errors.length) {
  console.error('[import] errors:', summary.errors);
  process.exit(1);
}
