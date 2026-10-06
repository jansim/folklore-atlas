import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MERCATOR_MAX, detailMap, flatView, mercatorLat, pieces, tracePieces } from '../src/lib/detail-map.js';

// A context that records the points of the path traced into it.
const recorder = () => {
  const ctx = { subpaths: [], closed: 0 };
  ctx.moveTo = (x, y) => ctx.subpaths.push([[x, y]]);
  ctx.lineTo = (x, y) => ctx.subpaths.at(-1).push([x, y]);
  ctx.closePath = () => ctx.closed++;
  return ctx;
};

// A topology without quantization: one country made of two polygons, one of them across the antimeridian.
const topo = {
  type: 'Topology',
  arcs: [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[175, -10], [-175, -10], [-175, 0], [175, 0], [175, -10]],
  ],
  objects: {
    countries: { type: 'GeometryCollection', geometries: [{ type: 'MultiPolygon', arcs: [[[0]], [[1]]], properties: { name: 'Isle' } }] },
    land: { type: 'GeometryCollection', geometries: [{ type: 'MultiPolygon', arcs: [[[0]], [[1]]] }] },
  },
};

test('lines are cut into pieces that share their ends', () => {
  const line = Array.from({ length: 10 }, (_, i) => [i, i]);
  const parts = pieces([line], 4);
  assert.deepEqual(parts.map((p) => [...p.rings[0]].filter((_, i) => i % 2 === 0)), [[0, 1, 2, 3], [3, 4, 5, 6], [6, 7, 8, 9]]);
  assert.deepEqual(parts[1].bbox, [3, 3, 6, 6]);
});

test('polygons across the antimeridian keep their longitudes continuous', () => {
  const map = detailMap(topo);
  const [, across] = map.byName.get('Isle');
  assert.deepEqual(across.bbox, [175, -10, 185, 0]);
});

test('only the parts that reach the screen are traced, at the turn that puts them there', () => {
  const map = detailMap(topo);
  // 10 px per degree, the map centred on lon 0 and lat 0, a screen 100 x 100 px (lon -5..5, lat -5..5).
  const at = (lon0) => flatView({ ox: 50 - 10 * lon0, oy: 50, k: 10, w: 100, h: 100, margin: 0 });
  const ctx = recorder();
  tracePieces(ctx, map.fills, at(0), true);
  assert.equal(ctx.subpaths.length, 1);
  assert.deepEqual(ctx.subpaths[0][0], [50, 50]);
  assert.equal(ctx.closed, 1);

  // Centred on the antimeridian, from the west: the polygon across it is traced one turn back.
  const west = recorder();
  tracePieces(west, map.fills, at(-180), true);
  assert.equal(west.subpaths.length, 1);
  assert.deepEqual(west.subpaths[0][0], [50 + 10 * (175 - 360 + 180), 50 + 100]);
});

test('zoomed in, the map turns Mercator: latitudes are drawn at their Mercator y', () => {
  const map = detailMap(topo);
  const t = flatView({ ox: 50, oy: 50, k: 10, m: 1, w: 100, h: 100, margin: 0 });
  assert.deepEqual([t.lon0, t.lon1, t.y0, t.y1], [-5, 5, -5, 5]);
  const ctx = recorder();
  tracePieces(ctx, map.fills, t, true);
  const [x, y] = ctx.subpaths[0][2];
  assert.equal(x, 150);
  assert.ok(Math.abs(y - (50 - 10 * mercatorLat(10))) < 1e-3);
  // Halfway, halfway between the latitude and its Mercator y.
  const half = recorder();
  tracePieces(half, map.fills, flatView({ ox: 50, oy: 50, k: 10, m: 0.5, w: 100, h: 100, margin: 0 }), true);
  assert.ok(Math.abs(half.subpaths[0][2][1] - (50 - 5 * (10 + mercatorLat(10)))) < 1e-3);
});

test('Mercator y matches the latitude at the equator and stops where the map is square', () => {
  assert.ok(Math.abs(mercatorLat(0)) < 1e-9);
  assert.ok(mercatorLat(10) > 10);
  assert.ok(Math.abs(mercatorLat(90) - 180) < 1e-9);
  assert.ok(Math.abs(mercatorLat(-90) + mercatorLat(MERCATOR_MAX)) < 1e-9);
});

test('a ring around a pole is closed along the pole', () => {
  const ring = [[-180, -70], [-90, -72], [0, -70], [90, -72], [180, -70]];
  const polar = {
    type: 'Topology',
    arcs: [ring, [[-180, -90], [180, -90]]],
    objects: {
      countries: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', arcs: [[0]], properties: { name: 'Pole' } }] },
      land: { type: 'GeometryCollection', geometries: [] },
    },
  };
  const [area] = detailMap(polar).byName.get('Pole');
  const xy = [...area.rings[0]];
  assert.deepEqual(xy.slice(-4), [180, -90, -180, -90]);
  assert.deepEqual(area.bbox, [-180, -90, 180, -70]);
});
