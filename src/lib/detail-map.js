// The detailed map for the flat map zoomed in. There the projection is a plain scale and shift of
// longitude and latitude, so the outlines are drawn straight from typed arrays, without d3-geo, and
// only the pieces whose bounding box reaches the screen.

import { feature, mesh } from 'topojson-client';

// Lines are cut into pieces of at most this many points, so a long coast is drawn only where it's on screen.
const PIECE = 64;

const bboxOf = (xy) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < xy.length; i += 2) {
    if (xy[i] < x0) x0 = xy[i];
    if (xy[i] > x1) x1 = xy[i];
    if (xy[i + 1] < y0) y0 = xy[i + 1];
    if (xy[i + 1] > y1) y1 = xy[i + 1];
  }
  return [x0, y0, x1, y1];
};
// [[lon, lat], ...] as [lon, lat, lon, lat, ...], with longitudes kept continuous where the line
// crosses the antimeridian (so they may run past ±180).
function flat(coords) {
  const xy = new Float32Array(coords.length * 2);
  let turn = 0;
  for (let i = 0; i < coords.length; i++) {
    if (i > 0) turn += Math.round((coords[i - 1][0] - coords[i][0]) / 360) * 360;
    xy[i * 2] = coords[i][0] + turn;
    xy[i * 2 + 1] = coords[i][1];
  }
  return xy;
}
const polygons = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

// A ring that goes once around a pole (Antarctica's coast) ends 360° from where it starts: close it
// along the pole instead of straight back across the map.
function closeAtPole(xy) {
  const n = xy.length;
  if (Math.abs(xy[n - 2] - xy[0]) < 180) return xy;
  let lat = 0;
  for (let i = 1; i < n; i += 2) lat += xy[i];
  const pole = lat < 0 ? -90 : 90;
  return Float32Array.of(...xy, xy[n - 2], pole, xy[0], pole);
}

// Every polygon of a country, as rings of [lon, lat, lon, lat, ...], with their bounding box.
function areas(f) {
  return polygons(f.geometry).map((rings) => {
    const xy = rings.map((ring) => closeAtPole(flat(ring)));
    const boxes = xy.map(bboxOf);
    const bbox = [0, 1, 2, 3].map((i) => (i < 2 ? Math.min : Math.max)(...boxes.map((b) => b[i])));
    return { bbox, rings: xy };
  });
}

// A MultiLineString cut into pieces that share their end points, each with its bounding box.
export function pieces(lines, size = PIECE) {
  const out = [];
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i += size - 1) {
      const xy = flat(line.slice(i, i + size));
      out.push({ bbox: bboxOf(xy), rings: [xy] });
    }
  }
  return out;
}

// topo: TopoJSON with countries and land objects, like scripts/build-world.js writes.
export function detailMap(topo) {
  const countries = feature(topo, topo.objects.countries).features;
  const byName = new Map(countries.map((f) => [f.properties.name, areas(f)]));
  return {
    byName,
    fills: [...byName.values()].flat(),
    borders: pieces(mesh(topo, topo.objects.countries, (a, b) => a !== b).coordinates),
    coast: pieces(mesh(topo, topo.objects.land).coordinates),
  };
}

// The screen as a transform from degrees: x = ox + k * lon, y = oy - k * lat, for a map centred on
// lon0 (so lon runs from lon0 - 180 to lon0 + 180), with the window it shows in degrees and a margin.
export function flatView({ ox, oy, k, w, h, margin = 4 }) {
  return { ox, oy, k, lon0: (-ox - margin) / k, lon1: (w - ox + margin) / k, lat0: (oy - h - margin) / k, lat1: (oy + margin) / k };
}

// Adds the parts that reach the window to the context's current path, each at every whole turn of
// 360° that puts it there (the window is narrower than the world, so no point shows twice).
export function tracePieces(ctx, parts, t, close) {
  const { ox, oy, k, lon0, lon1, lat0, lat1 } = t;
  for (const { bbox, rings } of parts) {
    if (bbox[1] > lat1 || bbox[3] < lat0) continue;
    for (let turn = -360; turn <= 360; turn += 360) {
      if (bbox[0] + turn > lon1 || bbox[2] + turn < lon0) continue;
      const x0 = ox + k * turn;
      for (const xy of rings) {
        ctx.moveTo(x0 + k * xy[0], oy - k * xy[1]);
        for (let i = 2; i < xy.length; i += 2) ctx.lineTo(x0 + k * xy[i], oy - k * xy[i + 1]);
        if (close) ctx.closePath();
      }
    }
  }
}
