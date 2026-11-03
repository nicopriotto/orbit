import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { allowance } from '../../server/muse.mjs';

const dir = mkdtempSync(join(tmpdir(), 'orbit-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const messages = { everyone: 'everyone', visitor: 'visitor' };

test('each visitor has a cap of their own', () => {
  const caps = allowance(join(dir, 'a.json'), 10, 2, messages);
  assert.equal(caps.reserve('ana'), null);
  assert.equal(caps.reserve('ana'), null);
  assert.equal(caps.reserve('ana'), 'visitor');
  assert.equal(caps.reserve('leo'), null);
});

test('the daily cap holds across visitors', () => {
  const caps = allowance(join(dir, 'b.json'), 2, 5, messages);
  caps.reserve('ana');
  caps.reserve('leo');
  assert.equal(caps.reserve('nora'), 'everyone');
});

test('a released place can be taken again, and counts never go below zero', () => {
  const caps = allowance(join(dir, 'c.json'), 1, 1, messages);
  caps.reserve('ana');
  caps.release('ana');
  caps.release('ana');
  assert.equal(caps.reserve('ana'), null);
  assert.equal(caps.reserve('leo'), 'everyone');
});

test('the counts survive a restart', () => {
  const file = join(dir, 'd.json');
  allowance(file, 1, 1, messages).reserve('ana');
  assert.equal(allowance(file, 1, 1, messages).reserve('leo'), 'everyone');
});
