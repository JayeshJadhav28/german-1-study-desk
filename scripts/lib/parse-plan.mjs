/**
 * Parse 06_Seven_Day_Revision_Plan.md into day/task structures.
 */
export function parseRevisionPlan(markdownText) {
  const text = String(markdownText ?? '');
  const examDate = /exam listed as \*\*([^*]+)\*\*|exam date \*\*([^*]+)\*\*|\*\*([^*]*October 2026)\*\*/i.exec(text);
  const days = [];
  // split with 3 capture groups yields [pre, c1, c2, c3, body1, c1, c2, c3, body2, …]
  const daySplit = text.split(/^## Day (\d+)\s*\(([^)]+)\)\s*—\s*(.+)$/m);
  for (let i = 1; i + 3 < daySplit.length; i += 4) {
    const dayNum = Number(daySplit[i]);
    const dateLabel = daySplit[i + 1].trim();
    const title = daySplit[i + 2].trim();
    let body = daySplit[i + 3] || '';
    const nextIdx = body.search(/\n## /);
    if (nextIdx >= 0) body = body.slice(0, nextIdx);

    const tasks = [];
    const lines = body.split(/\r?\n/);
    for (const line of lines) {
      const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
      if (!bullet) continue;
      let taskText = bullet[1].trim();
      // skip pure tracking-table junk / meta lines
      if (/^\|/.test(taskText)) continue;
      let category = '';
      const cat = /^\*\*([^*]+)\*\*\s*/.exec(taskText);
      if (cat) { category = cat[1].replace(/:$/, '').trim(); taskText = taskText.slice(cat[0].length).trim(); }
      // strip inline emphasis for plain display but keep content
      tasks.push({
        id: `d${dayNum}-t${tasks.length + 1}`,
        category,
        text: taskText.replace(/\*\*/g, '').trim(),
      });
    }
    days.push({ dayNum, dateLabel, title, tasks, taskCount: tasks.length });
  }
  return {
    examDateText: examDate ? (examDate[1] || examDate[2] || examDate[3]).trim() : '',
    days,
    totalTasks: days.reduce((s, d) => s + d.tasks.length, 0),
  };
}
