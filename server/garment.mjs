// A garment on chroma green, cut out the way scripts/build-studio.py cuts the base catalogue: the alpha comes from how
// far green rises above the other channels, the green spill at the edge is pulled back, and the picture is trimmed to
// the garment with a little room around it. This is the picture that hangs in the wardrobe.
import { renameSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { neighbours } from './looks.mjs';

const smooth = (low, high, x) => {
  const t = Math.min(Math.max((x - low) / (high - low), 0), 1);
  return t * t * (3 - 2 * t);
};
const PAD = 12;

export async function itemImage(bytes, destination, { width: most = 640, height: tallest = 1200 } = {}) {
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const matte = Buffer.alloc(width * height);
  for (let i = 0; i < matte.length; i++) matte[i] = (1 - smooth(0.1, 0.3, (data[i * 3 + 1] - Math.max(data[i * 3], data[i * 3 + 2])) / 255)) * 255;
  const alpha = await sharp(neighbours(matte, width, height, 1, Math.min), { raw: { width, height, channels: 1 } }).blur(0.7).extractChannel(0).raw().toBuffer();
  const near = neighbours(alpha.map((value) => (value < 250 ? 255 : 0)), width, height, 4, Math.max);
  const rgba = Buffer.alloc(width * height * 4);
  let [left, top, right, bottom] = [width, height, 0, 0];
  for (let i = 0; i < alpha.length; i++) {
    const [r, g, b] = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
    rgba.set([r, near[i] ? Math.min(g, Math.max(r, b) * 1.02) : g, b, alpha[i]], i * 4);
    if (alpha[i] > 127) {
      const x = i % width;
      const y = Math.floor(i / width);
      [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x), Math.max(bottom, y)];
    }
  }
  if (right <= left) throw new Error('No garment on the green.');
  const box = { left: Math.max(left - PAD, 0), top: Math.max(top - PAD, 0) };
  box.width = Math.min(right + PAD, width - 1) - box.left + 1;
  box.height = Math.min(bottom + PAD, height - 1) - box.top + 1;
  const out = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract(box)
    .resize(most, tallest, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90, alphaQuality: 95 })
    .toBuffer();
  writeFileSync(`${destination}.part`, out);
  renameSync(`${destination}.part`, destination);
}
