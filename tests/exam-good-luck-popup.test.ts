import { describe, expect, it } from 'vitest';
import { EXAM_GOOD_LUCK_SCHEDULE, isExamGoodLuckWindow } from '../src/exam-good-luck-popup';

const at = (iso: string): number => Date.parse(iso);

describe('NPTEL German I exam good-luck schedule', () => {
  it.each([
    ['before the event', '2026-10-24T23:59:00+05:30', false],
    ['one minute before the event', '2026-10-25T00:00:00+05:30', false],
    ['at the inclusive start', EXAM_GOOD_LUCK_SCHEDULE.start, true],
    ['during the event', '2026-10-25T13:59:59+05:30', true],
    ['at the exclusive end', EXAM_GOOD_LUCK_SCHEDULE.end, false],
    ['after the event', '2026-10-25T14:00:01+05:30', false],
    ['the next day', '2026-10-26T00:01:00+05:30', false],
  ])('%s', (_label, iso, expected) => {
    expect(isExamGoodLuckWindow(at(iso))).toBe(expected);
  });

  it('uses explicit IST offsets rather than the device timezone', () => {
    expect(at(EXAM_GOOD_LUCK_SCHEDULE.start)).toBe(Date.UTC(2026, 9, 24, 18, 31));
    expect(at(EXAM_GOOD_LUCK_SCHEDULE.end)).toBe(Date.UTC(2026, 9, 25, 8, 30));
  });
});
