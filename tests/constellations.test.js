import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { GRID, decode, pathData, shapes, taleDrawing } from '../src/lib/constellations.js';

const data = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../data/constellations.json'), 'utf8'));
const MAP = path.join(import.meta.dirname, '../dist/data/map.json');

test('a run joins its points, Z closes it and a lone point is a star', () => {
  assert.deepEqual(decode('00z0'), { stars: [[0, 0], [35, 0]], lines: [[0, 1]], circles: [] });
  assert.deepEqual(decode('000zzzZ').lines, [[0, 1], [1, 2], [0, 2]]);
  assert.deepEqual(decode('hh'), { stars: [[17, 17]], lines: [], circles: [] });
});

test('runs share the stars they pass through', () => {
  const { stars, lines } = decode('00hh hhz0 hh0z');
  assert.equal(stars.length, 4);
  assert.equal(lines.length, 3);
});

test('Q curves a line through a control point that is not a star', () => {
  assert.deepEqual(decode('00Qh0z0'), { stars: [[0, 0], [35, 0]], lines: [[0, 1, 17, 0]], circles: [] });
  assert.deepEqual(decode('00z0QhzZ').lines, [[0, 1], [1, 0, 17, 35]]);
  assert.equal(pathData(decode('00Qh0z0')), 'M0 0Q17 0 35 0');
});

test('O draws a circle with stars spaced evenly from the top', () => {
  assert.deepEqual(decode('Ohh8'), { stars: [], lines: [], circles: [[17, 17, 8]] });
  // The run from the top to the bottom of the circle joins two of its stars.
  assert.deepEqual(decode('Ohh84 h9hp'), {
    stars: [[17, 9], [25, 17], [17, 25], [9, 17]],
    lines: [[0, 2]],
    circles: [[17, 17, 8]],
  });
});

test('references place, scale and mirror icons', () => {
  const icons = { dot: '00', bar: '00z0', arc: '00Qhhz0', o: 'Ohh7' };
  const points = (d) => shapes(d, icons).map((s) => s.points);
  assert.deepEqual(points('@bar'), [[[0, 0], [35, 0]]]);
  assert.deepEqual(points('@dot:a5z'), [[[10, 5]]]);
  assert.deepEqual(points('@bar:00h'), [[[0, 0], [17, 0]]]);
  assert.deepEqual(points('@dot:00z-'), [[[35, 0]]]);
  assert.deepEqual(points('@dot:i0h-'), [[[35, 0]]]);
  assert.deepEqual(decode('@arc:00z-', icons).lines, [[0, 1, 18, 17]]);
  assert.deepEqual(decode('@o:a5z', icons).circles, [[27, 22, 7]]);
});

test('bad drawings are rejected', () => {
  assert.throws(() => decode('0'), /Bad part/);
  assert.throws(() => decode('00Z11'), /Bad part/);
  assert.throws(() => decode('00Q11'), /Bad part/);
  assert.throws(() => decode('Ohh'), /Bad part/);
  assert.throws(() => decode('@nope'), /Unknown icon/);
  assert.throws(() => decode('@a', { a: '@b', b: '00 @a' }), /refers to itself/);
});

test('every drawing in data/constellations.json decodes within the grid', () => {
  const drawings = [...Object.values(data.icons), ...Object.values(data.types), ...Object.values(data.tales)];
  for (const drawing of drawings) {
    const { stars, circles } = decode(drawing, data.icons);
    assert.ok(stars.length > 0, drawing);
    for (const [x, y] of stars) assert.ok(x >= 0 && x <= GRID && y >= 0 && y <= GRID, `${drawing}: star ${x},${y}`);
    for (const [x, y, r] of circles)
      assert.ok(x - r >= 0 && x + r <= GRID && y - r >= 0 && y + r <= GRID, `${drawing}: circle ${x},${y},${r}`);
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
