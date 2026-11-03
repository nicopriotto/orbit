// Redraws a store garment's catalogue photo from its draft, for garments added before the redraw existed.
// node scripts/refinish.mjs <draft> <id> <kind>
import { readFileSync } from 'node:fs';
import { finish } from '../server/catalog.mjs';

const [draft, id, kind] = process.argv.slice(2);
const folder = `cache/catalog/drafts/${draft}`;
await finish(folder, id, kind, JSON.parse(readFileSync(`${folder}/garment.json`, 'utf8')));
console.log('done', id);
