// Turns every saved look's three-quarter and side views to face the viewer's left. New looks do this as they are made;
// run it after rebuilding public/studio/set. Spends nothing.
import { readdirSync } from 'node:fs';
import { faceLeft } from '../server/facing.mjs';

const VIEW = /-(front34|side)\.webp$/;
let fixed = 0;
for (const folder of ['public/studio/set', 'cache/looks']) {
  for (const name of readdirSync(folder)) {
    const view = VIEW.exec(name)?.[1];
    if (!view || /^(man-)?bare-/.test(name)) continue;
    if (await faceLeft(`${folder}/${name}`, view, name.startsWith('man-') ? 'man-bare' : 'bare')) {
      console.log('mirrored', name);
      fixed += 1;
    }
  }
}
console.log(fixed, 'mirrored');
