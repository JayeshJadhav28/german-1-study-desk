import { describe, it, expect } from 'vitest';
import { hasWebVttHeader, vttTimestampToSeconds, parseVtt } from '../scripts/lib/vtt.mjs';

const BOM = String.fromCharCode(0xfeff);

describe('VTT parsing', () => {
  it('accepts WEBVTT header after UTF-8 BOM', () => {
    expect(hasWebVttHeader(`${BOM}WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHallo`)).toBe(true);
    expect(hasWebVttHeader('NOT VTT')).toBe(false);
  });

  it('parses cues with timestamps', () => {
    const doc = `${BOM}WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.500\nGuten Tag\n\n2\n00:01:00.000 --> 00:01:02.000\nWie geht es Ihnen?\n`;
    const cues = parseVtt(doc).cues;
    expect(cues.length).toBe(2);
    expect(cues[0].text).toBe('Guten Tag');
    expect(cues[0].startSec).toBeCloseTo(1);
    expect(cues[1].endSec).toBeCloseTo(62);
  });

  it('parses hours and MM:SS.mmm style', () => {
    expect(vttTimestampToSeconds('01:02:03.250')).toBeCloseTo(3723.25);
    expect(vttTimestampToSeconds('02:03.500')).toBeCloseTo(123.5);
  });

  it('preserves raw ASR text without inventing umlauts', () => {
    const doc = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nM chte ein Kaffee\n';
    const cues = parseVtt(doc).cues;
    expect(cues[0].text).toBe('M chte ein Kaffee');
  });
});
