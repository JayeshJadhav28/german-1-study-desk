/**
 * Parse 05_Three_Mock_Tests.md into three structured mock-test models.
 * The source format is regular:
 *   # MOCK N — Title (focus: Weeks X–Y)
 *   ## Section A — Fill in the blank (1 pt each)
 *   1. prompt → **answer**  `[evidence]`
 *   13. prompt (a) opt (b) opt (c) opt → **b** `[evidence]`
 *   ### Mock N key (compact)
 *   1 Wie · 2 wohne · ...
 */

const SECTION_TYPE = {
  A: 'fill-in',
  B: 'mcq',
  C: 'true-false',
  D: 'word-order',
  E: 'msq',
  F: 'numeric',
};

export function parseMocks(markdownText) {
  const text = String(markdownText ?? '');
  const formatDeclMatch = /## Format declaration[\s\S]*?(?=\n---\n)/.exec(text);
  const formatDeclaration = formatDeclMatch
    ? formatDeclMatch[0].replace(/\n{3,}/g, '\n\n').trim()
    : 'ASSUMED practice format — see source file 05_Three_Mock_Tests.md';

  const mocks = [];
  const mockSplit = text.split(/^# MOCK (\d+)\s+—\s+(.+)$/m);
  // mockSplit: [preamble, num, title, body, num, title, body, ...]
  for (let i = 1; i + 2 < mockSplit.length + 1; i += 3) {
    const num = Number(mockSplit[i]);
    const title = mockSplit[i + 1].trim();
    const body = mockSplit[i + 2] || '';
    // cut off design notes at the end
    const cut = body.search(/\n---\n\n## Mock design notes/);
    const section = cut >= 0 ? body.slice(0, cut) : body;

    const focusMatch = /focus:\s*Weeks?\s*([\d–-]+[\d–-]*)/i.exec(title) || /focus:\s*Weeks?\s*(\d+)[–-](\d+)/i.exec(title);
    const focusWeeks = focusMatch ? focusMatch[1] : '';

    let currentSection = '';
    const items = [];
    const lines = section.split(/\r?\n/);
    for (const line of lines) {
      const sec = /^## Section ([A-F])\s+—\s+(.+)$/.exec(line);
      if (sec) { currentSection = sec[1]; continue; }
      if (/^### Mock \d key/.test(line)) continue;
      if (/^\*\(\(Item|^\*\(Item|^\*\(Item 30/.test(line.trim())) continue;
      const itemMatch = /^(\d+)\.\s+(.+)$/.exec(line);
      if (!itemMatch) continue;
      const itemNum = Number(itemMatch[1]);
      let rest = itemMatch[2].trim();

      let evidence = '';
      const ev = /`\[([^\]]+)\]`\s*$/.exec(rest);
      if (ev) { evidence = ev[1]; rest = rest.slice(0, ev.index).trim(); }

      let answerRaw = '';
      const ans = /→\s*\*\*(.+?)\*\*\s*$/.exec(rest);
      if (ans) { answerRaw = ans[1].trim(); rest = rest.slice(0, ans.index).trim(); }

      // options like (a) foo (b) bar (c) baz
      const options = [];
      const optRe = /\(([a-fA-F])\)\s+([^()]+?)(?=\s*\([a-fA-F]\)\s|$)/g;
      let om;
      while ((om = optRe.exec(rest)) !== null) {
        options.push({ letter: om[1].toLowerCase(), text: om[2].trim() });
      }

      const type = SECTION_TYPE[currentSection] || 'fill-in';
      const answers = answerRaw
        ? answerRaw.split(/\s*[,·]\s*|\s+\/\s+/).map((a) => a.trim()).filter(Boolean)
        : [];

      items.push({
        num: itemNum,
        type,
        section: currentSection,
        prompt: rest.replace(/\s+/g, ' ').trim(),
        options,
        answers,
        answerRaw,
        evidence,
        points: type === 'word-order' || type === 'msq' ? 2 : 1,
      });
    }

    // compact key line for validation
    const keyLine = /### Mock \d key \(compact\)\s*\n+([^\n]+)/.exec(section);
    const keyCompact = keyLine ? keyLine[1].trim() : '';

    const msqItems = items.filter((it) => it.type === 'msq');
    for (const it of msqItems) {
      if (it.answers.length === 1 && /^[a-f]$/.test(it.answers[0])) {
        // keep as-is but flag: MSQ keys should list multiple letters when source does
        it.msqSingleLetter = true;
      }
    }

    mocks.push({
      mockNumber: num,
      title,
      focusWeeks,
      assumedFormat: true,
      items,
      keyCompact,
      itemCount: items.length,
    });
  }

  return { formatDeclaration, mocks };
}
