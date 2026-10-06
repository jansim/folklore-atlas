import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { GRID, decode, runs, taleDrawing } from '../src/lib/constellations.js';

const data = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../data/constellations.json'), 'utf8'));
const MAP = path.join(import.meta.dirname, '../dist/data/map.json');

test('a run joins its points, Z closes it and a lone point is a star', () => {
  assert.deepEqual(decode('00z0'), { stars: [[0, 0], [35, 0]], lines: [[0, 1]] });
  assert.deepEqual(decode('000zzzZ').lines, [[0, 1], [1, 2], [0, 2]]);
  assert.deepEqual(decode('hh'), { stars: [[17, 17]], lines: [] });
});

test('runs share the stars they pass through', () => {
  const { stars, lines } = decode('00hh hhz0 hh0z');
  assert.equal(stars.length, 4);
  assert.equal(lines.length, 3);
});

test('references place, scale and mirror icons', () => {
  const icons = { dot: '00', bar: '00z0' };
  assert.deepEqual(runs('@bar', icons), [[[0, 0], [35, 0]]]);
  assert.deepEqual(runs('@dot:a5z', icons), [[[10, 5]]]);
  assert.deepEqual(runs('@bar:00h', icons), [[[0, 0], [17, 0]]]);
  assert.deepEqual(runs('@dot:00z-', icons), [[[35, 0]]]);
  assert.deepEqual(runs('@dot:i0h-', icons), [[[35, 0]]]);
});

test('bad drawings are rejected', () => {
  assert.throws(() => decode('0'), /Bad part/);
  assert.throws(() => decode('00Z11'), /Bad part/);
  assert.throws(() => decode('@nope'), /Unknown icon/);
  assert.throws(() => decode('@a', { a: '@b', b: '00 @a' }), /refers to itself/);
});

test('every drawing in data/constellations.json decodes within the grid', () => {
  const drawings = [...Object.values(data.icons), ...Object.values(data.types), ...Object.values(data.tales)];
  for (const drawing of drawings) {
    const { stars } = decode(drawing, data.icons);
    assert.ok(stars.length > 0, drawing);
    for (const [x, y] of stars) assert.ok(x >= 0 && x <= GRID && y >= 0 && y <= GRID, `${drawing}: star ${x},${y}`);
  }
});

test('every icon is used', () => {
  const all = [...Object.values(data.icons), ...Object.values(data.types), ...Object.values(data.tales)].join(' ');
  for (const name of Object.keys(data.icons)) assert.ok(all.includes(`@${name}`), `icon ${name} is unused`);
});

test('every placed tale has a drawing', { skip: !fs.existsSync(MAP) && 'run npm run build first' }, () => {
  const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
  for (const [id, title, atu] of map.places.flatMap((p) => p.tales))
    assert.ok(taleDrawing(data, id, atu), `tale ${id} (${title}, ATU ${atu}) has no drawing`);
});
