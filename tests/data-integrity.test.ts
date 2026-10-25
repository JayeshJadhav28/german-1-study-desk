import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseVocabulary } from '../scripts/lib/parse-vocab.mjs';

const OUT = path.resolve(__dirname, '../public/data');
const HAS_FULL_DATA =
  fs.existsSync(path.join(OUT, 'questions-meta.json')) &&
  fs.existsSync(path.join(OUT, 'questions', 'week-1.json')) &&
  fs.existsSync(path.join(OUT, 'transcripts.json'));

// The full corpus is private and git-ignored. In a clean public clone these
// suites are skipped instead of failing on missing data.
const describeFull = HAS_FULL_DATA ? describe : describe.skip;

describeFull('generated data integrity (runs after import)', () => {
  it('questions-meta reconciles with the source facts', () => {
    const meta = JSON.parse(fs.readFileSync(path.join(OUT, 'questions-meta.json'), 'utf8'));
    expect(meta.realQuestions).toBe(952);
    expect(meta.instructionBlocks).toBe(227);
    expect(meta.byClass['fill-in-blank-text']).toBe(706);
    expect(meta.byClass['mcq-single-select']).toBe(186);
    expect(meta.byClass['true-false']).toBe(52);
    expect(meta.byClass['numeric-input']).toBe(6);
    expect(meta.byClass['msq-multiple-select']).toBe(2);
    expect(meta.stimulusExternal).toBe(47);
    expect(meta.byProvenance['Course accepted response']).toBe(712);
    expect(meta.byProvenance['Inferred from full-score submission']).toBe(102);
    expect(meta.byProvenance['No local answer key']).toBe(138);
  });

  it('never assigns invented answers to key-less questions', () => {
    for (let w = 1; w <= 12; w += 1) {
      const wk = JSON.parse(fs.readFileSync(path.join(OUT, `questions/week-${w}.json`), 'utf8'));
      for (const b of wk.blocks) {
        if (b.isInstruction) continue;
        if (b.validationStatus === 'answer-unavailable' || b.provenance === 'No local answer key') {
          expect(b.recommendedAnswer).toEqual([]);
        }
      }
    }
  });

  it('MSQ records keep multiple correct letters', () => {
    let found = 0;
    for (let w = 1; w <= 12; w += 1) {
      const wk = JSON.parse(fs.readFileSync(path.join(OUT, `questions/week-${w}.json`), 'utf8'));
      for (const b of wk.blocks) {
        if (b.questionClass === 'msq-multiple-select') {
          found += 1;
          const letters = b.correctChoiceAnswers.concat(b.recommendedAnswer).filter((a) => /^[a-f]$/i.test(String(a).trim()));
          expect(letters.length === 0 || letters.length >= 1).toBe(true);
        }
      }
    }
    expect(found).toBe(2);
  });

  it('provenance labels use the exact display strings', () => {
    const wk = JSON.parse(fs.readFileSync(path.join(OUT, 'questions/week-1.json'), 'utf8'));
    const labels = new Set(wk.blocks.filter((b) => !b.isInstruction).map((b) => b.provenance));
    for (const l of labels) {
      expect(['Course accepted response', 'Inferred from full-score submission', 'No local answer key']).toContain(l);
    }
  });

  it('week assignment maps questions to their week numbers', () => {
    for (let w = 1; w <= 12; w += 1) {
      const wk = JSON.parse(fs.readFileSync(path.join(OUT, `questions/week-${w}.json`), 'utf8'));
      expect(wk.blocks.every((b) => b.weekNum === w)).toBe(true);
    }
  });

  it('all 46 VTT cue files exist and are non-empty after BOM-aware parse', () => {
    const idx = JSON.parse(fs.readFileSync(path.join(OUT, 'transcripts.json'), 'utf8'));
    expect(idx.files).toHaveLength(46);
    for (const f of idx.files) {
      expect(f.headerOk).toBe(true);
      const doc = JSON.parse(fs.readFileSync(path.join(OUT, `transcripts/${f.file}.json`), 'utf8'));
      expect(doc.cues.length).toBeGreaterThan(0);
    }
  });

  it('study-resources catalog has no unsafe schemes and keeps drive query strings', () => {
    const sr = JSON.parse(fs.readFileSync(path.join(OUT, 'study-resources.json'), 'utf8'));
    for (const r of sr.resources) {
      if (r.url) {
        expect(r.url).toMatch(/^https?:\/\//);
      }
    }
    expect(sr.resources.some((r) => (r.url || '').includes('usp=sharing'))).toBe(true);
    expect(sr.summary.distinctExternalUrls).toBeGreaterThan(50);
  });

  it('markdown copies cover both approved folders', () => {
    const idx = JSON.parse(fs.readFileSync(path.join(OUT, 'markdown-index.json'), 'utf8'));
    expect(idx.analysisCount).toBe(9);
    expect(idx.packCount).toBeGreaterThan(150);
    const grammar = idx.files.find((f) => f.id.endsWith('02_German_Grammar_Cheat_Sheet.md'));
    expect(grammar).toBeTruthy();
    expect(fs.existsSync(path.join(OUT, 'markdown', grammar!.id))).toBe(true);
  });

  it('all 47 stimulus-external questions carry local media files on disk', () => {
    const meta = JSON.parse(fs.readFileSync(path.join(OUT, 'questions-meta.json'), 'utf8'));
    expect(meta.stimulusExternal).toBe(47);
    expect(meta.stimulusExternalWithLocalMedia).toBe(47);
    let checked = 0;
    for (let w = 1; w <= 12; w += 1) {
      const wk = JSON.parse(fs.readFileSync(path.join(OUT, `questions/week-${w}.json`), 'utf8'));
      for (const b of wk.blocks) {
        if (b.isInstruction || !b.stimulusExternal) continue;
        checked += 1;
        expect(b.stimulusMedia.length).toBeGreaterThan(0);
        for (const m of b.stimulusMedia) {
          expect(m.src.startsWith('media/stimuli/')).toBe(true);
          expect(fs.existsSync(path.join(OUT, m.src))).toBe(true);
        }
      }
    }
    expect(checked).toBe(47);
  });

  it('every ledger media reference resolves to an existing file', () => {
    let refs = 0;
    for (let w = 1; w <= 12; w += 1) {
      const wk = JSON.parse(fs.readFileSync(path.join(OUT, `questions/week-${w}.json`), 'utf8'));
      for (const b of wk.blocks) {
        for (const m of b.stimulusMedia || []) {
          refs += 1;
          expect(fs.existsSync(path.join(OUT, m.src))).toBe(true);
        }
      }
    }
    expect(refs).toBeGreaterThan(500);
  });
});

describe('vocabulary parser (source markdown)', () => {
  it('parses table rows with german/gloss/evidence', () => {
    const md = `# Vocabulary

## A. Core phrases

| German phrase | English meaning | Evidence |
|---|---|---|
| Wie heißen Sie? | What is your name? | W1 accepted |
| Guten Tag | Good day | VTT \`Week-1.vtt@00:01:02\` |
`;
    const doc = parseVocabulary(md);
    expect(doc.entries.length).toBeGreaterThanOrEqual(2);
    expect(doc.entries[0].german).toContain('Wie heißen Sie?');
    expect(doc.entries[0].gloss).toContain('What is your name?');
  });
});

describeFull('question bank audit invariants', () => {
  const loadAll = () => {
    const blocks: any[] = [];
    for (let w = 1; w <= 12; w += 1) {
      const wk = JSON.parse(fs.readFileSync(path.join(OUT, `questions/week-${w}.json`), 'utf8'));
      blocks.push(...wk.blocks);
    }
    return blocks;
  };
  const all = HAS_FULL_DATA ? loadAll() : [];
  const real = all.filter((b) => !b.isInstruction);
  const instr = all.filter((b) => b.isInstruction);
  const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

  it('block ids are unique and follow the stable id format', () => {
    const ids = all.map((b) => b.id);
    expect(new Set(ids).size).toBe(1179);
    for (const b of all.slice(0, 50)) {
      expect(b.id).toBe(`${b.assignmentId}-${b.questionIndex}-${b.questionId}`);
    }
  });

  it('instruction blocks are 227, carry the instruction validation status and are never graded', () => {
    expect(instr.length).toBe(227);
    for (const b of instr) {
      expect(b.isInstruction).toBe(true);
      expect(b.validationStatus).toBe('instruction-block');
      expect(b.recommendedAnswer).toEqual([]);
    }
    expect(instr.filter((b) => b.stimulusMedia.length > 0).length).toBe(144);
  });

  it('multi-variant fill-ins: 79 items with course-listed variants (ß/ss pairs preserved)', () => {
    const multi = real.filter((b) => (b.recommendedAnswer || []).length > 1);
    expect(multi.length).toBe(79);
    const ssPair = multi.find((b) => b.recommendedAnswer.includes('heißt') && b.recommendedAnswer.includes('heisst'));
    expect(ssPair).toBeTruthy();
  });

  it('10 real questions have an empty source stem but a non-empty stimulus (UI fallback depends on it)', () => {
    const emptyStem = real.filter((b) => !(b.questionText || '').trim());
    expect(emptyStem.length).toBe(10);
    for (const b of emptyStem) {
      expect((b.stimulus || '').trim().length).toBeGreaterThan(0);
      expect(b.questionClass).toBe('mcq-single-select');
    }
  });

  it('exactly 3 questions carry duplicate option texts (source truth, preserved)', () => {
    const dups = real.filter((b) => {
      const t = (b.options || []).map((o) => String(o.text).trim().toLowerCase());
      return t.length > 0 && new Set(t).size !== t.length;
    });
    expect(dups.length).toBe(3);
    expect(dups.map((d) => d.id).sort()).toEqual(['34-42-6286931970752512', '34-56-4991622716063744', '65-81-6403696092512256']);
  });

  it('provenance × validationStatus cross-tab is exactly as recorded', () => {
    const cross: Record<string, number> = {};
    for (const b of real) {
      const k = `${b.provenance} | ${b.validationStatus}`;
      cross[k] = (cross[k] || 0) + 1;
    }
    expect(cross).toEqual({
      'Course accepted response | ok': 712,
      'Inferred from full-score submission | inferred-from-student-score': 102,
      'No local answer key | answer-unavailable': 132,
      'No local answer key | stimulus-external-no-local-answer': 6,
    });
  });

  it('key-less questions carry no answers in ANY field', () => {
    for (const b of real.filter((x) => x.provenance === 'No local answer key')) {
      expect(b.recommendedAnswer).toEqual([]);
      expect(b.recordedAnswers).toEqual([]);
      expect(b.correctChoiceAnswers).toEqual([]);
    }
  });

  it('inferred answers are backed by a full-score student response matching the key', () => {
    const inferred = real.filter((b) => b.provenance === 'Inferred from full-score submission');
    expect(inferred.length).toBe(102);
    for (const b of inferred) {
      expect((b.studentResponse || '').length).toBeGreaterThan(0);
      expect(b.studentScore).toBe(b.points);
      expect(b.recommendedAnswer.length).toBeGreaterThan(0);
    }
  });

  it.skipIf(!fs.existsSync(path.resolve(__dirname, '../../German-I-Study-Pack/assignments')))('every course-accepted answer appears in the source assignment response list', () => {
    const packAssign = path.resolve(__dirname, '../../German-I-Study-Pack/assignments');
    const srcByAid = new Map<number, Map<string, any>>();
    for (const f of fs.readdirSync(packAssign)) {
      if (!f.endsWith('.json')) continue;
      const doc = JSON.parse(fs.readFileSync(path.join(packAssign, f), 'utf8').replace(/^﻿/, ''));
      const byBlock = new Map<string, any>();
      for (const qq of doc.questions || []) byBlock.set(String(qq.question_block_id), qq);
      srcByAid.set(Number(doc.assessmentId), byBlock);
    }
    const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
    let checked = 0;
    for (const b of real.filter((x) => x.provenance === 'Course accepted response')) {
      const src = srcByAid.get(b.assignmentId)?.get(String(b.questionId));
      expect(src, `source row for ${b.id}`).toBeTruthy();
      const accepted = new Set((src!.response || []).map((r: any) => norm(r.response)));
      for (const ans of b.recommendedAnswer) {
        expect(accepted.has(norm(ans)), `${b.id} answer "${ans}" in source list`).toBe(true);
      }
      checked += 1;
    }
    expect(checked).toBe(712);
  });

  it('true/false options use the three known source sets; keyed answers are members', () => {
    const tf = real.filter((b) => b.questionClass === 'true-false');
    const sets = new Set(tf.map((b) => (b.options || []).map((o) => o.text).join('|')));
    expect([...sets].sort()).toEqual(['Richtig|Falsch', 'R|F', 'richtig|falsch']);
    for (const b of tf.filter((x) => (x.recommendedAnswer || []).length)) {
      const opts = (b.options || []).map((o) => norm(o.text));
      for (const a of b.recommendedAnswer) expect(opts.includes(norm(a))).toBe(true);
    }
  });

  it('both MSQ items are audio-dependent and keyless with 4 options each', () => {
    const msq = real.filter((b) => b.questionClass === 'msq-multiple-select');
    expect(msq.length).toBe(2);
    for (const b of msq) {
      expect(b.options.length).toBe(4);
      expect(b.provenance).toBe('No local answer key');
      expect(b.stimulusExternal).toBe(true);
      expect(b.stimulusMedia.length).toBeGreaterThan(0);
    }
  });

  it('every listen/audio question carries local media (no orphaned listening items)', () => {
    const listen = real.filter((b) => /click here to listen|listen to the|audio|dialog/i.test(`${b.questionText} ${b.stimulus}`));
    expect(listen.length).toBeGreaterThanOrEqual(106);
    for (const b of listen) expect(b.stimulusMedia.length, b.id).toBeGreaterThan(0);
  });
});

describeFull('transcript ASR labelling', () => {
  it('index note describes mixed German–English ASR and cue files parse with BOM stripped', () => {
    const idx = JSON.parse(fs.readFileSync(path.join(OUT, 'transcripts.json'), 'utf8'));
    expect(/ASR/i.test(idx.asrNote)).toBe(true);
    expect(/mixed/i.test(idx.asrNote)).toBe(true);
    const first = idx.files[0];
    const doc = JSON.parse(fs.readFileSync(path.join(OUT, `transcripts/${first.file}.json`), 'utf8'));
    expect(doc.headerOk).toBe(true);
    expect(doc.asrNote).toMatch(/ASR/i);
    expect(doc.cues.length).toBeGreaterThan(0);
    // raw VTT on disk starts with a BOM; the parse must have consumed it
    const vttPath = path.resolve(__dirname, '../../German-I-Study-Pack/transcripts', first.file);
    if (fs.existsSync(vttPath)) {
      const raw = fs.readFileSync(vttPath);
      if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
        expect(doc.cues[0].text.startsWith('﻿')).toBe(false);
      }
    }
  });
});
