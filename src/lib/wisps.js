// Where the wisps sit and which of them show at a given zoom.
//
// Every tale gets a spot near its place: the first at the place itself, the rest on a
// sunflower spiral around it. The spots are then ranked by farthest-point sampling, with a
// seeded random weight so the order looks natural: each tale's `spacing` is its distance to
// the nearest tale ranked before it. Showing the tales whose spacing is at least some
// distance d keeps every pair of shown wisps at least d apart, wherever they are, so zooming
// in (a smaller d on the ground) reveals more wisps, evenly spread over the map.

const RAD = Math.PI / 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// Small seeded random generator, so the wisps sit and drift the same way on every visit.
export const random = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// [dLon, dLat] offsets in degrees for `count` spots around a place at latitude `lat`, `step` degrees apart.
export function sunflower(count, lat, step = 0.4) {
  const cosLat = Math.max(0.3, Math.cos(lat * RAD));
  return Array.from({ length: count }, (_, i) => {
    const r = step * Math.sqrt(i);
    const a = i * GOLDEN_ANGLE;
    return [(r * Math.cos(a)) / cosLat, r * Math.sin(a)];
  });
}

// Ranks [lon, lat] points (degrees) by farthest-point sampling. Returns, for each point, its rank
// and its spacing: the angle (radians) to the nearest point ranked before it (π for the first).
export function rankBySpread(points, seed = 1) {
  const n = points.length;
  const xyz = points.map(([lon, lat]) => {
    const cl = Math.cos(lat * RAD);
    return [cl * Math.cos(lon * RAD), cl * Math.sin(lon * RAD), Math.sin(lat * RAD)];
  });
  const rnd = random(seed);
  const weight = Float64Array.from({ length: n }, () => 0.7 + 0.6 * rnd());
  const nearest = new Float64Array(n).fill(Infinity); // squared chord to the nearest ranked point
  const rank = new Int32Array(n).fill(-1);
  const spacing = new Float64Array(n);
  let next = weight.indexOf(Math.max(...weight));
  for (let r = 0; r < n; r++) {
    rank[next] = r;
    spacing[next] = r === 0 ? Math.PI : 2 * Math.asin(Math.min(1, Math.sqrt(nearest[next]) / 2));
    const [x, y, z] = xyz[next];
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < n; i++) {
      if (rank[i] >= 0) continue;
      const d = (xyz[i][0] - x) ** 2 + (xyz[i][1] - y) ** 2 + (xyz[i][2] - z) ** 2;
      if (d < nearest[i]) nearest[i] = d;
      const score = nearest[i] * weight[i];
      if (score > bestScore) (bestScore = score), (best = i);
    }
    next = best;
  }
  return { rank, spacing };
}

// Angle in radians between two [lon, lat] points in degrees.
export function angle([lon1, lat1], [lon2, lat2]) {
  const s = Math.sin(((lat2 - lat1) * RAD) / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(((lon2 - lon1) * RAD) / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

// 0 below 0, 1 above 1, smooth in between.
export const smoothstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// Spots for `count` wisps around a place at [lng, lat]: the sunflower spiral, keeping only the spots
// `fits(lon, lat, step)` accepts (e.g. inside the place's country), nearest the place first. If too few
// fit, the spiral is drawn tighter and tried again. Returns [dLon, dLat] offsets, or null.
export function spotsWithin(count, [lng, lat], fits, step = 0.4) {
  for (let tries = 0; tries < 6; tries++, step *= 0.7) {
    const out = [];
    for (const [dLon, dLat] of sunflower(count * 16, lat, step)) {
      if (fits(lng + dLon, lat + dLat, step)) out.push([dLon, dLat]);
      if (out.length === count) return out;
    }
  }
  return null;
}

// Distance in degrees (of latitude) from [lon, lat] to the nearest edge of `rings` ([[lon, lat], ...]),
// measured on a local flat map: enough for the short distances between a wisp and its country's border.
export function distanceToRings(rings, [lon, lat]) {
  const cl = Math.cos(lat * RAD);
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const ax = (ring[i - 1][0] - lon) * cl;
      const ay = ring[i - 1][1] - lat;
      const bx = (ring[i][0] - lon) * cl;
      const by = ring[i][1] - lat;
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}
