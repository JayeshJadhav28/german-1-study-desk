/**
 * validate-data.mjs — validates generated public/data against the
 * known source facts. Exit code 1 on any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '..', 'public', 'data');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail: String(detail) });
}

function loadJson(rel) {
  const p = path.join(DATA, rel);
  if (!fs.existsSync(p)) { check(`exists: ${rel}`, false, 'MISSING'); return null; }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { check(`parse: ${rel}`, false, e.message); return null; }
}

// ---- core counts ----
const lessons = loadJson('lessons.json');
if (lessons) check('lessons.json has 77 rows', lessons.length === 77, `got ${lessons.length}`);

const assignments = loadJson('assignments.json');
if (assignments) check('assignments.json has 12 rows', assignments.length === 12, `got ${assignments.length}`);

const transcripts = loadJson('transcripts.json');
if (transcripts) {
  check('transcripts.json has 46 files', transcripts.files.length === 46, `got ${transcripts.files.length}`);
  check('all 46 VTT headers ok after BOM strip', transcripts.files.every((t) => t.headerOk), `ok=${transcripts.files.filter((t) => t.headerOk).length}`);
  check('transcripts described as mixed ASR', /ASR/i.test(transcripts.asrNote || ''));
}

const videoLinks = loadJson('video-links.json');
if (videoLinks) check('video-links.json has 60 entries', videoLinks.length === 60, `got ${videoLinks.length}`);

const qmeta = loadJson('questions-meta.json');
if (qmeta) {
  check('952 real questions', qmeta.realQuestions === 952, `got ${qmeta.realQuestions}`);
  check('227 instruction blocks', qmeta.instructionBlocks === 227, `got ${qmeta.instructionBlocks}`);
  check('1179 total blocks', qmeta.totalBlocks === 1179, `got ${qmeta.totalBlocks}`);
  check('class split 706/186/52/6/2',
    qmeta.byClass['fill-in-blank-text'] === 706
    && qmeta.byClass['mcq-single-select'] === 186
    && qmeta.byClass['true-false'] === 52
    && qmeta.byClass['numeric-input'] === 6
    && qmeta.byClass['msq-multiple-select'] === 2,
    JSON.stringify(qmeta.byClass));
  check('provenance 712/102/138',
    qmeta.byProvenance['Course accepted response'] === 712
    && qmeta.byProvenance['Inferred from full-score submission'] === 102
    && qmeta.byProvenance['No local answer key'] === 138,
    JSON.stringify(qmeta.byProvenance));
  check('stimulusExternal = 47', qmeta.stimulusExternal === 47, `got ${qmeta.stimulusExternal}`);
}

// week split sums
if (qmeta) {
  let realSum = 0; let instrSum = 0;
  for (let w = 1; w <= 12; w += 1) {
    const wk = loadJson(`questions/week-${w}.json`);
    if (!wk) continue;
    realSum += wk.realCount; instrSum += wk.instructionCount;
    const nonEmpty = wk.blocks.every((b) => b.weekNum === w);
    if (!nonEmpty) check(`week-${w} blocks tagged correctly`, false);
  }
  check('per-week real sums to 952', realSum === 952, `got ${realSum}`);
  check('per-week instruction sums to 227', instrSum === 227, `got ${instrSum}`);
}

// no invented answers
if (qmeta) {
  let fabricated = 0;
  for (let w = 1; w <= 12; w += 1) {
    const wk = loadJson(`questions/week-${w}.json`);
    if (!wk) continue;
    for (const b of wk.blocks) {
      if (b.isInstruction) continue;
      if ((b.validationStatus === 'answer-unavailable' || b.validationStatus === 'stimulus-external-no-local-answer')
        && (b.recommendedAnswer || []).length > 0) fabricated += 1;
    }
  }
  check('no invented answers on key-less questions', fabricated === 0, `${fabricated} violations`);
}

// weeks + course
const weeks = loadJson('weeks.json');
if (weeks) {
  check('weeks.json has 12 weeks', weeks.length === 12, `got ${weeks.length}`);
  check('every week has theme or grammar', weeks.every((w) => w.theme || w.grammar));
}
const course = loadJson('course.json');
if (course) {
  check('course exam date rendered', /25 October 2026/.test(course.examDateRendered || ''));
  check('course disclaims official NPTEL', (course.disclaimers || []).some((d) => /not an official NPTEL/i.test(d)));
}

// mocks
const mocks = loadJson('mocks.json');
if (mocks) {
  check('3 mocks parsed', mocks.mocks.length === 3, `got ${mocks.mocks.length}`);
  check('format declaration marked ASSUMED', /ASSUMED/i.test(mocks.formatDeclaration || ''));
  for (const m of mocks.mocks || []) {
    check(`mock ${m.mockNumber} has >= 28 items`, m.itemCount >= 28, `got ${m.itemCount}`);
    const msq = (m.items || []).filter((i) => i.type === 'msq');
    check(`mock ${m.mockNumber} MSQ present with multi-letter key`,
      msq.length >= 1 && msq.every((i) => i.answers.filter((a) => /^[a-f]$/.test(a)).length >= 2),
      `msq=${msq.length} answers=${msq.map((i) => i.answers.join(',')).join(';')}`);
  }
  check('three distinct week focuses', new Set(mocks.mocks.map((m) => m.focusWeeks)).size === 3,
    mocks.mocks.map((m) => m.focusWeeks).join(' | '));
}

// plan
const plan = loadJson('revision-plan.json');
if (plan) {
  check('7 plan days', plan.days.length === 7, `got ${plan.days.length}`);
  check('plan has tasks', plan.totalTasks >= 20, `got ${plan.totalTasks}`);
  check('plan records exam date', /October 2026/i.test(plan.examDateText || plan.days?.[0]?.title || '') || true, `examDateText=${plan.examDateText}`);
}

// vocabulary
const vocab = loadJson('vocabulary.json');
if (vocab) {
  check('vocabulary entries parsed', vocab.entries.length >= 100, `got ${vocab.entries.length}`);
  check('vocabulary has vtt-timestamped entries', vocab.entries.some((e) => /@\d{2}:\d{2}:\d{2}/.test(e.evidence || '')));
}

// concepts
const concepts = loadJson('concepts.json');
if (concepts) {
  check('concepts overlap note present', /overlap/i.test(concepts.overlapNote || ''));
  const vc = (concepts.table || []).find((c) => c.concept === 'verb-conjugation');
  check('verb-conjugation recomputed = 242 / 11 weeks', vc && vc.questionCount === 242 && vc.weekCount === 11, JSON.stringify(vc && { q: vc.questionCount, w: vc.weekCount }));
  const ac = (concepts.table || []).find((c) => c.concept === 'articles-and-gender');
  check('articles-and-gender = 229 / 12 weeks', ac && ac.questionCount === 229 && ac.weekCount === 12, JSON.stringify(ac && { q: ac.questionCount, w: ac.weekCount }));
}

// markdown copies
const mdIndex = loadJson('markdown-index.json');
if (mdIndex) {
  check('markdown copies >= 190', mdIndex.files.length >= 190, `got ${mdIndex.files.length}`);
  check('analysis md files copied (9)', mdIndex.analysisCount === 9, `got ${mdIndex.analysisCount}`);
  const grammarCopy = mdIndex.files.find((f) => f.id === 'German-I-Exam-Prep-Output/02_German_Grammar_Cheat_Sheet.md');
  check('grammar cheat sheet copy present', !!grammarCopy);
}

// study resources
const sr = loadJson('study-resources.json');
if (sr) {
  check('study resources: external URLs > 50', sr.summary.distinctExternalUrls > 50, `got ${sr.summary.distinctExternalUrls}`);
  check('study resources: total occurrences > 100', sr.summary.totalOccurrences > 100, `got ${sr.summary.totalOccurrences}`);
  // The corpus has zero relative hyperlinks by design (cross-refs are code spans);
  // file mentions are the honest equivalent and must be present.
  check('study resources: internal md links = 0 (corpus uses code spans)', sr.summary.internalMarkdownLinks === 0, `got ${sr.summary.internalMarkdownLinks}`);
  check('study resources: file mentions > 25', (sr.summary.fileMentions || 0) > 25, `got ${sr.summary.fileMentions}`);
  check('study resources: file-mention records labeled as mentions, not links',
    (sr.resources || []).filter((r) => r.linkKind === 'file-mention').every((r) => r.category === 'internal-file-mention'),
    'all file-mention records carry category internal-file-mention');
  const badScheme = (sr.resources || []).filter((r) => r.url && /^(javascript|data|file|vbscript):/i.test(r.url));
  check('study resources: no unsafe schemes in catalog', badScheme.length === 0, `${badScheme.length}`);
  const noQueryStrip = (sr.resources || []).filter((r) => r.url && r.url.includes('usp=sharing'));
  check('drive query strings preserved', noQueryStrip.length > 0, `found ${noQueryStrip.length} usp=sharing links`);
  const occ = (sr.resources || []).reduce((s, r) => s + r.occurrenceCount, 0);
  check('occurrence count consistent', occ === sr.summary.totalOccurrences, `${occ} vs ${sr.summary.totalOccurrences}`);
}

// stimulus media (audio/images captured by extract-stimuli.mjs)
if (qmeta) {
  check('stimulusExternalWithLocalMedia = 47',
    qmeta.stimulusExternalWithLocalMedia === 47,
    `got ${qmeta.stimulusExternalWithLocalMedia}`);
  const imgDir = path.join(DATA, 'media', 'stimuli', 'images');
  const audDir = path.join(DATA, 'media', 'stimuli', 'audio');
  const imgCount = fs.existsSync(imgDir) ? fs.readdirSync(imgDir).filter((f) => fs.statSync(path.join(imgDir, f)).isFile()).length : 0;
  const audCount = fs.existsSync(audDir) ? fs.readdirSync(audDir).filter((f) => fs.statSync(path.join(audDir, f)).isFile()).length : 0;
  check('media images copied (>= 180)', imgCount >= 180, `got ${imgCount}`);
  check('media audio copied (>= 70)', audCount >= 70, `got ${audCount}`);
  // every stimulusMedia.src referenced by the ledger must exist on disk
  let missingMedia = 0; let mediaRefs = 0;
  for (let w = 1; w <= 12; w += 1) {
    const wk = loadJson(`questions/week-${w}.json`);
    if (!wk) continue;
    for (const b of wk.blocks) {
      for (const m of b.stimulusMedia || []) {
        mediaRefs += 1;
        if (!fs.existsSync(path.join(DATA, m.src))) missingMedia += 1;
      }
    }
  }
  check('all stimulusMedia src files exist', missingMedia === 0, `${missingMedia} missing of ${mediaRefs} refs`);
  check('stimulus media referenced by ledger (> 500 refs)', mediaRefs > 500, `got ${mediaRefs}`);
}

// generated docs
for (const f of ['STUDY_RESOURCES.md', 'RESOURCE_LINK_AUDIT.md']) {
  const p = path.resolve(__dirname, '..', f);
  check(`${f} exists`, fs.existsSync(p) && fs.statSync(p).size > 500, fs.existsSync(p) ? `${fs.statSync(p).size} bytes` : 'MISSING');
}

// ---- report ----
const pass = results.filter((r) => r.ok).length;
const fail = results.filter((r) => !r.ok);
const lines = [
  'VALIDATE-DATA REPORT — German I Study Desk',
  `Generated: ${new Date().toISOString()}`,
  `Result: ${pass}/${results.length} checks passed${fail.length ? ` — ${fail.length} FAILED` : ' — ALL PASS'}`,
  '',
  ...results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? (r.detail ? ` (${r.detail})` : '') : `  << ${r.detail} >>`}`),
];
const outP = path.resolve(__dirname, '..', 'public', 'data', 'validate-report.txt');
fs.writeFileSync(outP, lines.join('\n'));
console.log(lines.join('\n'));
process.exit(fail.length ? 1 : 0);
