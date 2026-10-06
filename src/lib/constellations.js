// Decodes the constellation drawings in data/constellations.json into stars and lines.
//
// A drawing is a space-separated list of parts on a grid from 0 to 35 (y down, as in SVG):
//   - a run of points, two base-36 digits each ("0"-"9", "a"-"z" = 0-35): "2c6m" is (2,12)-(6,22).
//     Consecutive points are joined by a line; a single point is a lone star. A trailing "Z" closes the
//     run back to its first point.
//   - a reference to a named icon, "@sun", drawn whole or placed in a box: "@sun:XYS" puts the icon's
//     grid at X,Y scaled by S/35 (so "@sun:00z" is the icon as is and "@sun:i0h" its top-right quarter),
//     and a trailing "-" mirrors it left to right ("@fox:00z-" faces left).
// Every distinct point is one star, however many runs pass through it.

export const GRID = 35;
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const RUN = /^(?:[0-9a-z]{2})+Z?$/;
const REF = /^@([a-z][a-z0-9-]*)(?::([0-9a-z])([0-9a-z])([0-9a-z])(-)?)?$/;
const digit = (c) => DIGITS.indexOf(c);

// The runs of a drawing as arrays of [x, y], with references resolved (icons: name -> drawing).
export function runs(drawing, icons = {}, seen = []) {
  const out = [];
  for (const part of drawing.split(' ').filter(Boolean)) {
    if (RUN.test(part)) {
      const closed = part.endsWith('Z');
      const coords = closed ? part.slice(0, -1) : part;
      const points = [];
      for (let i = 0; i < coords.length; i += 2) points.push([digit(coords[i]), digit(coords[i + 1])]);
      if (closed) points.push(points[0]);
      out.push(points);
      continue;
    }
    const m = part.match(REF);
    if (!m) throw new Error(`Bad part "${part}" in "${drawing}"`);
    const [, name, x, y, s, mirror] = m;
    if (!(name in icons)) throw new Error(`Unknown icon "${name}"`);
    if (seen.includes(name)) throw new Error(`Icon "${name}" refers to itself`);
    const [dx, dy, scale] = x ? [digit(x), digit(y), digit(s) / GRID] : [0, 0, 1];
    for (const run of runs(icons[name], icons, [...seen, name]))
      out.push(run.map(([px, py]) => [dx + (mirror ? GRID - px : px) * scale, dy + py * scale]));
  }
  return out;
}

// { stars: [[x, y], ...], lines: [[i, j], ...] } with lines as pairs of indexes into stars.
export function decode(drawing, icons = {}) {
  const stars = [];
  const index = new Map();
  const lines = new Map();
  const star = ([x, y]) => {
    const key = `${+x.toFixed(3)},${+y.toFixed(3)}`;
    if (!index.has(key)) index.set(key, stars.push([x, y]) - 1);
    return index.get(key);
  };
  for (const run of runs(drawing, icons)) {
    const ids = run.map(star);
    for (let i = 1; i < ids.length; i++) {
      const [a, b] = [ids[i - 1], ids[i]].sort((p, q) => p - q);
      if (a !== b) lines.set(`${a},${b}`, [a, b]);
    }
  }
  return { stars, lines: [...lines.values()] };
}

// The drawing of a tale: its own if it has one, else its tale type's (data: constellations.json).
export const taleDrawing = (data, id, atu) => data.tales[id] ?? data.types[atu] ?? null;
