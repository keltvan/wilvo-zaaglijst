// Self-check. Usage: node test.js [path/to/Job Traveler_1206250.pdf ...]
// PDFs contain customer data and stay out of the repo; pass them as arguments.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfLines, parseJob, guessPieces, cutBars, partKey } from './core.js';

// guessPieces
assert.deepEqual(guessPieces(2696, [1348, 500]), { perProduct: 2, source: 'tekst' });
assert.deepEqual(guessPieces(620, [1348, 500]), { perProduct: 1, source: 'aangenomen' });
assert.deepEqual(guessPieces(1000, [500, 250]), { perProduct: 1, source: 'meerdere' });

// cutBars: 7 x 1900 from 6000 -> 3 bars (not 13.3/6 = 2.2)
const p = (len, mitre = false) => ({ len, mitre });
assert.equal(cutBars(Array(7).fill(p(1900)), { bar: 6000 }).bars.length, 3);
// kerf: 3 x 2000 fits without kerf, not with it
assert.equal(cutBars(Array(3).fill(p(2000)), { bar: 6000 }).bars.length, 1);
assert.equal(cutBars(Array(3).fill(p(2000)), { bar: 6000, kerf: 3 }).bars.length, 2);
// nesting: 3 x 2020 mitred fits with 40 mm offset (2020 + 2*1983 = 5986), not without
assert.equal(cutBars(Array(3).fill(p(2020, true)), { bar: 6000, kerf: 3 }).bars.length, 2);
assert.equal(cutBars(Array(3).fill(p(2020, true)), { bar: 6000, kerf: 3, nestOffset: 40 }).bars.length, 1);
assert.equal(cutBars([p(6500)], { bar: 6000 }).tooLong.length, 1);

// OCR-style lines: junk before the seq, dropped decimal points, O for 0
{
  const j = parseJob([
    'Job: 12345678',
    '| Foi ABCD080010   blank plat 80 x 10   4   800 MM   032 M  MWIDIVER 10 Backflush',
    '1230 KOR4O4004020 RVS304 koker 40x 40x 2.0 3 2696.0 MM 8.09 M MWIHFMA',
    '| onder 45° verstek zagen',
    '40 XYZ123456 something 4 61.0 MM 0.20 M',
    'Kokers van L=1348 lang',
  ]);
  assert.equal(j.job, '12345678');
  assert.deepEqual(j.rows.map(r => [r.seq, r.mmPer, r.totalM, r.check, r.repaired]), [
    ['?', 80, 0.32, true, true], ['1230', 2696, 8.09, true, false], ['40', 61, 0.2, false, false]]);
  assert.equal(j.rows[1].perProduct, 2);
  assert.ok(j.rows[1].mitre);
  assert.equal(partKey('KOR4O4004020'), partKey('KOR404004020'));
  assert.deepEqual(parseJob(['10 ABC123456 x 4 garbage MM']).warnings.length, 2); // unreadable MM line is reported
}

// "L=12" = 12 m bar, not a 12 mm piece; "25°" without the word verstek is still an angled cut; page headers stay out of desc
{
  const j = parseJob([
    'Job: 1',
    '10 XK10005004L12 S355 Koker 100x 50x4 mm L=12 5 937.0 MM 4.69 M',
    '2x 25° ruitvorm tov brede zijde',
    'Page: 2 / 3',
    'Date: 01/01/2026 Job Traveler',
    '20 XP06012 S355 Plat 60x12 5 60.0 MM 0.30 M',
  ]);
  assert.deepEqual(j.rows.map(r => [r.barHint, r.mitre, r.perProduct]), [[12000, true, 1], [null, false, 1]]);
  assert.ok(!/Page/.test(j.rows[0].desc));
}

// real PDFs, expected values per job number
// Expected values per job live in test-expect.local.json (customer data, not committed).
const expect = process.argv.length > 2 ? JSON.parse(fs.readFileSync(new URL('./test-expect.local.json', import.meta.url))) : {};
for (const f of process.argv.slice(2)) {
  const job = parseJob(await pdfLines(new Uint8Array(fs.readFileSync(f)), pdfjs), f);
  const exp = expect[job.job];
  assert.ok(exp, `no expectations for job ${job.job}`);
  assert.deepEqual(job.warnings, [], `${job.job} warnings`);
  assert.equal(job.rows.length, exp.length, `${job.job} row count`);
  exp.forEach((e, i) => {
    for (const k in e) assert.equal(job.rows[i][k], e[k], `${job.job} row ${i} ${k}`);
    assert.ok(job.rows[i].check, `${job.job} row ${i} mm x qty = m`);
  });
  console.log('ok', job.job, job.product, job.rows.length, 'rows');
}
console.log('all checks passed');
