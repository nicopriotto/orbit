// The store's side: two photos of a garment go in, Muse Spark reads them into a catalogue entry and tells SAM 3.1 what
// to look for, SAM cuts the garment out of each photo, and the store gives it a price and hangs it in the wardrobe.
// Each model's step is shown as it happens, so it is clear what is doing the work.
import { KINDS } from './wardrobe.js';

const $ = (id) => document.getElementById(id);
const dialog = $('atelier');
const form = $('entry');
const note = $('model-note');
const go = $('atelier-go');
const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
const LONGEST = 1600;
const INTRO = 'Add both sides of the garment, flat or on a hanger, on any background.';

const shots = Object.fromEntries([...dialog.querySelectorAll('.shot')].map((shot) => [shot.dataset.side, shot]));
const photos = {}; // Data URLs, already brought down to LONGEST.
let draft = null;
let phase = 'photos'; // photos → reading → named → hanging → done
let run = 0; // A newer start or a reset makes an older stream's lines land nowhere.

form.kind.append(...KINDS.map((kind) => new Option(kind.label, kind.id)));

/* The four steps along the top */

function step(name, state) {
  const item = $('flow').querySelector(`[data-step="${name}"]`);
  if (state) item.dataset.state = state;
  else delete item.dataset.state;
}

function say(text) {
  if (note.textContent === text) return;
  note.textContent = text;
  if (motion) note.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
}

function fail(message) {
  $('atelier-error').textContent = message;
  $('atelier-error').hidden = false;
  $('atelier-again').hidden = false;
  for (const name of ['spark', 'sam']) if ($('flow').querySelector(`[data-step="${name}"]`).dataset.state === 'active') step(name, 'failed');
  for (const shot of Object.values(shots)) shot.removeAttribute('data-scanning');
  go.textContent = 'Try again';
  go.disabled = false;
  phase = 'failed';
}

/* Photos */

async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LONGEST / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

async function take(side, file) {
  if (!file || phase !== 'photos' || !/^image\/(jpeg|png|webp)$/.test(file.type)) return;
  photos[side] = await shrink(file);
  const shot = shots[side];
  const image = shot.querySelector('.shot-photo');
  image.src = photos[side];
  image.hidden = false;
  shot.toggleAttribute('data-filled', true);
  const ready = photos.front && photos.back;
  go.disabled = !ready;
  say(ready ? 'Both sides are in. Muse Spark reads them first.' : `Now the ${side === 'front' ? 'back' : 'front'}.`);
}

for (const [side, shot] of Object.entries(shots)) {
  const input = shot.querySelector('input');
  input.addEventListener('change', () => take(side, input.files[0]));
  shot.addEventListener('click', (event) => {
    if (phase !== 'photos') event.preventDefault();
  });
  for (const name of ['dragenter', 'dragover']) {
    shot.addEventListener(name, (event) => {
      event.preventDefault();
      if (phase === 'photos') shot.toggleAttribute('data-over', true);
    });
  }
  shot.addEventListener('dragleave', () => shot.removeAttribute('data-over'));
  shot.addEventListener('drop', (event) => {
    event.preventDefault();
    shot.removeAttribute('data-over');
    take(side, event.dataTransfer.files[0]);
  });
}

/* Reading: Spark, then SAM */

async function* lines(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let rest = '';
  for (;;) {
    const { value, done } = await reader.read();
    rest += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const parts = rest.split('\n');
    rest = parts.pop();
    for (const part of parts) if (part.trim()) yield JSON.parse(part);
    if (done) return;
  }
}

/** Spark's answer arrives as a whole; the fields fill in one after another so it reads as the model's work. */
function fill(garment) {
  form.hidden = false;
  const word = (text) => (text ? text[0].toUpperCase() + text.slice(1) : '');
  const values = { name: garment.name, kind: garment.kind, colour: word(garment.colour), material: word(garment.material), description: garment.description };
  [...form.querySelectorAll('.field')].forEach((field, index) => {
    const input = field.querySelector('input, select, textarea');
    if (input.name in values) input.value = values[input.name] ?? '';
    field.toggleAttribute('data-from-model', input.name in values);
    if (motion) field.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: index * 70, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' });
  });
}

/** SAM's outline draws itself around the garment, then the background falls away and the cut garment lifts. */
function cut(side, { width, height, outline, cutout }) {
  const shot = shots[side];
  shot.removeAttribute('data-scanning');
  const svg = shot.querySelector('.shot-line');
  const path = svg.querySelector('path');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  path.setAttribute('d', outline.d);
  path.setAttribute('transform', `scale(${outline.scale})`);
  path.setAttribute('pathLength', '1');
  const image = shot.querySelector('.shot-cut');
  image.src = cutout;
  shot.toggleAttribute('data-traced', true);
  setTimeout(() => shot.toggleAttribute('data-cut', true), motion ? 1100 : 0);
}

async function read() {
  const ticket = ++run;
  phase = 'reading';
  $('atelier-error').hidden = true;
  $('atelier-again').hidden = true;
  go.disabled = true;
  go.textContent = 'Reading…';
  step('photos', 'done');
  step('spark', 'active');
  for (const shot of Object.values(shots)) shot.toggleAttribute('data-reading', true);
  say('Muse Spark is looking at both sides of the garment…');
  try {
    const response = await fetch('api/catalog/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ front: photos.front, back: photos.back }),
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error);
    let sides = 0;
    for await (const line of lines(response)) {
      if (ticket !== run) return;
      if (line.stage === 'error' || line.state === 'refused') throw new Error(line.error);
      if (line.stage === 'spark' && line.state === 'working') draft = line.draft;
      if (line.stage === 'spark' && line.state === 'done') {
        step('spark', 'done');
        fill(line.garment);
        const kind = KINDS.find((entry) => entry.id === line.garment.kind)?.label.toLowerCase() ?? 'a garment';
        say(`Muse Spark filed it under ${kind} and named it. It tells SAM 3.1 to look for “${line.garment.segment_as}”.`);
        phase = 'named';
      }
      if (line.stage === 'sam' && line.state === 'working') {
        step('sam', 'active');
        for (const shot of Object.values(shots)) {
          shot.removeAttribute('data-reading');
          shot.toggleAttribute('data-scanning', true);
          shot.style.setProperty('--prompt', `"${line.prompt.replace(/"/g, '')}"`);
        }
      }
      if (line.stage === 'sam' && line.state === 'side') {
        cut(line.side, line);
        sides += 1;
      }
      if (line.stage === 'sam' && line.state === 'done' && sides === 2) {
        step('sam', 'done');
        step('hang', 'active');
        phase = 'hanging';
        say('Cut out on both sides. Check the details, give it a price and hang it.');
        go.textContent = 'Hang it in the wardrobe';
        go.disabled = false;
        setTimeout(() => form.price.focus({ preventScroll: true }), motion ? 1200 : 0);
      }
    }
    if (phase !== 'hanging') throw new Error();
  } catch (error) {
    if (ticket === run) fail(error.message || 'Something went wrong. Try again in a moment.');
  }
}

