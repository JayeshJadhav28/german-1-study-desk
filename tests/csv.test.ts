import { describe, it, expect } from 'vitest';
import { stripBom, parseCsv, parseCsvObjects } from '../scripts/lib/csv.mjs';

describe('CSV parser', () => {
  it('strips UTF-8 BOM', () => {
    expect(stripBom('﻿colA,colB')).toBe('colA,colB');
  });

  it('parses quoted fields containing commas and newlines', () => {
    const csv = 'a,b\n"x,1","line1\nline2"\n';
    const rows = parseCsv(csv);
    expect(rows).toEqual([
      ['a', 'b'],
      ['x,1', 'line1\nline2'],
    ]);
  });

  it('handles escaped double quotes inside quoted fields', () => {
    const rows = parseCsv('h1,h2\n"say ""hi""",y\n');
    expect(rows[1]).toEqual(['say "hi"', 'y']);
  });

  it('does not double-push rows (regression)', () => {
    const rows = parseCsv('u,l\n1,2\n3,4\n');
    expect(rows.length).toBe(3);
  });

  it('maps objects by header row with BOM', () => {
    const objs = parseCsvObjects('﻿unit,lessonId\nWeek 1,17\n');
    expect(objs).toEqual([{ unit: 'Week 1', lessonId: '17' }]);
  });
});
