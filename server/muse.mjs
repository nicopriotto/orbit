// The server's one way to Muse. The key stays here, every billed image is logged, and paid work reserves a place first.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = 'https://api.meta.ai/v1';
const MODEL = 'muse-image-1.0';
const LOG = '.muse-usage.jsonl';

export function apiKey() {
  if (process.env.META_API_KEY) return process.env.META_API_KEY;
  const line = readFileSync('.env.local', 'utf8').split('\n').find((row) => row.startsWith('META_API_KEY='));
  return line?.slice('META_API_KEY='.length).trim();
}

export async function edit(prompt, images, out, retry = true) {
  const form = new FormData();
  form.set('model', MODEL);
  form.set('prompt', prompt);
  form.set('n', '1');
  images.forEach(({ bytes, type }, i) => form.append(`image[${i}]`, new Blob([bytes], { type }), `reference-${i}.${type.split('/')[1]}`));
  const response = await fetch(`${BASE}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey()}` }, body: form });
  const text = await response.text();
  if (response.status >= 500 && retry) return edit(prompt, images, out, false);
  if (!response.ok) {
    const error = new Error(text.slice(0, 300));
    error.status = response.status;
    error.refused = text.includes('content_policy');
    throw error;
  }
  appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), out, images: 1, prompt: prompt.slice(0, 60) })}\n`);
  return Buffer.from(JSON.parse(text).data[0].b64_json, 'base64');
}

/** A daily cap across everyone plus one per visitor, kept on disk so a restart cannot reset the spend. */
export function allowance(file, daily, perVisitor, messages) {
  const read = () => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {});
  return {
    reserve(visitor) {
      const today = new Date().toISOString().slice(0, 10);
      const stored = read();
      const counts = stored.day === today ? stored : { day: today, total: 0, visitors: {} };
      if (counts.total >= daily) return messages.everyone;
      if ((counts.visitors[visitor] ?? 0) >= perVisitor) return messages.visitor;
      counts.total += 1;
      counts.visitors[visitor] = (counts.visitors[visitor] ?? 0) + 1;
      writeFileSync(file, JSON.stringify(counts));
      return null;
    },
    release(visitor) {
      const counts = read();
      counts.total = Math.max(counts.total - 1, 0);
      counts.visitors[visitor] = Math.max((counts.visitors[visitor] ?? 1) - 1, 0);
      writeFileSync(file, JSON.stringify(counts));
    },
  };
}

export function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) reject(Object.assign(new Error('too large'), { status: 413 }));
      else chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}
