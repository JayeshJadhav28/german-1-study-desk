import { describe, it, expect } from 'vitest';
import {
  normalizeAns, expectedFor, hasUsableKey, gradeAnswer, optionLetter, stemText,
  resolveExpectedToOptionTexts, type GradeableQuestion,
} from '../src/grading';

function q(over: Partial<GradeableQuestion>): GradeableQuestion {
  return {
    questionClass: 'fill-in-blank-text',
    options: [],
    recommendedAnswer: [],
    recordedAnswers: [],
    correctChoiceAnswers: [],
    provenance: 'Course accepted response',
    validationStatus: 'ok',
    ...over,
  };
}

describe('normalizeAns', () => {
  it('lowercases, trims, drops trailing punctuation and collapses spaces', () => {
    expect(normalizeAns('  HeißT. ')).toBe('heißt');
    expect(normalizeAns('a  b')).toBe('a b');
    expect(normalizeAns('')).toBe('');
    expect(normalizeAns(undefined as unknown as string)).toBe('');
  });
});

describe('expectedFor', () => {
  it('prefers correctChoiceAnswers for MCQ, then recommended, then recorded', () => {
    expect(expectedFor(q({ questionClass: 'mcq-single-select', correctChoiceAnswers: ['a'], recommendedAnswer: ['b'] }))).toEqual(['a']);
    expect(expectedFor(q({ recommendedAnswer: ['wie'], recordedAnswers: ['Wie'] }))).toEqual(['wie']);
    expect(expectedFor(q({ recordedAnswers: ['x'] }))).toEqual(['x']);
    expect(expectedFor(q({}))).toEqual([]);
  });
});

describe('hasUsableKey', () => {
  it('is false for No local answer key even if arrays were populated', () => {
    expect(hasUsableKey(q({ provenance: 'No local answer key', validationStatus: 'answer-unavailable', recommendedAnswer: ['hack'] }))).toBe(false);
  });
  it('is false for unavailable validation statuses', () => {
    expect(hasUsableKey(q({ validationStatus: 'stimulus-external-no-local-answer', recommendedAnswer: ['x'] }))).toBe(false);
    expect(hasUsableKey(q({ validationStatus: 'answer-unavailable', recommendedAnswer: ['x'] }))).toBe(false);
  });
  it('is true for course-accepted and inferred items with answers', () => {
    expect(hasUsableKey(q({ recommendedAnswer: ['wie'] }))).toBe(true);
    expect(hasUsableKey(q({ provenance: 'Inferred from full-score submission', validationStatus: 'inferred-from-student-score', recommendedAnswer: ['sind'] }))).toBe(true);
  });
  it('is false when no answer arrays exist', () => {
    expect(hasUsableKey(q({}))).toBe(false);
  });
});

describe('gradeAnswer — single-answer types accept any listed variant', () => {
  const multi = q({ recommendedAnswer: ['heisse', 'heiße', 'bin'] });
  it('accepts each course-listed variant (regression: old matcher required set equality)', () => {
    expect(gradeAnswer(multi, ['heisse'])).toBe(true);
    expect(gradeAnswer(multi, ['heiße'])).toBe(true);
    expect(gradeAnswer(multi, ['bin'])).toBe(true);
  });
  it('ignores case, whitespace and trailing punctuation', () => {
    expect(gradeAnswer(multi, [' HEISSE. '])).toBe(true);
    expect(gradeAnswer(q({ recommendedAnswer: ['wie'] }), ['Wie'])).toBe(true);
  });
  it('rejects other values and empty submissions', () => {
    expect(gradeAnswer(multi, ['anderes'])).toBe(false);
    expect(gradeAnswer(multi, [])).toBe(false);
    expect(gradeAnswer(multi, ['heisse', 'bin'])).toBe(false); // single-answer: exactly one
  });
});

describe('gradeAnswer — MCQ single-select', () => {
  const mcq = q({
    questionClass: 'mcq-single-select',
    options: [{ index: 0, text: 'Guten Abend' }, { index: 1, text: 'Guten Morgen' }],
    recommendedAnswer: ['Guten Abend'],
    provenance: 'Inferred from full-score submission',
    validationStatus: 'inferred-from-student-score',
  });
  it('grades by option text', () => {
    expect(gradeAnswer(mcq, ['Guten Abend'])).toBe(true);
    expect(gradeAnswer(mcq, ['Guten Morgen'])).toBe(false);
  });
  it('honours correctChoiceAnswers when present', () => {
    const withCc = q({ questionClass: 'mcq-single-select', correctChoiceAnswers: ['Guten Morgen'], recommendedAnswer: ['Guten Abend'], options: mcq.options });
    expect(gradeAnswer(withCc, ['Guten Morgen'])).toBe(true);
    expect(gradeAnswer(withCc, ['Guten Abend'])).toBe(false);
  });
});

describe('gradeAnswer — true/false source option sets', () => {
  it('grades lowercased UI labels against capitalized source keys', () => {
    const tf = q({ questionClass: 'true-false', options: [{ index: 0, text: 'Richtig' }, { index: 1, text: 'Falsch' }], recommendedAnswer: ['Richtig'], provenance: 'Inferred from full-score submission', validationStatus: 'inferred-from-student-score' });
    expect(gradeAnswer(tf, ['richtig'])).toBe(true);
    expect(gradeAnswer(tf, ['falsch'])).toBe(false);
  });
  it('keyless true/false never grades (R|F listening items)', () => {
    const tf = q({ questionClass: 'true-false', options: [{ index: 0, text: 'R' }, { index: 1, text: 'F' }], provenance: 'No local answer key', validationStatus: 'answer-unavailable' });
    expect(gradeAnswer(tf, ['R'])).toBe(null);
  });
});

describe('gradeAnswer — numeric', () => {
  it('grades digit strings from the course key', () => {
    const n = q({ questionClass: 'numeric-input', recommendedAnswer: ['68354817'] });
    expect(gradeAnswer(n, ['68354817'])).toBe(true);
    expect(gradeAnswer(n, ['68354818'])).toBe(false);
  });
});

describe('gradeAnswer — MSQ requires the full correct set', () => {
  const msq = q({
    questionClass: 'msq-multiple-select',
    options: [
      { index: 0, text: 'ich' }, { index: 1, text: 'möchte' },
      { index: 2, text: 'ein' }, { index: 3, text: 'Buch' },
    ],
    recommendedAnswer: ['ich', 'möchte'],
    provenance: 'Inferred from full-score submission',
    validationStatus: 'inferred-from-student-score',
  });
  it('accepts exactly the correct set regardless of order', () => {
    expect(gradeAnswer(msq, ['möchte', 'ich'])).toBe(true);
  });
  it('rejects partial and supersets', () => {
    expect(gradeAnswer(msq, ['ich'])).toBe(false);
    expect(gradeAnswer(msq, ['ich', 'möchte', 'ein'])).toBe(false);
    expect(gradeAnswer(msq, [])).toBe(false);
  });
  it('maps letter keys (a, c) to option texts', () => {
    const letterKey = q({
      questionClass: 'msq-multiple-select',
      options: msq.options,
      recommendedAnswer: ['a', 'c'],
      provenance: 'Inferred from full-score submission',
      validationStatus: 'inferred-from-student-score',
    });
    expect(resolveExpectedToOptionTexts(letterKey, ['a', 'c'])).toEqual(['ich', 'ein']);
    expect(gradeAnswer(letterKey, ['ich', 'ein'])).toBe(true);
    expect(gradeAnswer(letterKey, ['ich', 'möchte'])).toBe(false);
  });
  it('keyless MSQ never grades', () => {
    const noKey = q({ questionClass: 'msq-multiple-select', options: msq.options, provenance: 'No local answer key', validationStatus: 'stimulus-external-no-local-answer' });
    expect(gradeAnswer(noKey, ['ich', 'möchte'])).toBe(null);
  });
});

describe('optionLetter', () => {
  it('maps 0-based indexes to A, B, C…', () => {
    expect(optionLetter(0)).toBe('A');
    expect(optionLetter(3)).toBe('D');
  });
});

describe('stemText', () => {
  it('uses the source stem when present', () => {
    expect(stemText({ questionText: '____ heißen Sie?', stimulus: 'Fill in blanks…' })).toBe('____ heißen Sie?');
  });
  it('falls back to the assignment stimulus when the stem is empty', () => {
    expect(stemText({ questionText: '   ', stimulus: 'Choose the correct conjugation…' })).toBe('Choose the correct conjugation…');
  });
});
