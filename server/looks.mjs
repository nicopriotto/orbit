// Dresses the mannequin on demand. Muse draws all four views of a combination in one image, once: the views are cut
// apart and written to disk, and every later request, from anyone, is served from there. Only combinations of catalogue
// garments can be asked for.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { LOOKS, MAN, plainLook } from '../src/wardrobe.js';
import { faceLeft } from './facing.mjs';
import { allowance, edit, readBody } from './muse.mjs';

const BUILT = 'public/studio/set';
const FINISHED = 'cache/looks';
const RAW = 'cache/raw';
const VIEWS = ['front', 'front34', 'side', 'back']; // In the order they stand on the sheet.
const SHEET = 'public/studio/m/sheet.webp';
const MAN_SHEET = 'public/studio/m/sheet-man.webp';
const MIN_FIGURE = 40; // Columns; anything narrower on the sheet is a speck, not a figure.
const ATTEMPTS = 2;
const CANVAS = { width: 1120, height: 2130 };
const FIGURE = { top: 70, bottom: 2080 };
const GREEN = 'Keep the solid uniform chroma-key green background (#00B140), evenly lit, with no shadow, no floor line and no gradient. No person, no face, no hair. Photorealistic, sharp edges.';
const FIT = 'fitted naturally with realistic drape, tension and folds, matching colour, fabric, seams, construction, silhouette, leg width and pleats exactly';
const FILE = /^\/([a-z-]+)-(front34|front|side|back)\.webp$/;

const images = allowance('.look-counts.json', Number(process.env.LOOK_DAILY_LIMIT ?? 80), Number(process.env.LOOK_VISITOR_LIMIT ?? 24), {
  everyone: 'The studio has dressed all it can for today. Pick a saved look.',
  visitor: 'You have reached today\'s limit of new looks. Pick a saved one.',
});
const known = (id) => LOOKS.has(plainLook(id));
const running = new Map(); // A look already on its way is shared, so two visitors never pay for the same image.

const webp = (path) => ({ bytes: readFileSync(path), type: 'image/webp' });
const finished = (id, view) => [`${BUILT}/${id}-${view}.webp`, `${FINISHED}/${id}-${view}.webp`].find(existsSync);
const complete = (id) => VIEWS.every((view) => finished(id, view));
const garments = ({ top, bottom, outer }) => [outer, top, bottom].filter(Boolean);
// A store's garments keep their green references next to their other files.
const front = (item) => (item.store ? `cache/catalog/files/${item.id}-green.webp` : `public/studio/raw/green/${item.file}.webp`);
const back = (item) => (item.store ? `cache/catalog/files/${item.id}-green-back.webp` : `public/studio/back/${item.file}.webp`);

function request(id) {
  const look = LOOKS.get(plainLook(id));
  const worn = garments(look);
  const notes = [
    look.top?.whole && !look.outer && 'The dress is the only garment.',
    look.outer && look.top && 'The jacket or coat is worn open over the other top garment, which stays clearly visible underneath it.',
    look.outer && !look.top && 'The jacket or coat is worn open directly over the bare ivory fibreglass torso, with nothing under it.',
    !look.top?.whole && (!(look.top || look.outer) || !look.bottom) && 'Any part of the mannequin without a garment stays bare ivory fibreglass.',
  ].filter(Boolean).join(' ');
  return {
    prompt: `The first image is a sheet with four views of the same display mannequin, side by side on green: front, three-quarter, side profile, and back. Dress the mannequin in all four views in the exact garments and white sneakers from the other images, ${FIT}. ${notes} The outfit must be identical in all four views, draped the same way. The back view shows the backs of the garments. Keep each mannequin's faceless head, pose, proportions, scale and position in the sheet exactly unchanged, four separate figures that do not overlap, each head to toe in frame. ${GREEN}`,
    references: [id.startsWith(MAN) ? MAN_SHEET : SHEET, ...worn.flatMap((item) => [front(item), back(item)]), 'public/studio/raw/green/sneakers.webp'],
  };
}

const smooth = (low, high, x) => {
  const t = Math.min(Math.max((x - low) / (high - low), 0), 1);
  return t * t * (3 - 2 * t);
};

/** The darkest or brightest value within a square around each pixel: erosion or dilation, one axis at a time. */
function neighbours(values, width, height, reach, pick) {
  const across = Buffer.from(values);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let dx = Math.max(x - reach, 0); dx <= Math.min(x + reach, width - 1); dx++) across[y * width + x] = pick(across[y * width + x], values[y * width + dx]);
    }
  }
  const result = Buffer.from(across);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let dy = Math.max(y - reach, 0); dy <= Math.min(y + reach, height - 1); dy++) result[y * width + x] = pick(result[y * width + x], across[dy * width + x]);
    }
  }
  return result;
}

/** The same matte and framing as scripts/build-studio.py, so generated views line up with the prepared ones. */
export async function cut(bytes, destination) {
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const raster = { raw: { width, height, channels: 1 } };
  const matte = Buffer.alloc(width * height);
  for (let i = 0; i < matte.length; i++) {
    const excess = (data[i * 3 + 1] - Math.max(data[i * 3], data[i * 3 + 2])) / 255;
    matte[i] = (1 - smooth(0.1, 0.3, excess)) * 255;
  }
  const alpha = await sharp(neighbours(matte, width, height, 1, Math.min), raster).blur(0.7).extractChannel(0).raw().toBuffer();
  const near = neighbours(alpha.map((value) => (value < 250 ? 255 : 0)), width, height, 4, Math.max);
  const rgba = Buffer.alloc(width * height * 4);
  let top = height;
  let bottom = 0;
  for (let i = 0; i < alpha.length; i++) {
    const [r, g, b] = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = near[i] ? Math.min(g, Math.max(r, b) * 1.02) : g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = alpha[i];
    if (alpha[i] > 127) {
      const y = Math.floor(i / width);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  // The feet set the place, so every view stands on the same spot of the stand.
  let leftmost = width;
  let rightmost = 0;
  for (let y = bottom - Math.floor((bottom - top) * 0.03); y <= bottom; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] > 127) {
        leftmost = Math.min(leftmost, x);
        rightmost = Math.max(rightmost, x);
      }
    }
  }
  const scale = (FIGURE.bottom - FIGURE.top) / (bottom - top);
  const x = Math.round(CANVAS.width / 2 - ((leftmost + rightmost) / 2) * scale);
  const y = Math.round(FIGURE.top - top * scale);
  // Only the part that lands on the canvas is kept, since a composite has to fit inside it.
  const left = Math.max(Math.ceil(-x / scale), 0);
  const up = Math.max(Math.ceil(-y / scale), 0);
  const across = Math.min(width - left, Math.floor((CANVAS.width - Math.max(x, 0)) / scale));
  const down = Math.min(height - up, Math.floor((CANVAS.height - Math.max(y, 0)) / scale));
  const placed = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract({ left, top: up, width: across, height: down })
    .resize(Math.floor(across * scale), Math.floor(down * scale), { kernel: 'lanczos3' })
    .png()
    .toBuffer();
  const finishedImage = await sharp({ create: { ...CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: placed, left: Math.max(x, 0), top: Math.max(y, 0) }])
    .webp({ quality: 90, alphaQuality: 95 })
    .toBuffer();
  writeFileSync(`${destination}.part`, finishedImage);
  renameSync(`${destination}.part`, destination); // Nobody can be served half a file.
}

/** Each figure is the run of columns that are not background, widened a little to keep its edges. */
export async function figures(sheet) {
  const { data, info } = await sharp(sheet).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const runs = [];
  let start = -1;
  for (let x = 0; x <= width; x++) {
    let filled = false;
    for (let y = 0; x < width && y < height && !filled; y += 3) {
      const i = (y * width + x) * 3;
      filled = data[i + 1] - Math.max(data[i], data[i + 2]) < 40;
    }
    if (filled && start < 0) start = x;
    if (!filled && start >= 0) {
      if (x - start > MIN_FIGURE) runs.push([start, x]);
      start = -1;
    }
  }
  if (runs.length !== VIEWS.length) throw new Error(`Expected ${VIEWS.length} figures on the sheet, found ${runs.length}`);
  return Promise.all(runs.map(([from, to]) => {
    const left = Math.max(from - 30, 0);
    return sharp(sheet).extract({ left, top: 0, width: Math.min(to + 30, width) - left, height }).png().toBuffer();
  }));
}

async function paint(id, visitor) {
  const { prompt, references } = request(id);
  for (let attempt = 1; ; attempt++) {
    const blocked = images.reserve(visitor);
    if (blocked) throw Object.assign(new Error(blocked), { status: 429 });
    let bytes;
    try {
      bytes = await edit(prompt, references.map(webp), `look/${id}`);
    } catch (error) {
      images.release(visitor);
      throw error;
    }
    mkdirSync(RAW, { recursive: true });
    mkdirSync(FINISHED, { recursive: true });
    writeFileSync(`${RAW}/${id}.webp`, bytes);
    try {
      const parts = await figures(bytes);
      for (const [i, part] of parts.entries()) await cut(part, `${FINISHED}/${id}-${VIEWS[i]}.webp`);
      for (const view of ['front34', 'side']) await faceLeft(`${FINISHED}/${id}-${view}.webp`, view, id.startsWith(MAN) ? 'man-bare' : 'bare');
      return;
    } catch (error) {
      if (attempt === ATTEMPTS) throw error;
    }
  }
}

function make(id, visitor) {
  if (complete(id)) return Promise.resolve();
  if (!running.has(id)) running.set(id, paint(id, visitor).finally(() => running.delete(id)));
  return running.get(id);
}

export function saved() {
  const looks = { bare: VIEWS, [`${MAN}bare`]: VIEWS };
  for (const folder of [BUILT, FINISHED]) {
    for (const name of existsSync(folder) ? readdirSync(folder) : []) {
      const match = FILE.exec(`/${name}`);
      if (match && known(match[1])) (looks[match[1]] ??= []).push(match[2]);
    }
  }
  return looks;
}

export const savedLook = (id) => (known(id) ? finished(id, 'front') : null);

export async function looks(request_, response) {
  const reply = (status, body) => {
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(body));
  };
  const file = FILE.exec(request_.url.split('?')[0]);
  if (request_.method === 'GET' && file) {
    const path = plainLook(file[1]) === 'bare' ? `${BUILT}/${file[1]}-${file[2]}.webp` : known(file[1]) && finished(file[1], file[2]);
    if (!path) return reply(404, { error: 'Not made yet.' });
    response.setHeader('Content-Type', 'image/webp');
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return response.end(readFileSync(path));
  }
  if (request_.method === 'GET') return reply(200, saved());
  if (request_.method !== 'POST') return reply(405, { error: 'GET or POST only.' });
  try {
    const { look } = JSON.parse(await readBody(request_, 1024));
    if (!known(look)) return reply(400, { error: 'That look is not in the catalogue.' });
    await make(look, request_.socket.remoteAddress ?? 'unknown');
    return reply(200, { ok: true });
  } catch (error) {
    console.error('look failed', error.status, error.message);
    if (error.status === 429) return reply(429, { error: error.message });
    return reply(error.refused ? 422 : 502, { error: 'Muse could not dress this combination. Try another piece.' });
  }
}
