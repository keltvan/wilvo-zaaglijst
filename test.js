// Self-check. Usage: node test.js [path/to/Job Traveler_1206250.pdf ...]
// PDFs contain customer data and stay out of the repo; pass them as arguments.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfLines, parseJob, guessPieces, cutBars, partKey, cutShape } from './core.js';

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
assert.equal(cutBars([p(6500)], { bar: 6000 }).tooLong.length, 1);

// shapes, checked against the CAD models
{
  const ruit = cutShape('S355 Koker 100x 50x4 mm L=12 2x 25° ruitvorm tov brede zijde');
  assert.deepEqual(ruit, { a: [25, 25], shape: 'ruit', d: 50, sure: true });
  assert.deepEqual(cutShape('Koker 100x 50x4 mm 1x 22.5° & 1x 45° trapezevorm tov brede zijde').a, [22.5, 45]);
  assert.deepEqual(cutShape('S355 Koker 100x 50x4 mm 2x 25° aan een zijde volgens tekening'), { a: [25, 0], shape: 'trapeze', d: 50, sure: false });
  assert.deepEqual(cutShape('RVS304 koker 40x 40x 2.0 onder 45° verstek zagen'), { a: [45, 45], shape: 'trapeze', d: 40, sure: false });
  assert.equal(cutShape('Koker 100x 50x4 mm 2x 25° ruitvorm tov smalle zijde').d, 100);

  // ruit 937 tip to tip: each next piece costs 913.6 (CAD long edge) + 3/cos25 kerf
  const r5 = Array(5).fill({ len: 937, cut: ruit });
  assert.equal(cutBars(r5, { bar: 4650, kerf: 3 }).bars.length, 2); // 5*937 + 4*3 = 4697
  const n = cutBars(r5, { bar: 4650, kerf: 3, nest: true });
  assert.equal(n.bars.length, 1);
  assert.ok(Math.abs(n.bars[0].end - (937 + 4 * (937 - 50 * Math.tan(25 * Math.PI / 180) + 3 / Math.cos(25 * Math.PI / 180)))) < 0.01);
  // trapezia nest when turned over alternately; one-end pieces pair up slant to slant
  const tz = cutBars(Array(2).fill({ len: 1000, cut: { a: [45, 45], shape: 'trapeze', d: 40 } }), { bar: 6000, nest: true });
  assert.equal(Math.round(tz.bars[0].end), 1960);
  const one = cutBars(Array(2).fill({ len: 304, cut: cutShape('Koker 100x 50x4 mm 2x 25° aan een zijde') }), { bar: 6000, nest: true });
  assert.equal(one.bars[0].end.toFixed(1), (608 - 23.3).toFixed(1));
}

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

// handwritten note under OPERATIONS, OCR'd imperfectly ("Uersteh"); one material row -> applied, marked assumed
{
  const j = parseJob([
    'Job: 2',
    '10 XX9934L60000 ) Extrusion Serv FLR MKII L=6000 20 12500 MM 25.00 M MWIHFMA 10 Backflush',
    'OPERATIONS Setup Prod.',
    '10 ZAAG Zagen 20.00 1.00 0.10 167',
    'Onder 45° Uersteh Zager (2x)',
  ]);
  const r = j.rows[0];
  assert.deepEqual([r.mmPer, r.barHint, r.mitre, r.cut.a, r.cut.shape, r.cut.d, r.cut.sure], [1250, 6000, true, [45, 45], 'trapeze', 0, false]);
  assert.equal(j.notes.length, 1);
  // no profile size yet: nesting falls back to square ends instead of guessing
  assert.equal(cutBars([{ len: 1250, cut: r.cut }, { len: 1250, cut: r.cut }], { bar: 6000, nest: true }).bars[0].end, 2500);
  // two rows: note shown, not applied to either
  const k = parseJob(['Job: 3', '10 XX9934L60000 a 20 1250.0 MM 25.00 M', '20 XX9934L60000 b 20 1000.0 MM 20.00 M', 'OPERATIONS', 'Onder 45° verstek zagen']);
  assert.deepEqual([k.rows[0].mitre, k.rows[1].mitre, k.notes.length], [false, false, 1]);
  // not a mitre: "versteviging"; and "2x 45°" is no profile size
  assert.equal(parseJob(['Job: 4', '10 XX1234567 verstevigingsstrip 4 100.0 MM 0.40 M']).rows[0].mitre, false);
  assert.equal(cutShape('Extrusion 2x 45° verstek').d, 0);
  assert.equal(cutShape('Koker 60x 40x3 (1x) 45° verstek').a[1], 0);
}

// camera frame: A4, turned with the screen; screen frame -> video pixels with object-fit: cover
{
  const { frameRect, cropRect } = await import('./camera.js');
  const p = frameRect(820, 1180), l = frameRect(1180, 820);
  assert.ok(p.portrait && Math.abs(p.w / p.h - 210 / 297) < 1e-9 && p.w <= 820 * 0.92 + 1e-9);
  assert.ok(!l.portrait && Math.abs(l.w / l.h - 297 / 210) < 1e-9);
  // 2000x1000 video shown in 1000x500: scale 0.5, no offset
  assert.deepEqual(cropRect({ left: 100, top: 50, width: 200, height: 100 }, { left: 0, top: 0, width: 1000, height: 500 }, 2000, 1000, 0), { x: 200, y: 100, w: 400, h: 200 });
  // 4:3 video in a tall screen: cut off left and right, frame mapped through the offset; margin clamped to the video
  const r = cropRect({ left: 0, top: 0, width: 400, height: 800 }, { left: 0, top: 0, width: 400, height: 800 }, 1200, 900, 0.04);
  assert.deepEqual([r.y, r.h], [0, 900]);
  assert.ok(r.x > 0 && r.x + r.w <= 1200);
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
