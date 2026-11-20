// Parsing of Epicor "Job Traveler" PDFs + bar cutting. Shared by index.html and test.js.

const N = '(\\d+(?:[.,]\\d+)?)';
// part, middle text (description), qty, mm per product, total metres. Not anchored: OCR puts junk before the seq.
const ROW = new RegExp(`(?:^|\\s)([A-Z0-9][A-Z0-9._/-]{5,})\\s+(.*?)\\b${N}\\s+${N}\\s*M\\s?M\\s+${N}\\s*M\\b`);
const num = s => parseFloat(String(s).replace(',', '.'));
// OCR mixes up O/0 and I/L/1 in part codes; group on this key so both spellings land on one profile
export const partKey = p => p.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');

// OCR drops decimal points ("800 MM", "032 M"). Epicor prints mm with 1 and m with 2 decimals,
// so try those repairs and only accept one that makes qty x mm = m hold.
function fixNumbers(qty, mmS, mS) {
  const mms = [num(mmS)], ms = [num(mS)];
  if (!/[.,]/.test(mmS)) mms.push(num(mmS) / 10);
  if (!/[.,]/.test(mS)) ms.push(num(mS) / 100);
  for (const mmPer of mms) for (const totalM of ms) {
    if (Math.abs(qty * mmPer / 1000 - totalM) <= 0.011) return { mmPer, totalM, check: true, repaired: mmPer !== mms[0] || totalM !== ms[0] };
  }
  return { mmPer: mms[0], totalM: ms[0], check: false, repaired: false };
}

// pdf.js text items -> text lines (top to bottom, left to right)
export async function pdfLines(data, pdfjs) {
  const doc = await pdfjs.getDocument({ data }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const { items } = await (await doc.getPage(p)).getTextContent();
    const lines = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5];
      let l = lines.find(l => Math.abs(l.y - y) < 2);
      if (!l) lines.push(l = { y, items: [] });
      l.items.push(it);
    }
    lines.sort((a, b) => b.y - a.y);
    for (const l of lines) out.push(l.items.sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str.trim()).join(' '));
  }
  return out;
}

export function parseJob(rawLines, fileName = '') {
  const lines = rawLines.map(l => l.replace(/[|{}[\]]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const text = lines.join('\n');
  const job = (text.match(/Job:\s*(\d+)/) || [])[1] || fileName;
  const product = ((text.match(/Description:\s*(.*)/) || [])[1] || '').replace(/\s+For (Order|Stock).*/, '').trim();
  // piece lengths a person wrote in the text: "L=1348", "lengte van 822 mm"
  const textLens = [...text.matchAll(/L\s*=\s*(\d+(?:[.,]\d+)?)|lengte van\s*(\d+(?:[.,]\d+)?)/gi)].map(m => num(m[1] || m[2]));
  const rows = [], warnings = [];
  lines.forEach((line, i) => {
    const m = line.match(ROW);
    if (!m || !/\d{3}/.test(m[1])) {
      // material rows always carry "MM"; one we can't read must not vanish silently
      if (/\bM\s?M\b/.test(line)) warnings.push(`Regel niet herkend: "${line.slice(0, 80)}"`);
      return;
    }
    // description = middle of the row + following lines up to the next row / section
    let desc = m[2].trim();
    for (let j = i + 1; j < lines.length && !ROW.test(lines[j]) && !/^OPERATIONS/i.test(lines[j]); j++) {
      if (lines[j].length > 2) desc += ' ' + lines[j];
    }
    const qty = num(m[3]);
    const seq = (line.slice(0, m.index + 1).match(/(\d+)\D*$/) || [])[1] || '?';
    const r = { seq, part: m[1], desc, qty, ...fixNumbers(qty, m[4], m[5]) };
    const mmPer = r.mmPer;
    r.mitre = /verstek/i.test(desc);
    r.angle = r.mitre ? num((desc.match(/(\d+(?:[.,]\d+)?)\s*°/) || [])[1]) || null : null;
    const bar = desc.match(/L\s*=\s*(\d{4,5})\b/);
    r.barHint = bar && num(bar[1]) >= 2000 ? num(bar[1]) : null;
    const dim = desc.match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/i);
    r.height = dim ? num(dim[1]) : null;
    Object.assign(r, guessPieces(mmPer, textLens));
    rows.push(r);
  });
  if (!rows.length) warnings.push('Geen zaagmateriaal (MM/M) gevonden.');
  return { job, product, rows, warnings };
}

// How many pieces per product? Only trust it when exactly one written length divides evenly.
export function guessPieces(mmPer, textLens) {
  const hits = [...new Set(textLens)].filter(v => v > 0 && v <= mmPer && Math.abs(mmPer / v - Math.round(mmPer / v)) < 0.001 && mmPer / v <= 50);
  if (hits.length === 1) return { perProduct: Math.round(mmPer / hits[0]), source: 'tekst' };
  return { perProduct: 1, source: hits.length ? 'meerdere' : 'aangenomen' };
}

// First-fit decreasing. nestOffset: length saved per extra mitred piece when cut alternately.
export function cutBars(pieces, { bar, kerf = 0, trim = 0, nestOffset = 0 }) {
  const usable = bar - trim;
  const bars = [], tooLong = [];
  const cost = (b, p) => b.pieces.length ? p.len + kerf - (p.mitre && b.pieces.at(-1).mitre ? nestOffset : 0) : p.len;
  for (const p of [...pieces].sort((a, b) => b.len - a.len)) {
    if (p.len > usable) { tooLong.push(p); continue; }
    let b = bars.find(b => b.used + cost(b, p) <= usable);
    if (!b) bars.push(b = { pieces: [], used: 0 });
    b.used += cost(b, p);
    b.pieces.push(p);
  }
  bars.forEach(b => b.rest = Math.round(usable - b.used));
  return { bars, tooLong };
}
