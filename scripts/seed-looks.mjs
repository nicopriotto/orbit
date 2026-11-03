// Draws a handful of looks ahead of time, so either mannequin opens with new pieces and shoes already worn.
// node scripts/seed-looks.mjs <most new images>
import { readFileSync } from 'node:fs';
import { LOOKS, plainLook } from '../src/wardrobe.js';
import { make } from '../server/looks.mjs';

const SEEDS = [
  'knit-fairisle-skirt-tartan-in-boots-chelsea',
  'jacket-fringe-over-dress-floral-none-in-boots-western',
  'dress-sequin-none-in-sandals',
  'sweat-floral-jeans-patch-in-hightops',
  'jacket-patch-over-tee-tiedye-skirt-denim-in-runners',
  'blouse-lace-pants-cream-in-loafers',
  'knit-mohair-skirt-satin-in-boots-chelsea',
  'blazer-tweed-over-knit-roll-pants-charcoal-in-loafers',
  'jacket-varsity-over-hoodie-jeans-light-in-hightops',
  'shirt-camp-skirt-pleat-in-sandals',
  'man-knit-cable-jeans-ecru-in-boots-chelsea',
  'man-jacket-varsity-over-tee-ink-jeans-black-in-hightops',
  'man-blazer-tweed-over-shirt-white-pants-charcoal-in-loafers',
  'man-jacket-puffer-over-hoodie-pants-olive-in-runners',
  'man-shirt-camp-pants-cream-in-sandals',
  'man-sweat-floral-jeans-patch-in-hightops',
  'man-jacket-fringe-over-tee-breton-jeans-light-in-boots-western',
  'man-knit-fairisle-pants-rust-in-boots-chelsea',
  'man-knit-roll-skirt-tartan-in-boots-chelsea',
  'man-jacket-patch-over-tee-tiedye-jeans-grey-in-runners',
];

const unknown = SEEDS.filter((id) => !LOOKS.has(plainLook(id)));
if (unknown.length) throw new Error(`Not in the catalogue: ${unknown.join(', ')}`);
const spent = () => readFileSync('.muse-usage.jsonl', 'utf8').split('\n').filter(Boolean).reduce((sum, row) => sum + (JSON.parse(row).images ?? 0), 0);
const ceiling = spent() + Number(process.argv[2] ?? 24);
const queue = [...SEEDS];
await Promise.all(Array.from({ length: 3 }, async () => {
  for (let id = queue.shift(); id; id = queue.shift()) {
    if (spent() >= ceiling) return console.log('SKIPPED', id);
    try {
      await make(id, 'seed');
      console.log('done', id);
    } catch (error) {
      console.log('FAILED', id, error.status ?? '', String(error.message).slice(0, 160));
    }
  }
}));
