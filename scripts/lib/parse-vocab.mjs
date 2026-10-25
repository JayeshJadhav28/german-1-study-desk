/**
 * Parse vocabulary tables from 03_Vocabulary_Master.md into structured entries.
 * Generic markdown-table reader keyed by section headings; column mapping
 * depends on the section's header row (checked, not assumed globally).
 */
export function parseVocabulary(markdownText) {
  const text = String(markdownText ?? '');
  const lines = text.split(/\r?\n/);
  const entries = [];
  const sections = [];
  let heading = '';
  let headingLine = 0;
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const h = /^(#{2,3})\s+(.+)$/.exec(line);
    if (h) { heading = h[2].trim(); headingLine = i + 1; continue; }
    if (!/^\s*\|/.test(line)) continue;
    // collect a table block
    const block = [];
    let j = i;
    while (j < lines.length && /^\s*\|/.test(lines[j])) { block.push(lines[j]); j += 1; }
    i = j - 1;
    if (block.length < 3) continue; // header + separator + >=1 row
    const cells = (row) => row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
    const header = cells(block[0]);
    // separator row block[1] is dashes
    const dataRows = block.slice(2).map(cells);

    const headerJoin = header.join(' ').toLowerCase();
    if (!heading || /format declaration|tracking|deliverable|evidence-label/i.test(heading)) continue;
    // Only take vocabulary-like tables
    const isVocab =
      /german|phrase|infinitive|form|timestamped|category/.test(headerJoin) &&
      /english|meaning|translation|gloss/.test(headerJoin);
    if (!isVocab) continue;

    sections.push({ heading, line: headingLine, rowCount: dataRows.length });

    for (const row of dataRows) {
      if (row.length < 2) continue;
      const german = row[0];
      const gloss = row[1];
      const evidence = row[2] || '';
      if (!german || german === '—' || /^\(see/i.test(german)) continue;
      // skip header-like repeats
      if (/^german$/i.test(german)) continue;
      const isVttSection = /vtt|timestamped phrase/i.test(heading) || /@\d{2}:\d{2}:\d{2}/.test(evidence);
      entries.push({
        german,
        gloss,
        evidence,
        section: heading,
        sourceType: isVttSection ? 'vtt-transcript' : 'assignment-or-lesson',
        headingLine,
      });
    }
  }
  return { entries, sections };
}
