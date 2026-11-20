// Photo of a paper Job Traveler -> text lines. Runs fully on the device (Tesseract WASM, vendored).
let workerP;
function worker() {
  return workerP ||= window.Tesseract.createWorker('eng', 1, {
    workerPath: './vendor/tesseract/worker.min.js', corePath: './vendor/tesseract/', langPath: './vendor/tesseract/', gzip: true,
  }).then(async w => { await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' }); return w; });
}

const toGray = (ctx, w, h) => {
  const d = ctx.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] * 3 + d[i * 4 + 1] * 6 + d[i * 4 + 2]) / 10;
  return g;
};

// Text lines give sharp peaks in a row histogram; the angle with the sharpest peaks is the skew.
function skew(g, w, h, from, to, step) {
  // ink = clearly darker than the pixels 4 left and right; ignores shadows and lighting gradients
  const ink = new Uint8Array(g.length);
  for (let i = 4; i < g.length - 4; i++) ink[i] = g[i] < Math.min(g[i - 4], g[i + 4]) - 25 ? 1 : 0;
  let best = 0, bestScore = -1;
  for (let a = from; a <= to + 1e-9; a += step) {
    const t = Math.tan(a * Math.PI / 180), rows = new Float64Array(h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x += 2) if (ink[y * w + x]) rows[(y - x * t + h) | 0]++;
    let s = 0, n = 0; for (const v of rows) { s += v * v; n += v; }
    s = n ? s * h / (n * n) : 0; // 1 = ink spread evenly, higher = sharp text lines; comparable across orientations
    if (s > bestScore) { bestScore = s; best = a; }
  }
  return { angle: best, score: bestScore };
}

function draw(src, angleDeg, side, fill = '#fff') {
  const r = angleDeg * Math.PI / 180, sc = side / Math.max(src.width, src.height);
  const w = src.width * sc, h = src.height * sc;
  const cw = Math.round(Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r))), ch = Math.round(Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r)));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = fill; ctx.fillRect(0, 0, cw, ch);
  ctx.translate(cw / 2, ch / 2); ctx.rotate(r); ctx.drawImage(src, -w / 2, -h / 2, w, h);
  return c;
}

// Even out shadows: divide each pixel by a heavily blurred copy (the lighting), so paper becomes white everywhere.
function flatten(c) {
  const { width: w, height: h } = c, ctx = c.getContext('2d', { willReadFrequently: true });
  const b = document.createElement('canvas'); b.width = w; b.height = h;
  const bctx = b.getContext('2d', { willReadFrequently: true });
  bctx.filter = `blur(${Math.round(w / 60)}px)`; bctx.drawImage(c, 0, 0);
  const im = ctx.getImageData(0, 0, w, h), d = im.data, bg = bctx.getImageData(0, 0, w, h).data;
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 3 + d[i + 1] * 6 + d[i + 2]) / 10, l = (bg[i] * 3 + bg[i + 1] * 6 + bg[i + 2]) / 10 || 1;
    d[i] = d[i + 1] = d[i + 2] = Math.min(255, 255 * g / l);
  }
  ctx.putImageData(im, 0, 0);
  return c;
}

// Upright + straight + ~2600 px wide (enough for the small table text, not so big that phones choke).
export async function prepare(file) {
  const img = await createImageBitmap(file, { imageOrientation: 'from-image' });
  let best = null;
  for (const turn of [0, 90]) { // phone held portrait over a landscape sheet
    const s = draw(img, turn, 900), g = toGray(s.getContext('2d'), s.width, s.height);
    const k = skew(g, s.width, s.height, -6, 6, 0.5);
    if (!best || k.score > best.score) best = { ...k, turn, s, g };
  }
  const fine = skew(best.g, best.s.width, best.s.height, best.angle - 0.5, best.angle + 0.5, 0.1).angle;
  // fill rotated corners with the paper colour: white corners on grey paper wreck Tesseract's global threshold
  let m = 0; for (const v of best.g) m += v; m = Math.round(m / best.g.length);
  const render = angle => flatten(draw(img, best.turn - fine + angle, 2600, `rgb(${m},${m},${m})`));
  render.info = { turn: best.turn, skew: fine };
  return render;
}

// Returns text lines; tries upside down too when the first read finds no material rows.
export async function ocrLines(file, looksRight) {
  const [w, render] = await Promise.all([worker(), prepare(file)]);
  let lines = [];
  for (const flip of [0, 180]) {
    const { data } = await w.recognize(render(flip));
    lines = data.text.split('\n');
    if (looksRight(lines)) break;
  }
  return lines;
}
