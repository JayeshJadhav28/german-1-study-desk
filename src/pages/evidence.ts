import { api, gate } from '../api';
import { el, mount, pageHead, notice, contentGate } from '../ui';
import { hrefFor } from '../router';
import { renderMarkdown } from '../md';

export async function renderEvidence(c: HTMLElement): Promise<void> {
  mount(c, el('div', { class: 'skeleton' }));
  if (!await gate(['questions-meta.json'])) {
    mount(c, contentGate({
      title: 'Data notes',
      reason: 'The data notes review the course\'s own materials, which cannot be republished here.',
      alternatives: [
        { label: 'Study Resources', href: '/resources' },
        { label: 'Weeks & syllabus', href: '/weeks' },
        { label: 'Revision plan', href: '/plan' },
      ],
    }));
    return;
  }
  const [meta, srcMap, audit] = await Promise.all([
    api.questionsMeta(),
    api.markdownText('German-I-Exam-Prep-Output/07_Source_Map_and_Evidence.md'),
    api.markdownText('German-I-Exam-Prep-Output/00_Corpus_Audit.md'),
  ]);
  const srcRender = renderMarkdown(srcMap, { mdId: 'German-I-Exam-Prep-Output/07_Source_Map_and_Evidence.md' });
  const auditRender = renderMarkdown(audit, { mdId: 'German-I-Exam-Prep-Output/00_Corpus_Audit.md' });

  mount(c,
    pageHead('Data notes', 'What this study desk can and cannot show: answer sources, external audio/image questions, auto-generated transcripts and the unknown official exam format.'),
    el('div', { class: 'cards' }, [
      el('div', { class: 'card' }, [el('div', { class: 'num', text: String(meta.byProvenance['Course accepted response']) }), el('div', { class: 'lbl', text: 'Course accepted' })]),
      el('div', { class: 'card' }, [el('div', { class: 'num', text: String(meta.byProvenance['Inferred from full-score submission']) }), el('div', { class: 'lbl', text: 'Inferred answers' })]),
      el('div', { class: 'card' }, [el('div', { class: 'num', text: String(meta.byProvenance['No local answer key']) }), el('div', { class: 'lbl', text: 'No local key' })]),
      el('div', { class: 'card' }, [el('div', { class: 'num', text: String(meta.stimulusExternal) }), el('div', { class: 'lbl', text: 'need audio or image' })]),
      el('div', { class: 'card' }, [el('div', { class: 'num', text: String(meta.stimulusExternalWithLocalMedia ?? 0) }), el('div', { class: 'lbl', text: 'with saved course file' })]),
    ]),
    notice('Known limits: some questions have no answer key; a few still need an external audio or image (most now play the saved course file inline); transcripts are auto-generated and may contain errors; the official exam format is unknown; external Drive bundles were catalogued but not downloaded.'),
    el('p', {}, [
      el('a', { href: hrefFor('/questions', { prov: 'No local answer key' }), text: 'Show questions without an answer key →' }),
      ' · ',
      el('a', { href: hrefFor('/questions', { stim: '1' }), text: 'Show questions needing audio or image →' }),
    ]),
    el('h2', { text: 'Source map and evidence' }),
    el('div', { class: 'reader-wrap' }, [
      el('nav', { class: 'toc' }, srcRender.toc.map((h) => el('a', { href: `#${h.id}`, class: `lvl${h.level}`, text: h.text }))),
      el('div', { class: 'md-body', html: srcRender.html }),
    ]),
    el('h2', { text: 'Corpus audit' }),
    el('div', { class: 'reader-wrap' }, [
      el('nav', { class: 'toc' }, auditRender.toc.map((h) => el('a', { href: `#${h.id}`, class: `lvl${h.level}`, text: h.text }))),
      el('div', { class: 'md-body', html: auditRender.html }),
    ]),
    el('h2', { text: 'Related library pages' }),
    el('div', { class: 'chip-row' }, [
      el('a', { class: 'chip', href: hrefFor('/reader/German-I-Exam-Prep-Output/00_Corpus_Audit.md'), text: 'Corpus audit reader' }),
      el('a', { class: 'chip', href: hrefFor('/reader/German-I-Exam-Prep-Output/07_Source_Map_and_Evidence.md'), text: 'Source map reader' }),
      el('a', { class: 'chip', href: hrefFor('/reader/German-I-Exam-Prep-Output/README.md'), text: 'Analysis README' }),
      el('a', { class: 'chip', href: hrefFor('/resources'), text: 'Study Resources' }),
    ]),
  );
}
