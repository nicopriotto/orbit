// The turn needs every look's three-quarter and side views to face the viewer's left, as the bare mannequins' do, and Muse
// sometimes draws them the other way round. The head is never dressed, so it says which way a view faces.
import { renameSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const BAND = { width: 280, height: 95 }; // The top of the canvas at a quarter of its size, where the head stands.
const SLIDE = 24; // Views are aligned by the feet, so a head can sit this far from where the mannequin's does.

async function headBand(path, mirrored = false) {
  const image = sharp(path).flatten({ background: '#808080' });
  if (mirrored) image.flop();
  const { data } = await sharp(await image.png().toBuffer()).resize(BAND.width).extract({ left: 0, top: 0, ...BAND }).greyscale().raw().toBuffer({ resolveWithObject: true });
  return data;
}

function correlation(a, b, shift) {
  const { width, height } = BAND;
  let count = 0;
  let [sumA, sumB, sumAA, sumBB, sumAB] = [0, 0, 0, 0, 0];
  for (let y = 0; y < height; y++) {
    for (let x = Math.max(shift, 0); x < Math.min(width + shift, width); x++) {
      const [u, v] = [a[y * width + x], b[y * width + x - shift]];
      count += 1;
      sumA += u;
      sumB += v;
      sumAA += u * u;
      sumBB += v * v;
      sumAB += u * v;
    }
  }
  return (sumAB - (sumA * sumB) / count) / Math.sqrt((sumAA - (sumA * sumA) / count) * (sumBB - (sumB * sumB) / count));
}

function likeness(head, reference) {
  let best = -1;
  for (let shift = -SLIDE; shift <= SLIDE; shift += 2) best = Math.max(best, correlation(head, reference, shift));
  return best;
}

/** Mirrors a look's view in place if it faces the wrong way. Returns whether it did. */
export async function faceLeft(path, view, mannequin = 'bare') {
  const bare = `public/studio/set/${mannequin}-${view}.webp`;
  const head = await headBand(path);
  if (likeness(head, await headBand(bare)) >= likeness(head, await headBand(bare, true))) return false;
  const mirrored = await sharp(path).flop().webp({ quality: 90, alphaQuality: 95 }).toBuffer();
  writeFileSync(`${path}.part`, mirrored);
  renameSync(`${path}.part`, path); // Nobody can be served half a file.
  return true;
}
