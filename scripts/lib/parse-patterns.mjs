/**
 * Parse the concept table from 01_Recurring_Patterns.md (Section A markdown table).
 * Columns: Concept | Real questions (n) | Weeks appearing (of 12) | Assignments appearing (of 12)
 *          | Sum of points on tagged items* | Typical task shape | Priority | Confidence
 */
export function parsePatternConcepts(markdownText) {
  const text = String(markdownText ?? '');
  const lines = text.split(/\r?\n/);
  const concepts = [];
  let inTable = false;
  for (const line of lines) {
    if (/^\s*\|\s*Concept\s*\|/.test(line)) { inTable = true; continue; }
    if (!inTable) continue;
    if (/^\s*\|?\s*-{3,}/.test(line)) continue;
    if (!/^\s*\|/.test(line)) { inTable = false; continue; }
    const cells = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
    if (cells.length < 8) continue;
    const concept = cells[0];
    if (!concept || /^concept$/i.test(concept)) continue;
    const questionCount = Number.parseInt(cells[1], 10);
    const weekCount = Number.parseInt(cells[2], 10);
    const assignmentCount = Number.parseInt(cells[3], 10);
    const pointSumRaw = cells[4].replace(/[^0-9.]/g, '');
    if (Number.isNaN(questionCount)) continue;
    concepts.push({
      concept,
      questionCount,
      weekCount,
      assignmentCount,
      pointSum: pointSumRaw ? Number(pointSumRaw) : null,
      taskShape: cells[5],
      priority: cells[6].replace(/\*/g, '').trim(),
      confidence: cells[7].replace(/\*/g, '').trim(),
    });
  }
  return concepts;
}
