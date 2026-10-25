/** Local-only progress store (localStorage). Never leaves the browser. */

const KEY = 'german-i-study-desk:v1';

export interface StoreShape {
  visitedWeeks: number[];
  visitedLessons: number[];
  starredVocab: string[]; // german phrase keys
  missedQuestionIds: string[];
  answeredQuestionIds: string[]; // practice submissions recorded
  questionDrafts: Record<string, string[]>; // selected answers per question id
  planDone: Record<string, boolean>; // task id -> done
  planNotes: Record<string, string>;
  mockAttempts: Record<string, { score: number; total: number; at: string }>;
  bookmarks: { kind: string; id: string; label: string }[];
  lastVisited: { path: string; label: string; at: string } | null;
}

const defaults: StoreShape = {
  visitedWeeks: [],
  visitedLessons: [],
  starredVocab: [],
  missedQuestionIds: [],
  answeredQuestionIds: [],
  questionDrafts: {},
  planDone: {},
  planNotes: {},
  mockAttempts: {},
  bookmarks: [],
  lastVisited: null,
};

let cache: StoreShape | null = null;
const listeners = new Set<() => void>();

function load(): StoreShape {
  if (cache) return cache;
  let loaded: StoreShape;
  try {
    const raw = localStorage.getItem(KEY);
    loaded = raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
  } catch {
    loaded = { ...defaults };
  }
  cache = loaded;
  return loaded;
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(load()));
  } catch {
    /* storage full or unavailable — progress stays in memory only */
  }
  for (const l of listeners) l();
}

export function getState(): StoreShape {
  return load();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetProgress(): void {
  cache = { ...defaults };
  save();
}

export function exportProgress(): string {
  return JSON.stringify(load(), null, 2);
}

export function importProgress(json: string): boolean {
  try {
    const parsed = JSON.parse(json);
    cache = { ...defaults, ...parsed };
    save();
    return true;
  } catch {
    return false;
  }
}

export const actions = {
  markWeekVisited(n: number) {
    const s = load();
    if (!s.visitedWeeks.includes(n)) { s.visitedWeeks = [...s.visitedWeeks, n].sort((a, b) => a - b); save(); }
  },
  markLessonVisited(id: number) {
    const s = load();
    if (!s.visitedLessons.includes(id)) { s.visitedLessons = [...s.visitedLessons, id]; save(); }
  },
  toggleVocabStar(german: string) {
    const s = load();
    s.starredVocab = s.starredVocab.includes(german) ? s.starredVocab.filter((x) => x !== german) : [...s.starredVocab, german];
    save();
  },
  markQuestionMissed(id: string) {
    const s = load();
    if (!s.missedQuestionIds.includes(id)) { s.missedQuestionIds = [...s.missedQuestionIds, id]; save(); }
  },
  markQuestionCorrect(id: string) {
    const s = load();
    if (s.missedQuestionIds.includes(id)) { s.missedQuestionIds = s.missedQuestionIds.filter((x) => x !== id); }
    if (!s.answeredQuestionIds.includes(id)) { s.answeredQuestionIds = [...s.answeredQuestionIds, id]; save(); }
  },
  recordAttempt(id: string, selected: string[], correct: boolean) {
    const s = load();
    s.questionDrafts[id] = selected;
    if (!s.answeredQuestionIds.includes(id)) s.answeredQuestionIds = [...s.answeredQuestionIds, id];
    if (correct) s.missedQuestionIds = s.missedQuestionIds.filter((x) => x !== id);
    else if (!s.missedQuestionIds.includes(id)) s.missedQuestionIds = [...s.missedQuestionIds, id];
    save();
  },
  setPlanDone(taskId: string, done: boolean) {
    const s = load();
    s.planDone[taskId] = done;
    save();
  },
  setPlanNote(taskId: string, note: string) {
    const s = load();
    if (note) s.planNotes[taskId] = note; else delete s.planNotes[taskId];
    save();
  },
  recordMockAttempt(mockNumber: number, score: number, total: number) {
    const s = load();
    s.mockAttempts[String(mockNumber)] = { score, total, at: new Date().toISOString() };
    save();
  },
  setLastVisited(path: string, label: string) {
    const s = load();
    s.lastVisited = { path, label, at: new Date().toISOString() };
    save();
  },
  toggleBookmark(kind: string, id: string, label: string) {
    const s = load();
    const exists = s.bookmarks.find((b) => b.kind === kind && b.id === id);
    if (exists) s.bookmarks = s.bookmarks.filter((b) => !(b.kind === kind && b.id === id));
    else s.bookmarks = [...s.bookmarks, { kind, id, label }];
    save();
  },
};
