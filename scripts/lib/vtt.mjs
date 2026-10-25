/**
 * WebVTT parsing with UTF-8 BOM handling.
 * Course VTT files begin with a UTF-8 BOM in most/all files, so the
 * WEBVTT header check must strip BOM first (tested).
 */
import { stripBom } from './csv.mjs';

export { stripBom };

export function hasWebVttHeader(text) {
  return stripBom(String(text ?? '')).startsWith('WEBVTT');
}

/** Parse "HH:MM:SS.mmm" (or "MM:SS.mmm") to seconds. */
export function vttTimestampToSeconds(ts) {
  const m = /^(\d{2,}):(\d{2}):(\d{2})\.(\d{3})$/.exec(String(ts).trim());
  if (m) {
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
  }
  const m2 = /^(\d{2}):(\d{2})\.(\d{3})$/.exec(String(ts).trim());
  if (m2) return Number(m2[1]) * 60 + Number(m2[2]) + Number(m2[3]) / 1000;
  return null;
}

/**
 * Parse VTT text into cues.
 * Returns { headerOk, cues: [{ index, start, end, startSec, endSec, text }], issues[] }
 */
export function parseVtt(text) {
  const body = stripBom(String(text ?? ''));
  const issues = [];
  const headerOk = body.startsWith('WEBVTT');
  if (!headerOk) issues.push('missing WEBVTT header (after BOM strip)');
  const cues = [];
  // Cue timing lines: 00:00:00.000 --> 00:00:02.000 (settings after end time allowed)
  const cueRe = /(\d{2,}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2,}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})[^\n]*\n([\s\S]*?)(?=\n\s*\n|$)/g;
  let m;
  while ((m = cueRe.exec(body)) !== null) {
    const start = m[1];
    const end = m[2];
    const textBlock = m[3]
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join(' ');
    if (!textBlock) continue;
    cues.push({
      index: cues.length + 1,
      start,
      end,
      startSec: vttTimestampToSeconds(start),
      endSec: vttTimestampToSeconds(end),
      text: textBlock,
    });
  }
  if (cues.length === 0) issues.push('zero cues parsed');
  return { headerOk, cues, issues };
}

/**
 * Optional light normalization for display (clearly labelled in the UI).
 * Only tidies whitespace and common ASR bracket markers; never rewrites words.
 */
export function lightNormalizeCueText(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^\[\s*|\s*\]$/g, '')
    .trim();
}
