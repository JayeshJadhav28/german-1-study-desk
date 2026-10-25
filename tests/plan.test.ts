import { describe, it, expect } from 'vitest';
import { parseRevisionPlan } from '../scripts/lib/parse-plan.mjs';

const PLAN = `# Seven-Day Revision Plan

Exam listed: **25 October 2026**

## Day 1 (Mon 19 Oct) — Foundation
- **Review (60 min):** Cheat sheet §1.
- **Practice (60 min):** Section A.
- **Recall (15 min):** Write 10 sentences.
- **Evidence hook:** 242 conjugation questions.

## Day 2 (Tue 20 Oct) — Articles
- **Review:** §5.
- **Practice:** B3 block.
- **Recall:** 20 nouns.
- **Evidence hook:** 229 questions.

## Tracking table

| Day | Done |
|---|---|
| 1 | |
`;

describe('revision plan parser', () => {
  const plan = parseRevisionPlan(PLAN);
  it('parses exactly the day sections (no tracking-table rows)', () => {
    expect(plan.days).toHaveLength(2);
    expect(plan.days[0].dayNum).toBe(1);
    expect(plan.days[1].dateLabel).toBe('Tue 20 Oct');
  });
  it('captures tasks with categories', () => {
    expect(plan.days[0].tasks).toHaveLength(4);
    expect(plan.days[0].tasks[0].category).toMatch(/Review/);
    expect(plan.days[0].tasks[0].text).toContain('Cheat sheet');
  });
  it('totals tasks across days', () => {
    expect(plan.totalTasks).toBe(8);
  });
  it('extracts the exam date text', () => {
    expect(plan.examDateText).toContain('25 October 2026');
  });
});
