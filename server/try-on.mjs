// Dresses a visitor's photo in a look. The photo lives only for the request, and every paid call passes the caps below
// first, because this endpoint is reachable from a public link.
import { readFileSync } from 'node:fs';
import { savedLook } from './looks.mjs';
import { LOOKS, plainLook } from '../src/wardrobe.js';
import sharp from 'sharp';
import { segment } from './meta.mjs';
import { allowance, edit, readBody } from './muse.mjs';

const MAX_BODY = 8 * 1024 * 1024;
const GREEN = 'Replace the whole background with a solid uniform chroma-key green (#00B140), evenly lit, with no shadow, no floor line and no gradient, in the same bright green inside every gap between the arms and body, the fingers and the legs. Head to toe in frame. Photorealistic, sharp edges.';
// Try-ons across everyone; each one is two images. One sheet of four views leaves too little resolution for a face.
const allowed = allowance('.try-on-counts.json', Number(process.env.TRY_ON_DAILY_LIMIT ?? 20), Number(process.env.TRY_ON_VISITOR_LIMIT ?? 15), {
  everyone: 'The studio has reached its limit for today.',
  visitor: 'You have reached your limit for today.',
});

/**
 * SAM 3.1 says which pixels are the person, so the page never cuts a hole in something green they wear, and never
 * keeps a stray patch of backdrop. The chroma key still draws the fine edge of hair and fingers. Without SAM the page
 * falls back to the chroma key alone.
 */
async function personMask(bytes) {
  try {
    const found = await segment(bytes, 'image/webp', 'person');
    if (!found) return null;
    const png = await sharp(found.alpha, { raw: { width: found.width, height: found.height, channels: 1 } }).png({ compressionLevel: 9 }).toBuffer();
    return png.toString('base64');
  } catch (error) {
    console.error('try-on mask failed', error.status, error.message);
    return null;
  }
}

async function dress(photo, look, send) {
  const view = (name) => ({ bytes: readFileSync(savedLook(look).replace('-front.webp', `-${name}.webp`)), type: 'image/webp' });
  const { outer, top } = LOOKS.get(plainLook(look));
  const under = outer && !top ? 'Under the open jacket the person wears a plain white tee. ' : ''; // A mannequin can go without one; a shopper does not.
  const front = await edit(`Show the person from the first image wearing exactly the outfit on the mannequin in the second image: same garments, colours, fabric and fit, including the white sneakers. ${under}Keep the person's face, skin, hair and body shape exactly. Standing relaxed, facing the camera, arms at the sides. ${GREEN}`, [photo, view('front')], 'try-on');
  // The back starts at once; SAM reads the front meanwhile, so the front is out about as soon as before.
  const backing = edit(`The first image shows a person. Show the same person, seen from directly behind, wearing the same outfit, matching the second image for the pose, garments and framing. Keep the person's hair and body shape exactly. ${GREEN}`, [{ bytes: front, type: 'image/webp' }, view('back')], 'try-on');
  backing.catch(() => {}); // Handled below; this only keeps an early failure from going unheard.
  send({ front: front.toString('base64'), frontMask: await personMask(front) });
  const back = await backing;
  send({ back: back.toString('base64'), backMask: await personMask(back) });
}

export async function tryOn(request, response) {
  const reply = (status, body) => {
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(body));
  };
  if (request.method !== 'POST') return reply(405, { error: 'POST only.' });
  try {
    const { photo, look } = JSON.parse(await readBody(request, MAX_BODY));
    const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(photo ?? '');
    if (!match || !savedLook(look)) return reply(400, { error: 'Pick a look and a photo first.' });
    const visitor = request.socket.remoteAddress ?? 'unknown';
    const blocked = allowed.reserve(visitor);
    if (blocked) return reply(429, { error: blocked });
    let started = false;
    const send = (part) => {
      if (!started) response.setHeader('Content-Type', 'application/x-ndjson');
      started = true;
      response.write(`${JSON.stringify(part)}\n`);
    };
    try {
      await dress({ bytes: Buffer.from(match[2], 'base64'), type: match[1] }, look, send);
      response.end();
    } catch (error) {
      if (!started) {
        allowed.release(visitor);
        throw error;
      }
      // The front is already out, and paid for: the page sees the answer end without a back, and the try-on stays counted.
      console.error('try-on back failed', error.status, error.message);
      response.end();
    }
  } catch (error) {
    console.error('try-on failed', error.status, error.message);
    if (error.status === 413) return reply(413, { error: 'That photo is too large.' });
    if (error.refused) return reply(422, { error: 'Muse could not use that photo. Try a clear photo of one adult, standing.' });
    return reply(502, { error: 'Something went wrong. Try again in a moment.' });
  }
}
