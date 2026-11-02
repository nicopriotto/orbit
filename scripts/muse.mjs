// Calls Muse Image and records every billed image. Usage:
//   node scripts/muse.mjs generate <out.webp|png> "<prompt>" [size]
//   node scripts/muse.mjs edit <out> "<prompt>" <reference> [more references...]
//   node scripts/muse.mjs usage
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname } from 'node:path';

const BASE = 'https://api.meta.ai/v1';
const MODEL = 'muse-image-1.0';
const PRICE = 0.01; // USD per image, from the published price list.
const LOG = '.muse-usage.jsonl';

function apiKey() {
  const line = readFileSync('.env.local', 'utf8').split('\n').find((row) => row.startsWith('META_API_KEY='));
  const key = line?.slice('META_API_KEY='.length).trim();
  if (!key) throw new Error('META_API_KEY is empty in .env.local');
  return key;
}

function usage() {
  const rows = existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((row) => JSON.parse(row)) : [];
  // Muse Image rows count images; SAM and Spark rows carry what they cost.
  const images = rows.reduce((sum, row) => sum + (row.images ?? 0), 0);
  const usd = rows.reduce((sum, row) => sum + (row.usd ?? (row.images ?? 0) * PRICE), 0);
  const models = {};
  for (const row of rows) models[row.model ?? 'muse-image-1.0'] = (models[row.model ?? 'muse-image-1.0'] ?? 0) + 1;
  return { calls: rows.length, images, usd: +usd.toFixed(3), models };
}

async function save(response, out, prompt) {
  const text = await response.text();
  if (!response.ok) throw new Error(`Muse ${response.status}: ${text.slice(0, 600)}`);
  const { data } = JSON.parse(text);
  const items = await Promise.all(data.map(async (item) => (item.b64_json
    ? Buffer.from(item.b64_json, 'base64')
    : Buffer.from(await (await fetch(item.url)).arrayBuffer()))));
  mkdirSync(dirname(out), { recursive: true });
  items.forEach((bytes, i) => {
    const path = i ? out.replace(extname(out), `-${i}${extname(out)}`) : out;
    writeFileSync(path, bytes);
    console.log('saved', path, bytes.length);
  });
  appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), out, images: items.length, prompt: prompt.slice(0, 120) })}\n`);
}

const [action, out, prompt, ...rest] = process.argv.slice(2);
// MUSE_STOP_AT is a hard ceiling on all images ever logged, so a batch cannot run away.
const ceiling = Number(process.env.MUSE_STOP_AT ?? Infinity);
if (action !== 'usage' && usage().images >= ceiling) {
  console.log('budget reached', usage().images, 'of', ceiling);
  process.exit(0);
}
const headers = { Authorization: `Bearer ${action === 'usage' ? '' : apiKey()}` };

if (action === 'generate') {
  const body = { model: MODEL, prompt, n: 1, ...(rest[0] ? { size: rest[0] } : {}) };
  await save(await fetch(`${BASE}/images/generations`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), out, prompt);
} else if (action === 'edit') {
  const form = new FormData();
  form.set('model', MODEL);
  form.set('prompt', prompt);
  form.set('n', '1');
  rest.forEach((path, i) => form.append(rest.length > 1 ? `image[${i}]` : 'image', new Blob([readFileSync(path)], { type: `image/${extname(path).slice(1).replace('jpg', 'jpeg')}` }), basename(path)));
  await save(await fetch(`${BASE}/images/edits`, { method: 'POST', headers, body: form }), out, prompt);
}
console.log('usage', JSON.stringify(usage()));
