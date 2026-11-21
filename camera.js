// Camera with a fixed A4 frame: the sawyer lines the job up inside it, the photo is cropped to the frame
// (plus a small margin), so the text recognition gets the paper and not the workbench around it.
const A4 = 297 / 210; // the job traveler is A4 landscape
const MARGIN = 0.04;  // extra around the frame, for a job that is not exactly inside it

export const cameraSupported = () => !!navigator.mediaDevices?.getUserMedia;

// Frame as large as fits between the top text and the button bar; turned with the screen, so a landscape
// sheet fills an upright phone too (the recognition turns the photo upright itself).
export function frameRect(W, H, top = 56, bottom = 120) {
  const portrait = H > W, ratio = portrait ? 1 / A4 : A4;
  const aw = W * 0.92, ah = (H - top - bottom) * 0.94;
  const w = Math.min(aw, ah * ratio), h = w / ratio;
  return { x: (W - w) / 2, y: top + (H - top - bottom - h) / 2, w, h, portrait };
}

// Screen rectangle -> pixels of the video frame, for a <video> shown with object-fit: cover.
export function cropRect(frame, view, vw, vh, margin = MARGIN) {
  const s = Math.max(view.width / vw, view.height / vh);
  const ox = view.left + (view.width - vw * s) / 2, oy = view.top + (view.height - vh * s) / 2;
  const m = margin * Math.max(frame.width, frame.height);
  const x0 = Math.max(0, (frame.left - m - ox) / s), y0 = Math.max(0, (frame.top - m - oy) / s);
  const x1 = Math.min(vw, (frame.left + frame.width + m - ox) / s), y1 = Math.min(vh, (frame.top + frame.height + m - oy) / s);
  return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
}

// A still photo has more pixels than the video, and often another shape (4:3 sensor vs 16:9 video). The video is
// taken to be the centred part of the photo with the video's shape; k = photo pixels per video pixel.
// Gives up (null) when the photo is turned differently from the video: then the video frame is used.
async function fullPhoto(track, vw, vh) {
  if (!('ImageCapture' in window)) return null;
  const img = await createImageBitmap(await new ImageCapture(track).takePhoto(), { imageOrientation: 'from-image' });
  const pw = img.width, ph = img.height;
  if ((pw > ph) !== (vw > vh) || pw <= vw) return null;
  const k = Math.min(pw / vw, ph / vh);
  return { img, k, ox: (pw - vw * k) / 2, oy: (ph - vh * k) / 2 };
}

// Opens the camera view. Resolves with a cropped JPEG File, or null when cancelled.
// Rejects when there is no camera or no permission: the caller falls back to the normal photo picker.
export async function openCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
  });
  const track = stream.getVideoTracks()[0];
  const ui = document.createElement('div');
  ui.className = 'cam';
  ui.setAttribute('role', 'dialog');
  ui.setAttribute('aria-label', 'Foto van de job maken');
  ui.innerHTML = `<video playsinline muted autoplay></video>
    <div class="cam-frame"><i></i><i></i><i></i><i></i></div>
    <div class="cam-top">Leg de job plat en laat hem het kader vullen</div>
    <div class="cam-bar"><button class="cam-cancel" type="button">Annuleren</button>
      <button class="cam-shot" type="button" aria-label="Foto maken"></button>
      <button class="cam-torch" type="button" hidden>Lamp</button></div>`;
  document.body.append(ui);
  const video = ui.querySelector('video'), frame = ui.querySelector('.cam-frame');
  video.srcObject = stream;
  await video.play().catch(() => {});

  const layout = () => {
    const f = frameRect(innerWidth, innerHeight, ui.querySelector('.cam-top').offsetHeight + 16, ui.querySelector('.cam-bar').offsetHeight + 16);
    Object.assign(frame.style, { left: f.x + 'px', top: f.y + 'px', width: f.w + 'px', height: f.h + 'px' });
  };
  layout();
  addEventListener('resize', layout);

  // lamp: only where the browser offers it (Android Chrome); iPad/iPhone Safari don't
  const torch = ui.querySelector('.cam-torch');
  let on = false;
  if (track.getCapabilities?.().torch) {
    torch.hidden = false;
    torch.onclick = async () => { on = !on; await track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {}); torch.classList.toggle('on', on); };
  }

  return new Promise(resolve => {
    const close = file => {
      removeEventListener('resize', layout);
      removeEventListener('keydown', key);
      stream.getTracks().forEach(t => t.stop());
      ui.remove();
      resolve(file);
    };
    const key = e => { if (e.key === 'Escape') close(null); };
    addEventListener('keydown', key);
    ui.querySelector('.cam-cancel').onclick = () => close(null);
    const shot = ui.querySelector('.cam-shot');
    shot.onclick = async () => {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || shot.disabled) return; // camera not running yet / already busy
      shot.disabled = true;
      const r = cropRect(frame.getBoundingClientRect(), video.getBoundingClientRect(), vw, vh);
      // full-resolution still where the browser offers it (Chrome on Android), else the video frame (Safari)
      const still = await fullPhoto(track, vw, vh).catch(() => null);
      const src = still?.img || video, k = still?.k || 1, ox = still?.ox || 0, oy = still?.oy || 0;
      const c = document.createElement('canvas');
      c.width = Math.round(r.w * k); c.height = Math.round(r.h * k);
      c.getContext('2d').drawImage(src, ox + r.x * k, oy + r.y * k, r.w * k, r.h * k, 0, 0, c.width, c.height);
      c.toBlob(b => close(new File([b], 'camera.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.92);
    };
  });
}
