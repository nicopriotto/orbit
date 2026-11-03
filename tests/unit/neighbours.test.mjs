import assert from 'node:assert/strict';
import { test } from 'node:test';
import { neighbours } from '../../server/looks.mjs';

// A 5×5 mask with one bright pixel in the middle.
const dot = Buffer.alloc(25);
dot[12] = 255;

test('dilation grows a pixel into a square of its reach', () => {
  const grown = neighbours(dot, 5, 5, 1, Math.max);
  const lit = [...grown].map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(lit, [6, 7, 8, 11, 12, 13, 16, 17, 18]);
});

test('erosion removes a lone pixel', () => {
  assert.ok(neighbours(dot, 5, 5, 1, Math.min).every((v) => v === 0));
});

test('the input is left as it was', () => {
  neighbours(dot, 5, 5, 2, Math.max);
  assert.equal(dot.reduce((a, b) => a + b, 0), 255);
});
