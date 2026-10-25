/**
 * RFC 4180-style CSV parser (quote-aware, BOM-stripping, CRLF-tolerant).
 * Not split(','): handles quoted fields with commas, escaped quotes and
 * embedded newlines exactly once per row.
 */
export function stripBom(text) {
  return typeof text === 'string' && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Parse CSV text into an array of row arrays (including the header row).
 */
export function parseCsv(text) {
  const t = stripBom(String(text ?? ''));
  const rows = [];
  let i = 0;
  const n = t.length;
  while (i < n) {
    const row = [];
    let field = '';
    let inQuotes = false;
    let gotNewline = false;
    while (i < n) {
      const c = t[i];
      if (inQuotes) {
        if (c === '"') {
          if (t[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i += 1; continue;
        }
        field += c; i += 1; continue;
      }
      if (c === '"') { inQuotes = true; i += 1; continue; }
      if (c === ',') { row.push(field); field = ''; i += 1; continue; }
      if (c === '\r') { i += 1; continue; }
      if (c === '\n') { row.push(field); field = ''; i += 1; gotNewline = true; break; }
      field += c; i += 1;
    }
    if (!gotNewline) row.push(field);
    // Skip rows that are entirely empty (trailing newline artifacts)
    if (row.some((cell) => cell !== '')) rows.push(row);
    if (!gotNewline) break;
  }
  return rows;
}

/**
 * Parse CSV text into objects keyed by the header row.
 */
export function parseCsvObjects(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((row) => {
    const obj = {};
    header.forEach((key, idx) => { obj[key] = row[idx] ?? ''; });
    return obj;
  });
}
