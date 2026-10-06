// The detailed map for the flat map zoomed in. There the projection is a plain scale and shift of
// longitude and of a blend of latitude and its Mercator y, so the outlines are drawn straight from
// typed arrays, without d3-geo, and only the pieces whose bounding box reaches the screen.

import { feature, mesh } from 'topojson-client';

const RAD = Math.PI / 180;
// Mercator stops where the map is square, as on web maps: at about 85.05°.
export const MERCATOR_MAX = Math.atan(Math.sinh(Math.PI)) / RAD;
// A latitude's Mercator y, in degrees (so it matches the latitude near the equator).
export const mercatorLat = (lat) => {
  const phi = Math.max(-MERCATOR_MAX, Math.min(MERCATOR_MAX, lat)) * RAD;
  return Math.log(Math.tan(Math.PI / 4 + phi / 2)) / RAD;
};
// Each ring's Mercator y next to its latitudes, and the bounding box's, so they are worked out once.
function withMercator(part) {
  part.mys = part.rings.map((xy) => {
    const my = new Float32Array(xy.length / 2);
    for (let i = 0; i < my.length; i++) my[i] = mercatorLat(xy[i * 2 + 1]);
    return my;
  });
  part.mbox = [mercatorLat(part.bbox[1]), mercatorLat(part.bbox[3])];
  return part;
}

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
    return withMercator({ bbox, rings: xy });
  });
}

// A MultiLineString cut into pieces that share their end points, each with its bounding box.
export function pieces(lines, size = PIECE) {
  const out = [];
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i += size - 1) {
      const xy = flat(line.slice(i, i + size));
      out.push(withMercator({ bbox: bboxOf(xy), rings: [xy] }));
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

// The screen as a transform from degrees: x = ox + k * lon, y = oy - k * y(lat), where y(lat) blends
// the latitude (m = 0, the flat map) into its Mercator y (m = 1), with the window it shows (longitudes,
// and y in degrees) and a margin.
export function flatView({ ox, oy, k, m = 0, w, h, margin = 4 }) {
  return { ox, oy, k, m, lon0: (-ox - margin) / k, lon1: (w - ox + margin) / k, y0: (oy - h - margin) / k, y1: (oy + margin) / k };
}

// Adds the parts that reach the window to the context's current path, each at every whole turn of
// 360° that puts it there (the window is narrower than the world, so no point shows twice).
export function tracePieces(ctx, parts, t, close) {
  const { ox, oy, k, m, lon0, lon1, y0, y1 } = t;
  const kl = k * (1 - m);
  const km = k * m;
  for (const { bbox, mbox, rings, mys } of parts) {
    if ((1 - m) * bbox[1] + m * mbox[0] > y1 || (1 - m) * bbox[3] + m * mbox[1] < y0) continue;
    for (let turn = -360; turn <= 360; turn += 360) {
      if (bbox[0] + turn > lon1 || bbox[2] + turn < lon0) continue;
      const x0 = ox + k * turn;
      for (let r = 0; r < rings.length; r++) {
        const xy = rings[r];
        const my = mys[r];
        ctx.moveTo(x0 + k * xy[0], oy - kl * xy[1] - km * my[0]);
        for (let i = 2, j = 1; i < xy.length; i += 2, j++) ctx.lineTo(x0 + k * xy[i], oy - kl * xy[i + 1] - km * my[j]);
        if (close) ctx.closePath();
      }
    }
  }
}
