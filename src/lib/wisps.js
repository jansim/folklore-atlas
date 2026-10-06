// Where the wisps sit and which of them show at a given zoom.
//
// Every tale gets a spot in its place's country: the country's tales are spread evenly over its
// whole area, each place taking the spots nearest it (a sunflower spiral around the place where
// there is no country to spread over). The spots are then ranked by farthest-point sampling, with a
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

// `count` spots spread evenly over a shape (e.g. a country), its middle as well as its edges: a jittered
// hexagonal grid several times finer than the shape's `area` (square degrees) and `count` need, laid over
// each of its `boxes` ([[west, south], [east, north]], east < west across the antimeridian), keeping the
// points `fits(lon, lat, step)` accepts, then `count` of them picked as the middles of as many equal parts
// of the grid. If too few points fit, the grid is drawn finer and tried again. Returns [lon, lat] points, or null.
export function spreadOver(count, boxes, area, fits, seed = 1) {
  if (count < 1) return [];
  let step = Math.sqrt((2 * area) / (Math.sqrt(3) * (count * 4 + 30))); // hexagons of area / (count * 4 + 30)
  for (let tries = 0; tries < 16; tries++, step *= 0.8) {
    const rnd = random(seed);
    const dy = (step * Math.sqrt(3)) / 2;
    const found = [];
    for (let [[west, south], [east, north]] of boxes) {
      if (east < west) east += 360;
      for (let row = 0, lat = south + dy * rnd(); lat < north; row++, lat += dy) {
        const dx = step / Math.max(0.1, Math.cos(lat * RAD));
        for (let lon = west + dx * ((row % 2) / 2 + rnd() * 0.5); lon < east; lon += dx) {
          const x = lon + (rnd() - 0.5) * 0.4 * dx;
          const y = lat + (rnd() - 0.5) * 0.4 * dy;
          const point = [x > 180 ? x - 360 : x, y];
          if (fits(point[0], point[1], step)) found.push(point);
        }
      }
    }
    if (found.length >= count) return middles(found, count);
  }
  return null;
}

// `count` of the points, one in the middle of each of `count` compact groups of them: groups seeded by
// farthest-point sampling, evened out by a few rounds of Lloyd's relaxation (k-means).
function middles(points, count) {
  const n = points.length;
  const xyz = points.map(([lon, lat]) => {
    const cl = Math.cos(lat * RAD);
    return [cl * Math.cos(lon * RAD), cl * Math.sin(lon * RAD), Math.sin(lat * RAD)];
  });
  const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  // Seeds: the point nearest the middle of them all, then each time the point farthest from the seeds so far.
  const all = [0, 1, 2].map((k) => xyz.reduce((sum, p) => sum + p[k], 0) / n);
  const nearest = xyz.map((p) => dist(p, all));
  let next = nearest.indexOf(Math.min(...nearest));
  nearest.fill(Infinity);
  const centers = [];
  while (centers.length < count) {
    centers.push(xyz[next]);
    const c = xyz[next];
    nearest[next] = -1;
    next = 0;
    for (let i = 0; i < n; i++) {
      if (nearest[i] < 0) continue;
      nearest[i] = Math.min(nearest[i], dist(c, xyz[i]));
      if (nearest[i] > nearest[next]) next = i;
    }
  }
  // Lloyd's relaxation: each center moves to the middle of the points nearest it.
  const c3 = Float64Array.from(centers.flat());
  const p3 = Float64Array.from(xyz.flat());
  const sums = new Float64Array(count * 4);
  for (let round = 0; round < 10; round++) {
    sums.fill(0);
    for (let i = 0; i < n * 3; i += 3) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < count * 3; c += 3) {
        const d = (p3[i] - c3[c]) ** 2 + (p3[i + 1] - c3[c + 1]) ** 2 + (p3[i + 2] - c3[c + 2]) ** 2;
        if (d < bestD) (bestD = d), (best = c);
      }
      const g = (best / 3) * 4;
      (sums[g] += p3[i]), (sums[g + 1] += p3[i + 1]), (sums[g + 2] += p3[i + 2]), sums[g + 3]++;
    }
    for (let c = 0, g = 0; c < count * 3; c += 3, g += 4) {
      if (sums[g + 3]) (c3[c] = sums[g] / sums[g + 3]), (c3[c + 1] = sums[g + 1] / sums[g + 3]), (c3[c + 2] = sums[g + 2] / sums[g + 3]);
    }
  }
  for (let c = 0; c < count; c++) centers[c] = [c3[c * 3], c3[c * 3 + 1], c3[c * 3 + 2]];
  // Each center becomes the nearest point not yet taken, so every spot is one that fits.
  const taken = new Set();
  return centers.map((c) => {
    let best = -1;
    for (let i = 0; i < n; i++) if (!taken.has(i) && (best < 0 || dist(xyz[i], c) < dist(xyz[best], c))) best = i;
    taken.add(best);
    return points[best];
  });
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

// Whether [lon, lat] lies inside `rings` ([[lon, lat], ...]: outer rings and holes alike), by counting
// the edges a ray to the east crosses. Flat in degrees, which suits country outlines split at the antimeridian.
export function insideRings(rings, [lon, lat]) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < xi + ((lat - yi) * (xj - xi)) / (yj - yi)) inside = !inside;
    }
  }
  return inside;
}
