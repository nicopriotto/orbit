import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KINDS, MAN, SHOES, UNDER, lookId, plainLook } from '../../src/wardrobe.js';

const piece = (id) => ({ id });

test('a bare mannequin has the id bare, whatever shoes it wears', () => {
  assert.equal(lookId(null, null, null, piece('loafers')), 'bare');
});

test('top and bottom join with a dash, and a missing half is none', () => {
  assert.equal(lookId(piece('tee-ink'), piece('jeans')), 'tee-ink-jeans');
  assert.equal(lookId(piece('dress-red'), null), 'dress-red-none');
});

test('a jacket over the plain tee leaves the tee out of the id', () => {
  assert.equal(lookId(UNDER, piece('chinos'), piece('jacket')), 'jacket-chinos');
});

test('a jacket goes over another top, or open with nothing under it', () => {
  assert.equal(lookId(piece('shirt-white'), piece('pants-charcoal'), piece('blazer-tweed')), 'blazer-tweed-over-shirt-white-pants-charcoal');
  assert.equal(lookId(null, piece('jeans'), piece('jacket-leather')), 'jacket-leather-open-jeans');
});

test('the default sneakers are not named, other shoes are', () => {
  assert.equal(lookId(piece('tee'), piece('jeans'), null, SHOES), 'tee-jeans');
  assert.equal(lookId(piece('tee'), piece('jeans'), null, piece('boots-chelsea')), 'tee-jeans-in-boots-chelsea');
});

test("the man's looks share ids with a prefix", () => {
  assert.equal(plainLook(`${MAN}tee-jeans`), 'tee-jeans');
  assert.equal(plainLook('tee-jeans'), 'tee-jeans');
});

test('every kind dresses a known slot', () => {
  for (const kind of KINDS) assert.ok(['top', 'bottom', 'outer', 'shoes'].includes(kind.slot), kind.id);
});
