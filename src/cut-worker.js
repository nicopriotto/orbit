/* global FileReaderSync */
// Cuts a person out of Muse's green-screen image, off the page's thread. The page sends the image, how green the look's
// clothes are, and SAM 3.1's mask; it gets back the person placed where the mannequin stands, as a data URL.
const CANVAS = { width: 1120, height: 2130 };
const FIGURE = { top: 70, bottom: 2080 };
const EDGE = 2; // Pixels trimmed from the outline.

const smooth = (low, high, x) => {
  const t = Math.min(Math.max((x - low) / (high - low), 0), 1);
  return t * t * (3 - 2 * t);
};

/** An image sent as base64, ready to draw. */
const decode = (base64, type) => createImageBitmap(new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type }));

/** Muse drifts from the green it was asked for, more so from a real photo, so the colour to remove is read from the image's own edges. */
function backdrop(data, width, height) {
  const channels = [[], [], []];
  const sample = (x, y) => channels.forEach((values, c) => values.push(data[(y * width + x) * 4 + c]));
  for (let x = 0; x < width; x += 4) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += 4) {
    sample(0, y);
    sample(width - 1, y);
  }
  return channels.map((values) => values.sort((a, b) => a - b)[values.length >> 1]);
}

/** How far a pixel is from being backdrop gone dark: Muse shades the green in gaps between fingers, arms and legs, away from the colour read at the edges. Olive and sage stay below this. */
function shadedGreen(red, green, blue) {
  const excess = green - Math.max(red, blue);
  return smooth(10, 24, excess) * smooth(0.16, 0.28, excess / Math.max(green, 1));
}

/** Each pixel takes the lowest or highest value within a radius, one axis at a time. */
function spread(values, width, height, radius, pick) {
  const across = values.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = values[y * width + x];
      for (let d = Math.max(x - radius, 0); d <= Math.min(x + radius, width - 1); d++) value = pick(value, values[y * width + d]);
      across[y * width + x] = value;
    }
  }
  const result = across.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = across[y * width + x];
      for (let d = Math.max(y - radius, 0); d <= Math.min(y + radius, height - 1); d++) value = pick(value, across[d * width + x]);
      result[y * width + x] = value;
    }
  }
  return result;
}

/**
 * SAM 3.1's mask of the person: well inside it, whatever is not plain backdrop is kept, even something green they
 * wear; well outside it nothing is, so no patch of backdrop survives. Along the edge the chroma key decides.
 */
const MASK_MARGIN = 7; // Pixels of the full image; SAM's person mask comes at about half its resolution.

async function keepPerson(alpha, matte, mask, width, height) {
  const image = await decode(mask, 'image/png').catch(() => null);
  if (!image) return;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const sure = new Uint8Array(width * height);
  for (let p = 0; p < sure.length; p++) sure[p] = data[p * 4];
  // SAM's mask is coarser than the photo, so it only rules away from its own edge: shrunk, it says what is surely the
  // person; grown, what is surely backdrop. The band between is left to the chroma key's finer edge.
  const inside = spread(sure, width, height, MASK_MARGIN, Math.min);
  const outside = spread(sure, width, height, MASK_MARGIN, Math.max);
  for (let p = 0; p < alpha.length; p++) {
    if (outside[p] < 10) alpha[p] = 0;
    // Surely the person, and not plain backdrop: a gap between the fingers is backdrop through and through and stays
    // open, while something green they wear differs from the backdrop enough to be kept.
    else if (inside[p] > 245 && matte[p] > 40) alpha[p] = 255;
  }
}

/** Cuts the figure out and places it on the mannequin's canvas, so the person stands exactly where it did. */
async function cutOut(base64, green, mask) {
  const image = await decode(base64, 'image/webp');
  const source = new OffscreenCanvas(image.width, image.height);
  const context = source.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, source.width, source.height);
  const { data, width, height } = pixels;
  const [keyRed, keyGreen, keyBlue] = backdrop(data, width, height);
  const matte = new Uint8Array(width * height);
  for (let p = 0; p < matte.length; p++) {
    const [red, green, blue] = [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]];
    matte[p] = smooth(0.1, 0.2, Math.hypot(red - keyRed, green - keyGreen, blue - keyBlue) / 255) * (1 - shadedGreen(red, green, blue)) * 255;
  }
  // Pixels on the outline are part background, so the outline is pulled in and whatever green is left nearby is removed.
  const alpha = spread(matte, width, height, EDGE, Math.min);
  if (mask) await keepPerson(alpha, matte, mask, width, height);
  const near = spread(alpha.map((value) => (value < 250 ? 255 : 0)), width, height, EDGE * 2, Math.max);
  let top = height;
  let bottom = 0;
  for (let p = 0; p < alpha.length; p++) {
    const i = p * 4;
    data[i + 3] = alpha[p];
    const brightest = Math.max(data[i], data[i + 2]);
    // Light cloth also reflects the backdrop inside its folds, so nothing stays greener than the look itself.
    data[i + 1] = Math.min(data[i + 1], near[p] ? brightest * 1.02 : brightest / (1 - green));
    if (alpha[p] > 127) {
      const y = Math.floor(p / width);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  let left = width;
  let right = 0;
  for (let y = bottom - Math.floor((bottom - top) * 0.03); y <= bottom; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 127) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  }
  context.putImageData(pixels, 0, 0);
  const scale = (FIGURE.bottom - FIGURE.top) / (bottom - top);
  const placed = new OffscreenCanvas(CANVAS.width, CANVAS.height);
  const target = placed.getContext('2d');
  target.imageSmoothingQuality = 'high';
  target.drawImage(source, CANVAS.width / 2 - ((left + right) / 2) * scale, FIGURE.top - top * scale, width * scale, height * scale);
  return new FileReaderSync().readAsDataURL(await placed.convertToBlob({ type: 'image/webp', quality: 0.92 }));
}

self.addEventListener('message', async ({ data: { id, base64, green, mask } }) => {
  try {
    self.postMessage({ id, url: await cutOut(base64, green, mask) });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
});
