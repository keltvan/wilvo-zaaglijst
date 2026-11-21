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
  const textLens = [...text.matchAll(/L\s*=\s*(\d+(?:[.,]\d+)?)|lengte van\s*(\d+(?:[.,]\d+)?)/gi)].map(m => num(m[1] || m[2]))
    .filter(v => v > 24); // "L=12" is the bar length in metres ("Koker 100x50x4 mm L=12"), not a piece length
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
      if (lines[j].length > 2 && !/^(Page|Date):/.test(lines[j])) desc += ' ' + lines[j];
    }
    const qty = num(m[3]);
    const seq = (line.slice(0, m.index + 1).match(/(\d+)\D*$/) || [])[1] || '?';
    const r = { seq, part: m[1], desc, qty, ...fixNumbers(qty, m[4], m[5]) };
    const mmPer = r.mmPer;
    r.mitre = /verstek|\d\s*°/i.test(desc); // any angled cut ("2x 25° ruitvorm"), not only the word verstek
    r.cut = r.mitre ? cutShape(desc) : null;
    const bar = num((desc.match(/L\s*=\s*(\d+(?:[.,]\d+)?)/) || [])[1]);
    r.barHint = bar >= 2000 ? bar : bar >= 3 && bar <= 24 ? bar * 1000 : null; // mm, or metres (L=12)
    const dim = desc.match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/i);
    r.height = dim ? num(dim[1]) : null;
    Object.assign(r, guessPieces(mmPer, textLens));
    rows.push(r);
  });
  if (!rows.length) warnings.push('Geen zaagmateriaal (MM/M) gevonden.');
  return { job, product, rows, warnings };
}

// Angled ends from the description. Checked against CAD (seq "2x 25° ruitvorm tov brede zijde" on a 100x50 tube):
// angle is from square, the slant runs across the SMALL side, and the job length is tip to tip.
//   a: [left, right] angles; shape: 'ruit' (ends parallel) | 'trapeze' (ends mirrored) | null (unknown -> counted square);
//   d: profile size the slant runs across; sure: false when shape or side was assumed.
export function cutShape(desc) {
  const pairs = [...desc.matchAll(/(\d)\s*x\s*(\d+(?:[.,]\d+)?)\s*°/gi)].flatMap(m => Array(+m[1]).fill(num(m[2])));
  const one = num((desc.match(/(\d+(?:[.,]\d+)?)\s*°/) || [])[1]);
  const oneEnd = /aan een zijde/i.test(desc); // CAD seq "2x 25° aan een zijde": one end 25°, other end square
  const a = oneEnd ? [one, 0] : pairs.length === 2 ? pairs : [one, one];
  const dims = (desc.match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/i) || []).slice(1).map(num);
  const big = /tov smalle zijde/i.test(desc), small = /tov brede zijde/i.test(desc);
  const d = dims.length ? (big ? Math.max(...dims) : Math.min(...dims)) : 0; // unknown side: smaller saving = safe side
  let shape = /ruit/i.test(desc) ? 'ruit' : /trapez/i.test(desc) || oneEnd ? 'trapeze' : null;
  let sure = !!shape && (big || small || dims[0] === dims[1]);
  if (!shape && /verstek/i.test(desc)) { shape = 'trapeze'; sure = false; } // classic frame mitre, assumed
  if (!(a[0] < 90 && a[1] < 90 && d)) shape = null;
  return { a, shape, d, sure: sure && !!shape };
}

// How many pieces per product? Only trust it when exactly one written length divides evenly.
export function guessPieces(mmPer, textLens) {
  const hits = [...new Set(textLens)].filter(v => v > 0 && v <= mmPer && Math.abs(mmPer / v - Math.round(mmPer / v)) < 0.001 && mmPer / v <= 50);
  if (hits.length === 1) return { perProduct: Math.round(mmPer / hits[0]), source: 'tekst' };
  return { perProduct: 1, source: hits.length ? 'meerdere' : 'aangenomen' };
}

// A piece seen from the side where the slant shows: top edge ts..te, bottom edge bs..be (mm from its left tip),
// aL/aR = end angles. Four ways to lay it on the saw: as is, turned over, end for end, both.
const rad = a => a * Math.PI / 180;
function poses(p, nest) {
  const c = nest && p.cut?.shape ? p.cut : null, L = p.len;
  if (!c) return [{ ts: 0, te: L, bs: 0, be: L, aL: 0, aR: 0 }];
  const oL = c.d * Math.tan(rad(c.a[0])), oR = c.d * Math.tan(rad(c.a[1])), tr = c.shape === 'trapeze';
  const o = { ts: oL, te: tr ? L - oR : L, bs: 0, be: tr ? L : L - oR, aL: c.a[0], aR: c.a[1] };
  const over = q => ({ ...q, ts: q.bs, te: q.be, bs: q.ts, be: q.te });
  const flip = q => ({ ts: L - q.te, te: L - q.ts, bs: L - q.be, be: L - q.bs, aL: q.aR, aR: q.aL });
  return [o, over(o), flip(o), over(flip(o))];
}

// First-fit decreasing; each piece goes in the first bar where it fits, laid the way that ends shortest.
// nest: slanted ends share one cut with the previous piece. Kerf is measured square to the cut.
export function cutBars(pieces, { bar, kerf = 0, trim = 0, nest = false }) {
  const bars = [], tooLong = [];
  const place = (b, p) => {
    let best = null;
    for (const q of poses(p, nest)) {
      const prev = b.pieces.at(-1);
      const g = prev ? kerf / Math.cos(rad(Math.max(prev.aR, q.aL))) : 0;
      const x = prev ? Math.max(prev.x + prev.te + g - q.ts, prev.x + prev.be + g - q.bs) : trim;
      const end = x + Math.max(q.te, q.be), low = x + Math.min(q.te, q.be);
      // tie: keep the slant open to the right, so the next piece can nest into it
      if (!best || end < best.end - 1e-6 || (end < best.end + 1e-6 && low < best.low - 1e-6)) best = { ...p, ...q, x, end, low };
    }
    return best;
  };
  for (const p of [...pieces].sort((a, b) => b.len - a.len)) {
    if (p.len > bar - trim) { tooLong.push(p); continue; }
    let b, q;
    for (const c of bars) if ((q = place(c, p)).end <= bar + 1e-6) { b = c; break; }
    if (!b) { bars.push(b = { pieces: [] }); q = place(b, p); }
    b.pieces.push(q);
    b.end = q.end;
  }
  bars.forEach(b => { b.used = b.end - trim; b.rest = Math.round(bar - b.end); });
  return { bars, tooLong };
}
