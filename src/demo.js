// What this copy of Orbit can do. A server with META_API_KEY makes anything new; one without it, or no server at all (a
// static copy such as GitHub Pages), plays only what Muse already made: the saved looks, and Mia and Theo in some of them.
const status = await fetch('api/status').then((response) => (response.ok ? response.json() : null)).catch(() => null);

/** No server: what it would answer was written to demo/ when the site was built. */
export const STATIC = !status;
const { live = false, samples = [] } = status ?? (await fetch('demo/status.json').then((response) => response.json()).catch(() => ({})));
export const LIVE = live;
export const NO_KEY = 'No API key here, so only looks already made.';

const kept = new Set(samples);
/** Whether Muse already dressed this model in this look. */
export const hasSample = (model, look) => kept.has(`${model}-${look}`);

const FILES = { catalog: 'catalog.json', looks: 'looks.json' };
/** Where to read what the server would answer. */
export const api = (path) => (STATIC ? `demo/${FILES[path] ?? path}` : `api/${path}`);

document.documentElement.toggleAttribute('data-preview', !LIVE);
