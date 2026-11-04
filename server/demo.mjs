// Tells the page what this copy can do, and writes what it already made into a build so that a static copy (GitHub Pages)
// plays the same saved looks and samples with no server and no key.
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { apiKey } from './muse.mjs';
import { finished, saved } from './looks.mjs';

const SAMPLES = 'cache/samples';
const MODELS = ['mia', 'theo'];

/** Kept try-ons of the two models, by `<model>-<look>`. The other people in there are only for the video and the README. */
const samples = () => (existsSync(SAMPLES) ? readdirSync(SAMPLES) : []).map((name) => name.replace(/\.json$/, '')).filter((id) => MODELS.includes(id.split('-')[0]));

export function status(request, response) {
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ live: Boolean(apiKey()), samples: samples() }));
}

export function writeDemo(out) {
  const looks = saved();
  mkdirSync(`${out}/demo/looks`, { recursive: true });
  mkdirSync(`${out}/demo/samples`, { recursive: true });
  for (const [id, views] of Object.entries(looks)) for (const view of views) copyFileSync(finished(id, view), `${out}/demo/looks/${id}-${view}.webp`);
  const kept = samples().filter((id) => looks[id.slice(id.indexOf('-') + 1)]);
  for (const id of kept) copyFileSync(`${SAMPLES}/${id}.json`, `${out}/demo/samples/${id}.json`);
  writeFileSync(`${out}/demo/looks.json`, JSON.stringify(looks));
  writeFileSync(`${out}/demo/catalog.json`, '[]');
  writeFileSync(`${out}/demo/status.json`, JSON.stringify({ live: false, samples: kept }));
}
