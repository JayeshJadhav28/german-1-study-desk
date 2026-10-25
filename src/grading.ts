/**
 * Answer matching for the practice question bank.
 *
 * Semantics (verified against the 952-question ledger):
 *  - Single-answer types (fill-in, numeric, MCQ single-select, true/false)
 *    accept ANY of the source-listed variants (e.g. ["heiße", "heisst"]).
 *    Comparison is case-insensitive, trims whitespace and trailing
 *    punctuation — matching the course's `case_insensitive` matcher.
 *  - Multiple-select (MSQ) requires the exact set of correct options:
 *    every correct option selected, nothing extra.
 *  - Questions whose provenance is "No local answer key" (or whose
 *    validation status marks the key unavailable) are NEVER graded — the
 *    UI must not claim a right/wrong answer for them.
 */

export interface GradeableQuestion {
  questionClass: string;
  options: { index: number; text: string }[];
  recommendedAnswer: string[];
  recordedAnswers: string[];
  correctChoiceAnswers: string[];
  provenance: string;
  validationStatus: string;
}

export function normalizeAns(s: string): string {
  return String(s ?? '').trim().toLowerCase().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
}

/** The expected answer list the app grades against (source order kept). */
export function expectedFor(q: GradeableQuestion): string[] {
  if (q.questionClass === 'mcq-single-select' && q.correctChoiceAnswers.length) return q.correctChoiceAnswers;
  if (q.recommendedAnswer.length) return q.recommendedAnswer;
  if (q.recordedAnswers.length) return q.recordedAnswers;
  return [];
}

/** True when a trustworthy local key exists and the question may be graded. */
export function hasUsableKey(q: GradeableQuestion): boolean {
  if (q.provenance === 'No local answer key') return false;
  if (q.validationStatus === 'answer-unavailable' || q.validationStatus === 'stimulus-external-no-local-answer') return false;
  return expectedFor(q).length > 0;
}

/**
 * Map expected values that are option LETTERS (e.g. MSQ keys "a", "c") to
 * the corresponding option texts. Values that are not single letters, or
 * letters with no matching option, are kept as-is.
 */
export function resolveExpectedToOptionTexts(q: GradeableQuestion, expected: string[]): string[] {
  const letterToText = new Map<string, string>();
  for (const o of q.options || []) letterToText.set(optionLetter(o.index).toLowerCase(), o.text);
  return expected.map((e) => {
    const t = String(e ?? '').trim();
    if (t.length === 1 && /[a-z]/i.test(t)) return letterToText.get(t.toLowerCase()) ?? t;
    return t;
  });
}

/**
 * Grade a submission.
 * Returns true/false for graded questions, or null when the question has no
 * usable key (never guess).
 */
export function gradeAnswer(q: GradeableQuestion, selected: string[]): boolean | null {
  if (!hasUsableKey(q)) return null;
  const expectedRaw = expectedFor(q);
  const sel = selected.map(normalizeAns).filter(Boolean);
  if (q.questionClass === 'msq-multiple-select') {
    const exp = resolveExpectedToOptionTexts(q, expectedRaw).map(normalizeAns).filter(Boolean).sort();
    if (!exp.length) return null;
    const got = [...sel].sort();
    return got.length === exp.length && got.every((v, i) => v === exp[i]);
  }
  // single-answer: exactly one selection, matching any accepted variant
  if (sel.length !== 1) return false;
  const exp = expectedRaw.map(normalizeAns).filter(Boolean);
  return exp.includes(sel[0]);
}

export function optionLetter(i: number): string {
  return String.fromCharCode(65 + (Number(i) || 0));
}

/** Visible stem: fall back to the assignment stimulus when the source stem is empty. */
export function stemText(q: { questionText: string; stimulus: string }): string {
  const t = (q.questionText || '').trim();
  if (t) return t;
  return (q.stimulus || '').trim();
}
