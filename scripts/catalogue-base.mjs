// Muse Spark reads every garment of the base catalogue from its two pictures, the same way it reads a store's new
// garment, so the stylist knows the whole wardrobe in words. Runs once; the notes are kept in src/catalogue-notes.json.
//   node scripts/catalogue-base.mjs [--stop-at <usd>]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { catalogue } from '../server/meta.mjs';
import { WARDROBE } from '../src/wardrobe.js';

const OUT = 'src/catalogue-notes.json';
const LOG = '.muse-usage.jsonl';
const stopAt = Number(process.argv[process.argv.indexOf('--stop-at') + 1] || 0.5);
const notes = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const spent = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((row) => JSON.parse(row)) : [])
  .filter((row) => row.out === 'catalogue' && row.at >= started).reduce((sum, row) => sum + (row.usd ?? 0), 0);
const started = new Date().toISOString();

// Small JPEGs on white: enough for colour and material, and few tokens.
const picture = async (path) => ({ bytes: await sharp(`public/${path}`).resize(640, 640, { fit: 'inside' }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer(), type: 'image/jpeg' });

const queue = WARDROBE.filter((item) => !item.store && !notes[item.id]);
async function worker() {
  while (queue.length) {
    if (spent() >= stopAt) throw new Error(`Stopped at US$ ${spent().toFixed(3)}`);
    const item = queue.shift();
    const read = await catalogue(await picture(item.image), await picture(item.back));
    notes[item.id] = { colour: read.colour, material: read.material, description: read.description };
    writeFileSync(OUT, `${JSON.stringify(notes, null, 2)}\n`);
    console.log(item.id, '·', read.colour, '·', read.material, '·', read.description);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
console.log(`${Object.keys(notes).length} garments, US$ ${spent().toFixed(4)} this run`);
