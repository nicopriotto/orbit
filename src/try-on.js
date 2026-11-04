import { LIVE, STATIC, api, hasSample } from './demo.js';

const MAX_SIDE = 1400;
const CANVAS = { width: 1120, height: 2130 };
const FIGURE = { top: 70, bottom: 2080 };
const EDGE = 2; // Pixels trimmed from the outline.
// On a person the loader says which model is at work: Muse dresses them, SAM 3.1 then cuts them out.
const TRY_ON_STEPS = ['Muse reads your photo', 'Muse dresses you', 'Matching every seam', 'SAM 3.1 cuts you out'];
const SECONDS = 20; // Up to the front, which is shown at once. The back follows from it, another image later.

const dialog = document.getElementById('upload');
const file = document.getElementById('upload-file');
const consent = document.getElementById('upload-consent');
const send = document.getElementById('upload-send');
const preview = document.getElementById('upload-preview');
const hint = document.getElementById('upload-hint');
const drop = document.getElementById('upload-drop');
const changePhoto = document.getElementById('change-photo');
const errorLine = document.getElementById('upload-error');
const made = new Map(); // Each look on this photo is paid for once.
let photo = null;
let model = null; // One of the two people Muse made, in place of a photo. Their looks are kept on the server for everyone.

const smooth = (low, high, x) => {
  const t = Math.min(Math.max((x - low) / (high - low), 0), 1);
  return t * t * (3 - 2 * t);
};

async function loadImage(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

/** The photo is shrunk here, so the request stays small and nothing larger than needed leaves the device. */
async function shrink(selected) {
  const image = await loadImage(URL.createObjectURL(selected));
  const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

/** Muse drifts from the green it was asked for, more so from a real photo, so the colour to remove is read from the image's own edges. */
function backdrop(data, width, height) {
  const channels = [[], [], []];
  const sample = (x, y) => channels.forEach((values, c) => values.push(data[(y * width + x) * 4 + c]));
  for (let x = 0; x < width; x += 4) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += 4) {
    sample(0, y);
    sample(width - 1, y);
  }
  return channels.map((values) => values.sort((a, b) => a - b)[values.length >> 1]);
}

/** How far a pixel is from being backdrop gone dark: Muse shades the green in gaps between fingers, arms and legs, away from the colour read at the edges. Olive and sage stay below this. */
function shadedGreen(red, green, blue) {
  const excess = green - Math.max(red, blue);
  return smooth(10, 24, excess) * smooth(0.16, 0.28, excess / Math.max(green, 1));
}

/** How green this look's clothes really are, read from the mannequin wearing them, which has no green backdrop to pick up. Olive stays olive and cream stays cream. */
async function clothGreen(look) {
  const image = await loadImage(api(`looks/${look}-front.webp`));
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth >> 2;
  canvas.height = image.naturalHeight >> 2;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const shares = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 250) shares.push((data[i + 1] - Math.max(data[i], data[i + 2])) / Math.max(data[i + 1], 1));
  }
  return shares.sort((a, b) => a - b)[Math.floor(shares.length * 0.9)];
}

/** Each pixel takes the lowest or highest value within a radius, one axis at a time. */
function spread(values, width, height, radius, pick) {
  const across = values.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = values[y * width + x];
      for (let d = Math.max(x - radius, 0); d <= Math.min(x + radius, width - 1); d++) value = pick(value, values[y * width + d]);
      across[y * width + x] = value;
    }
  }
  const result = across.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = across[y * width + x];
      for (let d = Math.max(y - radius, 0); d <= Math.min(y + radius, height - 1); d++) value = pick(value, across[d * width + x]);
      result[y * width + x] = value;
    }
  }
  return result;
}

/**
 * SAM 3.1's mask of the person: well inside it, whatever is not plain backdrop is kept, even something green they
 * wear; well outside it nothing is, so no patch of backdrop survives. Along the edge the chroma key decides.
 */
const MASK_MARGIN = 7; // Pixels of the full image; SAM's person mask comes at about half its resolution.

async function keepPerson(alpha, matte, mask, width, height) {
  const image = await loadImage(`data:image/png;base64,${mask}`).catch(() => null);
  if (!image) return;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const sure = new Uint8Array(width * height);
  for (let p = 0; p < sure.length; p++) sure[p] = data[p * 4];
  // SAM's mask is coarser than the photo, so it only rules away from its own edge: shrunk, it says what is surely the
  // person; grown, what is surely backdrop. The band between is left to the chroma key's finer edge.
  const inside = spread(sure, width, height, MASK_MARGIN, Math.min);
  const outside = spread(sure, width, height, MASK_MARGIN, Math.max);
  for (let p = 0; p < alpha.length; p++) {
    if (outside[p] < 10) alpha[p] = 0;
    // Surely the person, and not plain backdrop: a gap between the fingers is backdrop through and through and stays
    // open, while something green they wear differs from the backdrop enough to be kept.
    else if (inside[p] > 245 && matte[p] > 40) alpha[p] = 255;
  }
}

/** Cuts the figure out and places it on the mannequin's canvas, so the person stands exactly where it did. */
async function cutOut(base64, green, mask) {
  const image = await loadImage(`data:image/webp;base64,${base64}`);
  const source = document.createElement('canvas');
  source.width = image.naturalWidth;
  source.height = image.naturalHeight;
  const context = source.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, source.width, source.height);
  const { data, width, height } = pixels;
  const [keyRed, keyGreen, keyBlue] = backdrop(data, width, height);
  const matte = new Uint8Array(width * height);
  for (let p = 0; p < matte.length; p++) {
    const [red, green, blue] = [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]];
    matte[p] = smooth(0.1, 0.2, Math.hypot(red - keyRed, green - keyGreen, blue - keyBlue) / 255) * (1 - shadedGreen(red, green, blue)) * 255;
  }
  // Pixels on the outline are part background, so the outline is pulled in and whatever green is left nearby is removed.
  const alpha = spread(matte, width, height, EDGE, Math.min);
  if (mask) await keepPerson(alpha, matte, mask, width, height);
  const near = spread(alpha.map((value) => (value < 250 ? 255 : 0)), width, height, EDGE * 2, Math.max);
  let top = height;
  let bottom = 0;
  for (let p = 0; p < alpha.length; p++) {
    const i = p * 4;
    data[i + 3] = alpha[p];
    const brightest = Math.max(data[i], data[i + 2]);
    // Light cloth also reflects the backdrop inside its folds, so nothing stays greener than the look itself.
    data[i + 1] = Math.min(data[i + 1], near[p] ? brightest * 1.02 : brightest / (1 - green));
    if (alpha[p] > 127) {
      const y = Math.floor(p / width);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  let left = width;
  let right = 0;
  for (let y = bottom - Math.floor((bottom - top) * 0.03); y <= bottom; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 127) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  }
  context.putImageData(pixels, 0, 0);
  const scale = (FIGURE.bottom - FIGURE.top) / (bottom - top);
  const placed = document.createElement('canvas');
  Object.assign(placed, CANVAS);
  const target = placed.getContext('2d');
  target.imageSmoothingQuality = 'high';
  target.drawImage(source, CANVAS.width / 2 - ((left + right) / 2) * scale, FIGURE.top - top * scale, width * scale, height * scale);
  return placed.toDataURL('image/webp', 0.92);
}

/** The server sends each image as soon as Muse finishes it, one JSON object per line. */
async function* parts(response) {
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    text += value;
    const lines = text.split('\n');
    text = lines.pop();
    for (const line of lines) yield JSON.parse(line);
  }
}

const ready = () => Boolean((model && (LIVE || hasSample(model, window.orbitLook()))) || (photo && consent.checked));

/** Without a key only a model already dressed in this look can go on, and a photo of your own can't be sent at all. */
function offer() {
  for (const button of document.querySelectorAll('.model')) {
    button.disabled = !LIVE && !hasSample(button.dataset.model, window.orbitLook());
  }
  if (LIVE) return;
  const names = [...document.querySelectorAll('.model')].filter((button) => !button.disabled).map((button) => button.querySelector('b').textContent);
  errorLine.textContent = names.length
    ? `This preview has no API key, so it can't take a photo of you. ${names.join(' and ')} ${names.length > 1 ? 'are' : 'is'} ready in this look.`
    : 'This preview has no API key, and neither model has worn this look yet. Pick one Pin suggests, or Surprise me.';
  errorLine.toggleAttribute('data-note', true);
  errorLine.hidden = false;
}

if (!LIVE) {
  drop.inert = true;
  drop.toggleAttribute('data-off', true);
  hint.innerHTML = 'Your own photo<br />needs an API key';
  consent.closest('label').style.display = 'none';
  send.hidden = true;
}

function refresh() {
  send.disabled = !(photo && consent.checked);
}

async function takePhoto(selected) {
  if (!selected) return;
  errorLine.hidden = !(errorLine.textContent = file.accept.includes(selected.type) ? '' : 'Use a JPEG, PNG or WebP photo.');
  if (!errorLine.hidden) return;
  photo = await shrink(selected);
  model = null;
  made.clear();
  preview.src = photo;
  document.getElementById('change-photo-image').src = photo;
  preview.hidden = false;
  hint.hidden = true;
  refresh();
}

file.addEventListener('change', () => takePhoto(file.files[0]));
for (const name of ['dragenter', 'dragover']) {
  drop.addEventListener(name, (event) => {
    event.preventDefault();
    drop.toggleAttribute('data-over', true);
  });
}
drop.addEventListener('dragleave', () => drop.removeAttribute('data-over'));
drop.addEventListener('drop', (event) => {
  event.preventDefault();
  drop.removeAttribute('data-over');
  takePhoto(event.dataTransfer.files[0]);
});
consent.addEventListener('change', refresh);
document.getElementById('upload-cancel').addEventListener('click', () => dialog.close());
/** Each look on this photo is paid for once, so one already made is only put back on. */
function wearOrDress() {
  const ready = made.get(window.orbitLook());
  dialog.close();
  if (ready) window.dispatchEvent(new CustomEvent('orbit:wear', { detail: ready }));
  else dress();
}

document.getElementById('try').addEventListener('click', () => {
  if (ready()) return wearOrDress();
  offer();
  dialog.showModal();
});

// A model goes straight on: nothing to upload, nothing to agree to.
for (const button of document.querySelectorAll('.model')) {
  button.addEventListener('click', () => {
    if (model !== button.dataset.model) made.clear();
    model = button.dataset.model;
    photo = null;
    preview.hidden = true;
    hint.hidden = false;
    consent.checked = false;
    refresh();
    document.getElementById('change-photo-image').src = `studio/models/${model}-face.webp`;
    wearOrDress();
  });
}
changePhoto.addEventListener('click', () => {
  offer();
  dialog.showModal();
});

// Make it again: only for the photo given in this visit, and only for the look on the stand now.
window.orbitCanRedo = (look) => Boolean(!model && photo && consent.checked && made.has(look) && look === window.orbitLook());
window.addEventListener('orbit:redo', (event) => {
  if (!window.orbitCanRedo(event.detail.look)) return;
  made.delete(event.detail.look);
  dress();
});

document.getElementById('upload-form').addEventListener('submit', (event) => {
  event.preventDefault();
  wearOrDress();
});

/** A static copy has each model's look as a file, and plays it back the way the server streams it: front, then back. */
async function ask(body) {
  if (!STATIC) return fetch('api/try-on', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const kept = await fetch(api(`samples/${body.model}-${body.look}.json`)).then((response) => response.json());
  const lines = [{ front: kept.front, frontMask: kept.frontMask }, { back: kept.back, backMask: kept.backMask }];
  return new Response(lines.map((part) => `${JSON.stringify(part)}\n`).join(''));
}

/** Once the visitor has given a photo, every further look goes straight to Muse. */
async function dress() {
  const look = window.orbitLook();
  dialog.close();
  changePhoto.hidden = false;
  window.dispatchEvent(new CustomEvent('orbit:wait', { detail: { seconds: SECONDS, steps: TRY_ON_STEPS } }));
  const images = { look };
  try {
    const response = await ask(model ? { model, look } : { photo, look });
    if (!response.ok) throw new Error((await response.json()).error);
    const green = await clothGreen(look);
    for await (const part of parts(response)) {
      if (part.front) {
        images.front = await cutOut(part.front, green, part.frontMask);
        made.set(look, images);
        window.dispatchEvent(new CustomEvent('orbit:wear', { detail: images }));
      } else images.back = await cutOut(part.back, green, part.backMask);
    }
    if (!images.front) throw new Error();
  } catch (error) {
    if (!images.front) {
      window.dispatchEvent(new CustomEvent('orbit:wait'));
      errorLine.textContent = error.message || 'Something went wrong. Try again in a moment.';
      errorLine.removeAttribute('data-note');
      errorLine.hidden = false;
      dialog.showModal();
      return;
    }
  }
  // A front without a back stays on show, but it isn't kept: the next attempt starts over.
  if (!images.back) {
    images.failed = true;
    made.delete(look);
  }
  window.dispatchEvent(new CustomEvent('orbit:back'));
}
