// Cuts the man's mannequin out of its sheet, on the same canvas and stand as hers. The sheet is a Muse image kept in
// public/studio/m, so this spends nothing.
import { readFileSync } from 'node:fs';
import { cut, figures } from '../server/looks.mjs';

const VIEWS = ['front', 'front34', 'side', 'back'];
const parts = await figures(readFileSync('public/studio/m/sheet-man.webp'));
for (const [i, part] of parts.entries()) await cut(part, `public/studio/set/man-bare-${VIEWS[i]}.webp`);
console.log('cut', parts.length);
