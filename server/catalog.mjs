// A store adds its own garments. Muse Spark reads the two photos into a catalogue entry and names what SAM 3.1 should
// look for; SAM cuts the garment out of each photo. Every step is streamed, so the page can show the models at work.
// The base catalogue is not stored here and cannot be removed; a store's garments are only ever marked as removed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { KINDS, setStoreItems } from '../src/wardrobe.js';
import { MOCK, catalogue, segment } from './meta.mjs';
import { allowance, readBody } from './muse.mjs';

const ROOT = 'cache/catalog';
const FILES = `${ROOT}/files`;
const DRAFTS = `${ROOT}/drafts`;
const LIST = `${ROOT}/items.json`;
const MAX_BODY = 16 * 1024 * 1024;
const LONGEST = 1600; // Photos are brought down to this before any model sees them.
const GREEN = { r: 0, g: 177, b: 64 }; // The chroma green every garment reference sits on, as Muse is used to.

for (const folder of [FILES, DRAFTS]) mkdirSync(folder, { recursive: true });

// Each garment read is one Spark call and two SAM images, under a cent; the caps keep a public link from running up.
const reads = allowance('.catalog-counts.json', Number(process.env.CATALOG_DAILY_LIMIT ?? 30), Number(process.env.CATALOG_VISITOR_LIMIT ?? 12), {
  everyone: 'The studio has read all the garments it can for today.',
  visitor: 'You have reached today\'s limit of new garments.',
});

const stored = () => (existsSync(LIST) ? JSON.parse(readFileSync(LIST, 'utf8')) : []);
const live = (entries = stored()) => entries.filter((entry) => !entry.removedAt);
const save = (entries) => {
  writeFileSync(LIST, JSON.stringify(entries, null, 2));
  setStoreItems(live(entries));
};
setStoreItems(live());

/** Letters only, because look ids are read back from file names that allow nothing else. */
const newId = () => `shop-${[...randomBytes(6)].map((byte) => String.fromCharCode(97 + (byte % 26))).join('')}`;
const PUBLIC = ({ id, name, price, kind, description, colour, material }) => ({ id, name, price, kind, description, colour, material });

function photo(value) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(value ?? '');
  return match && Buffer.from(match[2], 'base64');
}

/** Upright, at most LONGEST on its longer side, as JPEG: what both models are given. */
const prepare = (bytes) => sharp(bytes).rotate().resize(LONGEST, LONGEST, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();

async function cutout(bytes, alpha, width, height) {
  const rgb = await sharp(bytes).removeAlpha().raw().toBuffer();
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = alpha[i];
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function read(request, response) {
  const { front, back } = JSON.parse(await readBody(request, MAX_BODY));
  const raw = { front: photo(front), back: photo(back) };
  if (!raw.front || !raw.back) return reply(response, 400, { error: 'Add a photo of the front and one of the back.' });
  const visitor = request.socket.remoteAddress ?? 'unknown';
  const blocked = reads.reserve(visitor);
  if (blocked) return reply(response, 429, { error: blocked });

  response.setHeader('Content-Type', 'application/x-ndjson');
  const send = (part) => response.write(`${JSON.stringify(part)}\n`);
  const draft = randomBytes(8).toString('hex');
  const folder = `${DRAFTS}/${draft}`;
  mkdirSync(folder, { recursive: true });
  let paid = false;
  try {
    const images = {};
    for (const side of ['front', 'back']) {
      images[side] = await prepare(raw[side]);
      writeFileSync(`${folder}/${side}.jpg`, images[side]);
    }
    send({ stage: 'spark', state: 'working', draft, mock: MOCK });
    const garment = await catalogue({ bytes: images.front, type: 'image/jpeg' }, { bytes: images.back, type: 'image/jpeg' });
    paid = true;
    if (!garment.is_garment) {
      send({ stage: 'spark', state: 'refused', error: 'Muse Spark could not find one garment shown front and back in these photos.' });
      return response.end();
    }
    writeFileSync(`${folder}/garment.json`, JSON.stringify(garment));
    send({ stage: 'spark', state: 'done', garment });

    send({ stage: 'sam', state: 'working', prompt: garment.segment_as });
    await Promise.all(['front', 'back'].map(async (side) => {
      const found = await segment(images[side], 'image/jpeg', garment.segment_as);
      if (!found) throw Object.assign(new Error('nothing found'), { missing: side });
      writeFileSync(`${folder}/${side}.png`, await cutout(images[side], found.alpha, found.width, found.height));
      send({ stage: 'sam', state: 'side', side, width: found.width, height: found.height, outline: found.outline, cutout: `api/catalog/drafts/${draft}/${side}.png` });
    }));
    send({ stage: 'sam', state: 'done' });
  } catch (error) {
    console.error('catalog read failed', error.status, error.message);
    if (!paid) reads.release(visitor);
    const message = error.missing
      ? `SAM 3.1 could not find the garment in the ${error.missing} photo. Try a photo where it stands out from the background.`
      : error.refused ? 'The model could not use these photos.' : 'Something went wrong. Try again in a moment.';
    send({ stage: 'error', error: message });
  }
  response.end();
}

/** The cut garment, trimmed to itself: the picture that hangs in the wardrobe, and the green reference Muse dresses from. */
async function finish(folder, side, id) {
  const trimmed = await sharp(readFileSync(`${folder}/${side}.png`)).trim({ threshold: 8 }).png().toBuffer();
  const suffix = side === 'back' ? '-back' : '';
  await sharp(trimmed).resize(640, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 88, alphaQuality: 90 }).toFile(`${FILES}/item-${id}${suffix}.webp`);
  const garment = await sharp(trimmed).resize(1100, 1700, { fit: 'inside' }).png().toBuffer();
  await sharp({ create: { width: 1280, height: 1920, channels: 3, background: GREEN } })
    .composite([{ input: garment, gravity: 'center' }])
    .webp({ quality: 92 })
    .toFile(`${FILES}/${id}-green${suffix}.webp`);
}

async function publish(request, response) {
  const body = JSON.parse(await readBody(request, 64 * 1024));
  const folder = `${DRAFTS}/${String(body.draft ?? '').replace(/[^a-f0-9]/g, '')}`;
  const name = String(body.name ?? '').trim().slice(0, 48);
  const price = Math.round(Number(body.price));
  const kind = KINDS.find((entry) => entry.id === body.kind)?.id;
  if (!body.draft || !existsSync(`${folder}/front.png`) || !existsSync(`${folder}/back.png`)) return reply(response, 400, { error: 'Read the garment first.' });
  if (!name || !kind || !(price >= 1 && price <= 100000)) return reply(response, 400, { error: 'Give it a name, a kind and a price.' });
  const id = newId();
  await Promise.all(['front', 'back'].map((side) => finish(folder, side, id)));
  const entry = {
    id,
    name,
    price,
    kind,
    description: String(body.description ?? '').trim().slice(0, 160),
    colour: String(body.colour ?? '').trim().slice(0, 32),
    material: String(body.material ?? '').trim().slice(0, 32),
    addedAt: new Date().toISOString(),
  };
  save([...stored(), entry]);
  reply(response, 200, PUBLIC(entry));
}

function remove(id, response, removed) {
  const entries = stored();
  const entry = entries.find((item) => item.id === id);
  if (!entry) return reply(response, 404, { error: 'Only garments a store added can be removed.' });
  if (removed) entry.removedAt = new Date().toISOString();
  else delete entry.removedAt;
  save(entries);
  reply(response, 200, { ok: true });
}

function reply(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
}

function serve(response, path, type) {
  if (!existsSync(path)) return reply(response, 404, { error: 'Not found.' });
  response.setHeader('Content-Type', type);
  response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  response.end(readFileSync(path));
}

export async function catalog(request, response) {
  const url = request.url.split('?')[0];
  try {
    if (request.method === 'GET' && (url === '/' || url === '')) return reply(response, 200, live().map(PUBLIC));
    let match = /^\/files\/((?:item-)?shop-[a-z]+(?:-green)?(?:-back)?\.webp)$/.exec(url);
    if (request.method === 'GET' && match) return serve(response, `${FILES}/${match[1]}`, 'image/webp');
    match = /^\/drafts\/([a-f0-9]{16})\/(front|back)\.(png|jpg)$/.exec(url);
    if (request.method === 'GET' && match) return serve(response, `${DRAFTS}/${match[1]}/${match[2]}.${match[3]}`, match[3] === 'png' ? 'image/png' : 'image/jpeg');
    if (request.method === 'POST' && url === '/read') return await read(request, response);
    if (request.method === 'POST' && (url === '/' || url === '')) return await publish(request, response);
    match = /^\/(shop-[a-z]+)(\/restore)?$/.exec(url);
    if (match && request.method === 'DELETE' && !match[2]) return remove(match[1], response, true);
    if (match && request.method === 'POST' && match[2]) return remove(match[1], response, false);
    return reply(response, 404, { error: 'Not found.' });
  } catch (error) {
    console.error('catalog failed', error.status, error.message);
    if (error.status === 413) return reply(response, 413, { error: 'Those photos are too large.' });
    if (!response.headersSent) return reply(response, 500, { error: 'Something went wrong. Try again in a moment.' });
    response.end();
  }
}
