import { describe, it, expect } from 'vitest';
import { parseMocks } from '../scripts/lib/parse-mocks.mjs';

const SAMPLE = `# 05 — Three Mock Tests

## Format declaration (read first)

The official structure is NOT documented. ASSUMED format.

---

# MOCK 1 — Foundation (focus: Weeks 1–4)

## Section A — Fill in the blank (1 pt each)

1. ____ heißen Sie? → **Wie** \`[course-accepted pattern]\`
2. Ich _________ in Pune. (wohnen) → **wohne** \`[pattern]\`

## Section B — Multiple choice (1 pt each)

3. Ich ___ in Pune. (a) wohne (b) wohnst (c) wohnt → **a** \`[pattern]\`

## Section C — True / False (1 pt each)

4. „Der die Das" — Artikel richtig. → **Richtig** \`[grammar-rule]\`

## Section D — Word order (2 pts each)

5. Reorder: / heute / Ich / gehe / schwimmen → **Ich gehe heute schwimmen.** \`[pattern]\`

## Section E — Multiple-select MSQ (2 pts)

6. Choose all greetings: (a) Hallo (b) Tisch (c) Guten Tag → **a, c** \`[course-accepted]\`

## Section F — Numeric (1 pt each)

7. Wie viele Wochen hat der Kurs? → **12** \`[pattern]\`

### Mock 1 key (compact)

1 Wie · 2 wohne · 3 a · 4 Richtig · 5 Ich gehe heute schwimmen. · 6 a,c · 7 12
`;

describe('mock parser', () => {
  const doc = parseMocks(SAMPLE);
  it('extracts an ASSUMED format declaration', () => {
    expect(doc.formatDeclaration).toMatch(/ASSUMED/i);
  });
  it('parses one mock with items', () => {
    expect(doc.mocks).toHaveLength(1);
    expect(doc.mocks[0].itemCount).toBe(7);
    expect(doc.mocks[0].focusWeeks).toMatch(/1/);
  });
  it('types sections correctly', () => {
    const types = doc.mocks[0].items.map((i) => i.type);
    expect(types).toEqual(['fill-in', 'fill-in', 'mcq', 'true-false', 'word-order', 'msq', 'numeric']);
  });
  it('preserves multi-letter MSQ keys', () => {
    const msq = doc.mocks[0].items.find((i) => i.type === 'msq');
    expect(msq.answers.filter((a) => /^[a-c]$/i.test(a)).length).toBe(2);
    expect(msq.answers).toEqual(['a', 'c']);
  });
  it('parses inline options', () => {
    const mcq = doc.mocks[0].items.find((i) => i.type === 'mcq');
    expect(mcq.options).toHaveLength(3);
    expect(mcq.options[0].letter).toBe('a');
  });
});
