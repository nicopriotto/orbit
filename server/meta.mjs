// SAM 3.1 and Muse Spark, through the same Responses API and key as Muse Image. Every call is logged with what it cost.
// With META_MOCK=1 nothing leaves the machine: masks come from the image's own background and the catalogue is fixed,
// so the interface can be tried and tested without spending.
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { decodeMaskToRaster, decodeMaskToSVGPath, parseImageStream, recordsOfKind } from '@meta-sam/parser';
import { apiKey } from './muse.mjs';

const BASE = 'https://api.meta.ai/v1';
const LOG = '.muse-usage.jsonl';
const SAM = 'sam-3.1';
const SPARK = 'muse-spark-1.3';
const SAM_USD = 0.0025; // Per image.
const SPARK_USD = { input: 1.25 / 1e6, output: 4.25 / 1e6 }; // Per token.
export const MOCK = process.env.META_MOCK === '1';
const OUTLINE = 150; // The outline is traced on the mask brought down to this many pixels on its long side: light, and smooth.

// The parser's encoder is internal to its package, so it is loaded by path. It turns a raster back into SAM's mask format.
let encoder;
const encode = async (raster, width, height) => {
  encoder ??= (await import(pathToFileURL(join(process.cwd(), 'node_modules/@meta-sam/parser/dist/mask-codec.js')).href)).encodeSegmentationMask;
  return encoder(raster, width, height);
};

function log(model, usd, note) {
  appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), model, images: 0, usd: +usd.toFixed(5), out: note })}\n`);
}

async function responses(body) {
  const response = await fetch(`${BASE}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(JSON.stringify(json).slice(0, 300));
    error.status = response.status;
    error.refused = JSON.stringify(json).includes('content_policy');
    throw error;
  }
  const text = json.output_text ?? json.output?.flatMap((item) => item.content ?? []).filter((part) => part.type === 'output_text').map((part) => part.text).join('') ?? '';
  return { text, usage: json.usage ?? {} };
}

const dataUrl = (bytes, type) => `data:${type};base64,${bytes.toString('base64')}`;

/* SAM 3.1 */

async function samText(bytes, type, prompt) {
  const { text } = await responses({
    model: SAM,
    input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt }, { type: 'input_image', image_url: dataUrl(bytes, type) }] }],
  });
  log(SAM, SAM_USD, prompt);
  return text;
}

async function parse(text) {
  async function* events() {
    yield { type: 'response.output_text.delta', item_id: 'sam', output_index: 0, content_index: 0, delta: text };
    yield { type: 'response.output_text.done', item_id: 'sam', output_index: 0, content_index: 0, text };
    yield { type: 'response.completed' };
  }
  const parsed = parseImageStream(events());
  for await (const snapshot of parsed); // eslint-disable-line no-unused-vars
  const result = await parsed.finalResult;
  return recordsOfKind(result.records, 'mask');
}

/** Without the API: whatever differs clearly from the colour of the corners is the subject. Good enough to test with. */
async function mockMask(bytes) {
  const { data, info } = await sharp(bytes).removeAlpha().resize({ width: 400, fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const at = (x, y) => [0, 1, 2].map((c) => data[(y * width + x) * 3 + c]);
  const corners = [at(2, 2), at(width - 3, 2), at(2, height - 3), at(width - 3, height - 3)];
  const raster = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const pixel = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
    raster[i] = corners.every((corner) => Math.hypot(...pixel.map((v, c) => v - corner[c])) > 60) ? 1 : 0;
  }
  return { raster, width, height };
}

/**
 * Finds what the phrase names and returns its mask over the whole image, plus its outline as an SVG path in image
 * pixels, so the page can draw SAM's answer as it arrives.
 */
export async function segment(bytes, type, prompt) {
  const { width, height } = await sharp(bytes).metadata();
  let objects;
  if (MOCK) {
    await new Promise((done) => setTimeout(done, 1200));
    const mask = await mockMask(bytes);
    objects = [{ raster: mask.raster, maskWidth: mask.width, maskHeight: mask.height, bounds: { left: 0, top: 0, right: width, bottom: height } }];
  } else {
    const records = await parse(await samText(bytes, type, prompt));
    objects = records.map((record) => ({
      raster: decodeMaskToRaster(record.mask),
      maskWidth: record.mask.width,
      maskHeight: record.mask.height,
      bounds: record.bounds,
    }));
  }
  if (!objects.length) return null;
  // The largest object is the one asked for; a stray sleeve or shadow found as a second object is left out.
  const area = ({ bounds }) => (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
  const main = objects.reduce((best, object) => (area(object) > area(best) ? object : best));
  const alpha = await maskImage(main, width, height);
  return { width, height, alpha, outline: await outline(alpha, width, height) };
}

/** The mask comes at its own resolution inside its box; it is scaled up smoothly so the edge does not step. */
async function maskImage({ raster, maskWidth, maskHeight, bounds }, width, height) {
  const left = Math.max(0, bounds.left);
  const top = Math.max(0, bounds.top);
  const boxWidth = Math.min(width, bounds.right) - left;
  const boxHeight = Math.min(height, bounds.bottom) - top;
  const small = Buffer.from(raster.map((value) => (value ? 255 : 0)));
  const scaled = await sharp(small, { raw: { width: maskWidth, height: maskHeight, channels: 1 } })
    .resize(boxWidth, boxHeight, { kernel: 'cubic', fit: 'fill' })
    .blur(maskWidth < boxWidth * 0.75 ? 1.2 : 0.6)
    .extractChannel(0)
    .raw()
    .toBuffer();
  const whole = Buffer.alloc(width * height);
  for (let y = 0; y < boxHeight; y++) scaled.copy(whole, (top + y) * width + left, y * boxWidth, (y + 1) * boxWidth);
  // A gentle curve keeps the softened edge from turning into a halo.
  for (let i = 0; i < whole.length; i++) whole[i] = Math.round(255 * Math.min(1, Math.max(0, (whole[i] - 70) / 115)));
  return whole;
}

/** SAM's answer as one clean line: the final mask, small and smoothed, traced back into image pixels. */
async function outline(alpha, width, height) {
  const scale = OUTLINE / Math.max(width, height);
  const small = { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  const soft = await sharp(alpha, { raw: { width, height, channels: 1 } }).resize(small.width, small.height, { fit: 'fill' }).blur(0.8).extractChannel(0).raw().toBuffer();
  const raster = Uint8Array.from(soft, (value) => (value > 127 ? 1 : 0));
  return { d: decodeMaskToSVGPath(await encode(raster, small.width, small.height)), scale: width / small.width };
}

/* Muse Spark */

export const GARMENT = {
  type: 'object',
  additionalProperties: false,
  required: ['is_garment', 'kind', 'name', 'colour', 'material', 'description', 'segment_as'],
  properties: {
    is_garment: { type: 'boolean' },
    kind: { type: 'string', enum: ['tops', 'shirts', 'outerwear', 'dresses', 'denim', 'trousers'] },
    name: { type: 'string' },
    colour: { type: 'string' },
    material: { type: 'string' },
    description: { type: 'string' },
    segment_as: { type: 'string' },
  },
};

const CATALOGUE = 'You catalogue garments for a fashion store. The two images are the front and the back of one garment. is_garment is false if they are not one garment shown front and back. kind is tops for a t-shirt, shirts for a buttoned shirt, outerwear for a jacket or coat, dresses for a dress, denim for jeans, trousers for any other trousers. Name it the way a premium store would, in two to four words. Give its colour and material in one or two words each, and one sentence of description, under 20 words. segment_as is a short noun phrase that names the garment for a segmentation model, such as "bomber jacket" or "pleated trousers".';

/** Reads a garment from its two photos and returns it as a catalogue entry, in a fixed shape. */
export async function catalogue(front, back) {
  if (MOCK) {
    await new Promise((done) => setTimeout(done, 1600));
    return { is_garment: true, kind: 'outerwear', name: 'Noir Quilted Bomber', colour: 'Black', material: 'Nylon', description: 'Classic bomber with a ribbed collar and cuffs, a sleeve pocket and a quilted back.', segment_as: 'bomber jacket' };
  }
  const { text, usage } = await responses({
    model: SPARK,
    reasoning: { effort: 'low' },
    input: [{
      type: 'message',
      role: 'user',
      content: [
        { type: 'input_text', text: CATALOGUE },
        { type: 'input_image', image_url: dataUrl(front.bytes, front.type) },
        { type: 'input_image', image_url: dataUrl(back.bytes, back.type) },
      ],
    }],
    text: { format: { type: 'json_schema', name: 'garment', strict: true, schema: GARMENT } },
  });
  log(SPARK, (usage.input_tokens ?? 0) * SPARK_USD.input + (usage.output_tokens ?? 0) * SPARK_USD.output, 'catalogue');
  return JSON.parse(text);
}
