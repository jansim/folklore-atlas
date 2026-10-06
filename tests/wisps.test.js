import assert from 'node:assert/strict';
import { test } from 'node:test';
import { angle, distanceToRings, rankBySpread, random, insideRings, spreadOver, sunflower } from '../src/lib/wisps.js';

const rnd = random(3);
// Clustered points, like the tales: many around a few places.
const points = Array.from({ length: 400 }, (_, i) => {
  const [lon, lat] = [[10, 50], [78, 22], [-90, 38], [24, 38]][i % 4];
  return [lon + (rnd() - 0.5) * 12, lat + (rnd() - 0.5) * 8];
});

test('ranking is deterministic for a seed', () => {
  assert.deepEqual(rankBySpread(points, 7).rank, rankBySpread(points, 7).rank);
  assert.notDeepEqual(rankBySpread(points, 7).rank, rankBySpread(points, 8).rank);
});

test('ranks are a permutation and spacing is the distance to the nearest earlier point', () => {
  const { rank, spacing } = rankBySpread(points, 7);
  assert.deepEqual([...rank].sort((a, b) => a - b), points.map((_, i) => i));
  const order = [...rank.keys()].sort((a, b) => rank[a] - rank[b]);
  for (let r = 1; r < order.length; r += 37) {
    const nearest = Math.min(...order.slice(0, r).map((j) => angle(points[order[r]], points[j])));
    assert.ok(Math.abs(spacing[order[r]] - nearest) < 1e-9);
  }
});

test('the points shown at any spacing are at least that far apart', () => {
  const { spacing } = rankBySpread(points, 7);
  for (const d of [0.3, 0.1, 0.03]) {
    const shown = points.filter((_, i) => spacing[i] >= d);
    assert.ok(shown.length > 1);
    for (let i = 0; i < shown.length; i++)
      for (let j = i + 1; j < shown.length; j++) assert.ok(angle(shown[i], shown[j]) >= d - 1e-12, `${d}: ${i}, ${j}`);
  }
});

test('the first points spread over all clusters', () => {
  const { rank } = rankBySpread(points, 7);
  const first = [...rank.keys()].filter((i) => rank[i] < 4).map((i) => i % 4);
  assert.deepEqual(first.sort(), [0, 1, 2, 3]);
});

test('sunflower spots start at the place and stay apart', () => {
  const spots = sunflower(50, 50);
  assert.deepEqual(spots[0], [0, 0]);
  for (let i = 1; i < spots.length; i++) assert.ok(angle([10, 50], [10 + spots[i][0], 50 + spots[i][1]]) > 0);
});

test('spots spread over a shape stay inside it and cover all of it', () => {
  // A 4° by 3° box around [10, 50], about 7.7 square degrees on the ground.
  const inBox = (lon, lat) => lon > 8 && lon < 12 && lat > 48.5 && lat < 51.5;
  const box = [[8, 48.5], [12, 51.5]];
  const spots = spreadOver(120, [box], 4 * 3 * Math.cos(50 * Math.PI / 180), inBox);
  assert.equal(spots.length, 120);
  for (const [lon, lat] of spots) assert.ok(inBox(lon, lat));
  // Every quarter of the box gets about a quarter of the spots.
  for (const [x, y] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    const n = spots.filter(([lon, lat]) => (lon > 10) === !!x && (lat > 50) === !!y).length;
    assert.ok(n > 20 && n < 40, `${x}, ${y}: ${n}`);
  }
  // A single spot sits in the middle.
  const [[lon, lat]] = spreadOver(1, [box], 7.7, inBox);
  assert.ok(Math.abs(lon - 10) < 1 && Math.abs(lat - 50) < 1);
  assert.deepEqual(spreadOver(5, [box], 7.7, inBox, 3), spreadOver(5, [box], 7.7, inBox, 3));
  assert.equal(spreadOver(10, [box], 7.7, () => false), null);
});

test('spots spread across the antimeridian', () => {
  const inBox = (lon, lat) => (lon > 178 || lon < -178) && Math.abs(lat) < 2;
  const spots = spreadOver(20, [[[178, -2], [-178, 2]]], 16, inBox);
  assert.equal(spots.length, 20);
  assert.ok(spots.some(([lon]) => lon > 178) && spots.some(([lon]) => lon < -178));
});

test('distance to rings is the distance to the nearest edge', () => {
  const square = [[[0, -1], [2, -1], [2, 1], [0, 1], [0, -1]]];
  assert.ok(Math.abs(distanceToRings(square, [0.5, 0]) - 0.5) < 1e-9);
  assert.ok(Math.abs(distanceToRings(square, [1, 0.25]) - 0.75) < 1e-9);
});

test('inside rings: in the outer ring and out of its holes', () => {
  const rings = [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]], [[10, 0], [11, 0], [11, 1], [10, 0]]];
  assert.ok(insideRings(rings, [3, 3]));
  assert.ok(!insideRings(rings, [1.5, 1.5]));
  assert.ok(!insideRings(rings, [5, 2]));
  assert.ok(insideRings(rings, [10.8, 0.3]));
});
