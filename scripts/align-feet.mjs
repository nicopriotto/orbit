// Moves finished views sideways so the feet stand on the middle of the canvas, where the stand is. No image is generated.
import { readdirSync, renameSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const CENTRE = 560;
const folders = [['public/studio/set', /^(bare|.*-none|none-.*)-(front|front34|side|back)\.webp$/], ['cache/looks', /\.webp$/]];

for (const [folder, pattern] of folders) {
  for (const name of readdirSync(folder).filter((file) => pattern.test(file) && !file.startsWith('item-'))) {
    const path = `${folder}/${name}`;
    const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    let bottom = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 127) bottom = Math.max(bottom, Math.floor(i / 4 / width));
    let left = width;
    let right = 0;
    for (let y = bottom - Math.round(height * 0.03); y <= bottom; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 127) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }
    const shift = Math.round(CENTRE - (left + right) / 2);
    if (!shift) continue;
    const moved = Buffer.alloc(data.length);
    for (let y = 0; y < height; y++) {
      const from = y * width * 4 + Math.max(-shift, 0) * 4;
      const to = y * width * 4 + Math.max(shift, 0) * 4;
      data.copy(moved, to, from, from + (width - Math.abs(shift)) * 4);
    }
    const image = await sharp(moved, { raw: { width, height, channels: 4 } }).webp({ quality: 90, alphaQuality: 95 }).toBuffer();
    writeFileSync(`${path}.part`, image);
    renameSync(`${path}.part`, path);
    console.log(name, shift);
  }
}
