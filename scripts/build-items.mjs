// The wardrobe pictures of the base catalogue, cut from their green references: front and back of every garment that
// does not have one yet. Run from the project root after scripts/generate-garments.mjs.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { itemImage } from '../server/garment.mjs';

for (const [folder, suffix] of [['public/studio/raw/green', ''], ['public/studio/back', '-back']]) {
  for (const name of readdirSync(folder).filter((file) => file.endsWith('.webp'))) {
    const out = `public/studio/set/item-${name.replace('.webp', '')}${suffix}.webp`;
    if (existsSync(out) && !process.argv.includes('--all')) continue;
    await itemImage(readFileSync(`${folder}/${name}`), out);
    console.log(out);
  }
}
