import { LIVE, STATIC, api, hasSample } from './demo.js';

const MAX_SIDE = 1400;
// On a person the loader says which model is at work: Muse dresses them, SAM 3.1 then cuts them out.
const TRY_ON_STEPS = ['Muse reads your photo', 'Muse dresses you', 'Matching every seam', 'SAM 3.1 cuts you out'];
const SECONDS = 20; // Up to the front, which is shown at once. The back follows from it, another image later.
// Without a key the images were made earlier, so the loader says so and runs short: only the cutting out is left.
const REPLAY_STEPS = ['Already made by Muse'];
const REPLAY_SECONDS = 3;

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

// Cutting out reads every pixel of a large image, so it runs in a worker: the loader keeps moving meanwhile.
const cutter = new Worker(new URL('./cut-worker.js', import.meta.url), { type: 'module' });
const jobs = new Map();
let job = 0;
cutter.addEventListener('message', ({ data }) => {
  const { resolve, reject } = jobs.get(data.id);
  jobs.delete(data.id);
  if (data.error) reject(new Error(data.error));
  else resolve(data.url);
});
/** Cuts the figure out and places it on the mannequin's canvas, so the person stands exactly where it did. */
const cutOut = (base64, green, mask) => new Promise((resolve, reject) => {
  jobs.set(++job, { resolve, reject });
  cutter.postMessage({ id: job, base64, green, mask });
});

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

/** Cutting out holds the page for a moment, so the back waits until the front has finished arriving on the stand. */
async function settled() {
  for (let waited = 0; document.body.hasAttribute('data-working') && waited < 4000; waited += 100) await new Promise((done) => setTimeout(done, 100));
  await new Promise(requestAnimationFrame);
}

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
  window.dispatchEvent(new CustomEvent('orbit:wait', { detail: LIVE ? { seconds: SECONDS, steps: TRY_ON_STEPS } : { seconds: REPLAY_SECONDS, steps: REPLAY_STEPS } }));
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
      } else {
        await settled();
        images.back = await cutOut(part.back, green, part.backMask);
      }
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
