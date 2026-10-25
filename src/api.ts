/**
 * Typed fetchers for generated JSON data.
 *
 * Two data bases ship with the app:
 *   data/         – full local corpus (lessons, transcripts, questions, mocks, …)
 *   data-public/  – public-safe subset (course metadata, syllabus, lesson index,
 *                   assignment titles, link catalog, revision plan)
 *
 * At runtime we detect which base is present. A deployed site serves only
 * data-public/ (see scripts/build-public-data.mjs), so pages that need the
 * excluded content are gated by the `publicOnly` flag instead of throwing.
 */

const cache = new Map<string, unknown>();
let base: string | null = null;

/**
 * The full local corpus manifest carries `edition: "local"` (written by
 * import-course-data.mjs). The public-safe subset manifest carries
 * `edition: "public"` (written by build-public-data.mjs). A deployed site
 * serves the subset under `data/`, so we cannot use the presence of
 * `data/manifest.json` to mean "local edition" — we must read the marker.
 */
interface DataManifest { edition?: string }

let edition: 'local' | 'public' | null = null;

async function detectBase(): Promise<string> {
  if (base) return base;
  try {
    const r = await fetch('data/manifest.json', { cache: 'no-cache' });
    if (r.ok) {
      const m = (await r.json()) as DataManifest;
      edition = m.edition === 'local' ? 'local' : 'public';
      base = 'data/';
      return base;
    }
  } catch { /* fall through */ }
  base = 'data-public/';
  edition = 'public';
  return base;
}

export function isPublicOnly(): boolean {
  return base === 'data-public/' || base === null;
}

export function dataBase(): string {
  return base ?? 'data-public/';
}

async function fetchRes(rel: string, init?: RequestInit): Promise<Response> {
  const b = await detectBase();
  return fetch(`${b}${rel}`, { cache: 'no-cache', ...init });
}

async function getJson<T>(rel: string): Promise<T> {
  if (cache.has(rel)) return cache.get(rel) as T;
  const res = await fetchRes(rel);
  if (!res.ok) throw new Error(`Failed to load ${dataBase()}${rel}: ${res.status}`);
  const data = (await res.json()) as T;
  cache.set(rel, data);
  return data;
}

export async function getText(rel: string): Promise<string> {
  const key = `text:${rel}`;
  if (cache.has(key)) return cache.get(key) as string;
  const res = await fetchRes(rel);
  if (!res.ok) throw new Error(`Failed to load ${dataBase()}${rel}: ${res.status}`);
  const text = await res.text();
  cache.set(key, text);
  return text;
}

export interface CourseInfo {
  title: string; courseName: string; courseCode: string; instructor: string;
  examDateRendered: string; examDateRawMetadata: string; sessions: string[];
  scoringNote: string; certificateFee: string; textbook: string; otherBooks: string[];
  syllabus: Record<string, { theme: string; grammar: string }>;
  disclaimers: string[];
  counts: Record<string, number>;
}

export interface WeekRow {
  weekNum: number; theme: string; grammar: string; lessonIds: number[];
  lessonCount: number; assignmentId: number | null; assignmentTitle: string | null;
  assignmentDue: string | null; realQuestions: number; transcriptCount: number;
}

export interface LessonRow {
  lessonId: number; unit: string; title: string; type: string; weekNum: number | null;
  videoUrl: string; videoId: string; hasLocalVtt: boolean; vttFile: string | null;
  vttRemoteUrl: string; vttLanguageLabel: string; links: { text: string; url: string }[];
  mdRelPath: string | null; jsonRelPath: string | null; isWeekLesson: boolean;
}

export interface AssignmentRow {
  assessmentId: number; weekNum: number | null; unit: string; title: string;
  dueDate: string | null; submittedFlag: string; indexQuestionBlocks: number;
  realQuestions: number; mdRelPath: string | null;
}

export interface TranscriptIndexEntry {
  file: string; weekNum: number | null; unit: string; lesson: string;
  languageLabel: string; remoteUrl: string; localPath: string;
  headerOk: boolean; cueCount: number; durationSec: number; issues: string[];
}

export interface TranscriptIndex {
  asrNote: string;
  files: TranscriptIndexEntry[];
}

export interface VttCue { index: number; start: string; end: string; startSec: number; endSec: number; text: string }

export interface VttDoc { file: string; headerOk: boolean; cues: VttCue[] }

export interface StimulusMedia {
  kind: 'audio' | 'image';
  /** Path relative to the data root, e.g. media/stimuli/audio/drive-….mp3 */
  src: string;
  sourceUrl: string;
}

export interface QuestionBlock {
  id: string; weekNum: number; week: string; assignmentId: number; assignmentTitle: string;
  questionIndex: number; questionId: string; questionClass: string; isInstruction: boolean;
  displayNumber: number | null; points: number | null; questionText: string; stimulus: string;
  options: { index: number; text: string }[];
  recommendedAnswer: string[]; recordedAnswers: string[]; correctChoiceAnswers: string[];
  answerSource: string; provenance: string; validationStatus: string; validationDisplay: string;
  studentResponse: string | null; studentScore: number | null;
  concepts: string[]; theme: string; stimulusExternal: boolean;
  stimulusMedia: StimulusMedia[];
  sourcePath: string;
}

export interface WeekQuestions {
  weekNum: number; blocks: QuestionBlock[]; realCount: number; instructionCount: number;
}

export interface QuestionsMeta {
  totalBlocks: number; realQuestions: number; instructionBlocks: number;
  byClass: Record<string, number>; byValidation: Record<string, number>;
  byProvenance: Record<string, number>; stimulusExternal: number;
  stimulusExternalWithLocalMedia?: number; blocksWithStimulusMedia?: number;
  weeks: number[];
}

export interface ConceptRow {
  concept: string; questionCount: number; weekCount: number; weeks: number[];
  assignmentCount: number; pointSum: number; priority: string; confidence: string; taskShape: string;
}

export interface PatternConcept {
  concept: string; questionCount: number; weekCount: number; assignmentCount: number;
  pointSum: number; taskShape: string; priority: string; confidence: string;
}

export interface ConceptsDoc {
  overlapNote: string; table: ConceptRow[];
  themes: { theme: string; questionCount: number; weeks: number[] }[];
  patternDocConcepts: PatternConcept[];
}

export interface VocabEntry { german: string; gloss: string; evidence: string; section: string; sourceType: string; headingLine: number }
export interface VocabSection { heading: string; line: number; rowCount: number }
export interface VocabDoc { overlapNote: string; sections: VocabSection[]; entries: VocabEntry[] }

export interface MockItem { num: number; type: string; section: string; prompt: string; options: { letter: string; text: string }[]; answers: string[]; answerRaw: string; evidence: string; points: number }
export interface Mock { mockNumber: number; title: string; focusWeeks: string; assumedFormat: boolean; items: MockItem[]; keyCompact: string; itemCount: number }
export interface MocksDoc { formatDeclaration: string; mocks: Mock[] }

export interface PlanTask { id: string; category: string; text: string }
export interface PlanDay { dayNum: number; dateLabel: string; title: string; tasks: PlanTask[]; taskCount: number }
export interface PlanDoc { examDateText: string; days: PlanDay[]; totalTasks: number }

export interface MdHeading { level: number; text: string; line: number }
export interface MdIndexEntry {
  id: string; relPath: string; title: string; provenance: string;
  weekNum: number | null; byteSize: number; headings: MdHeading[];
}
export interface MarkdownIndex { files: MdIndexEntry[]; packCount: number; analysisCount: number }

export interface ResourceOccurrence {
  sourceFile: string; line: number; label: string; context: string; method: string;
  weekNum: number | null; lessonId: number | null;
}
export interface ResourceRecord {
  id: string; title: string; linkKind: 'external' | 'internal-markdown' | 'internal-resource' | 'file-mention';
  url?: string; relativePath?: string; domain: string; category: string;
  categoryConfidence: string; categoryNote: string; provenance: string;
  weeks: number[]; lessonIds: number[]; sourceKinds: string[];
  occurrenceCount: number; occurrences: ResourceOccurrence[];
}
export interface StudyResourcesDoc {
  generatedAt: string; disclaimer: string;
  summary: {
    distinctResources: number; distinctExternalUrls: number; internalMarkdownLinks: number;
    internalResourceLinks: number; fileMentions: number; fileMentionPatternsSkipped: number;
    fileMentionsUnresolved: number; totalOccurrences: number;
    skipped: Record<string, number>; byCategory: Record<string, number>; markdownFilesScanned: number;
  };
  resources: ResourceRecord[];
}

export interface VideoLinkRow { type: string; title: string; url: string; embedUrl: string; unit: string; lessonId: number | null }

export const api = {
  course: () => getJson<CourseInfo>('course.json'),
  weeks: () => getJson<WeekRow[]>('weeks.json'),
  lessons: () => getJson<LessonRow[]>('lessons.json'),
  assignments: () => getJson<AssignmentRow[]>('assignments.json'),
  transcripts: () => getJson<TranscriptIndex>('transcripts.json'),
  vtt: (file: string) => getJson<VttDoc>(`transcripts/${encodeURIComponent(file)}.json`),
  weekQuestions: (w: number) => getJson<WeekQuestions>(`questions/week-${w}.json`),
  questionsMeta: () => getJson<QuestionsMeta>('questions-meta.json'),
  concepts: () => getJson<ConceptsDoc>('concepts.json'),
  vocabulary: () => getJson<VocabDoc>('vocabulary.json'),
  mocks: () => getJson<MocksDoc>('mocks.json'),
  plan: () => getJson<PlanDoc>('revision-plan.json'),
  markdownIndex: () => getJson<MarkdownIndex>('markdown-index.json'),
  resources: () => getJson<StudyResourcesDoc>('study-resources.json'),
  videoLinks: () => getJson<VideoLinkRow[]>('video-links.json'),
  markdownText: (id: string) => getText(`markdown/${id}`),
};

export class DataMissingError extends Error {
  constructor(file: string) {
    super(`Data file "${file}" is not available in this edition.`);
    this.name = 'DataMissingError';
  }
}

/** True when a single data file is present in the active data base. */
export async function hasData(rel: string): Promise<boolean> {
  try {
    const res = await fetchRes(rel, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Resolve whether every listed file is available (cached). */
const availCache = new Map<string, boolean>();
export async function hasAllData(rels: string[]): Promise<boolean> {
  const key = rels.join('|');
  if (availCache.has(key)) return availCache.get(key)!;
  const results = await Promise.all(rels.map((r) => hasData(r)));
  const ok = results.every(Boolean);
  availCache.set(key, ok);
  return ok;
}

/** Files required by the richer "local" pages — absent in the public edition. */
export const LOCAL_ONLY_FILES = {
  transcripts: ['transcripts.json'],
  questions: ['questions-meta.json'],
  vocabulary: ['vocabulary.json'],
  mocks: ['mocks.json'],
  concepts: ['concepts.json'],
  reader: ['markdown-index.json'],
} as const;

export type ContentKind = keyof typeof LOCAL_ONLY_FILES;

/** True when the richer local edition is loaded (full corpus). */
export function isLocalEdition(): boolean {
  return edition === 'local';
}

/** Call once before rendering; resolves the data base synchronously. */
export async function initApi(): Promise<string> {
  return detectBase();
}

export function transcriptJsonName(file: string): string {
  return file.endsWith('.vtt') ? file : `${file}.vtt`;
}

/**
 * Returns true when the richer local edition is available for this page (i.e.
 * the data files it needs are present). Resolves the base on first use.
 *
 * Pages call this at the top of their render and, when it returns false,
 * render the shared `contentGate()` (from ui.ts) instead of the full page.
 */
export async function gate(files: readonly string[]): Promise<boolean> {
  await detectBase();
  if (!isLocalEdition()) return false;
  return hasAllData([...files]);
}
