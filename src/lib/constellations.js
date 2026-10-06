// Decodes the constellation drawings in data/constellations.json into stars, lines and circles.
//
// A drawing is a space-separated list of parts on a grid from 0 to 35 (y down, as in SVG). Numbers are
// base-36 digits ("0"-"9", "a"-"z" = 0-35); a point is two digits.
//   - a run of points, "2c6m" is (2,12)-(6,22). Consecutive points are joined by a line; a single point is
//     a lone star. "Q" and a control point before a point curve the line to it, as in SVG ("00Qh0z0" bows
//     up towards (17,0)), and a trailing "Z" (or "Q" control "Z") closes the run back to its first point.
//   - a circle, "O" with its center, radius and number of stars spaced evenly around it from the top, 4 if
//     left out: "Ohh8" is a circle of radius 8 around (17,17) with stars at its top, right, bottom and left,
//     "Ohh86" one with six stars.
//   - a reference to a named icon, "@sun", drawn whole or placed in a box: "@sun:XYS" puts the icon's
//     grid at X,Y scaled by S/35 (so "@sun:00z" is the icon as is and "@sun:i0h" its top-right quarter),
//     and a trailing "-" mirrors it left to right ("@fox:00z-" faces left).
// Every distinct point of a run or star of a circle is one star; control points and circles are not.

export const GRID = 35;
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const D = '[0-9a-z]';
const RUN = new RegExp(`^${D}{2}(?:Q${D}{2}(?:${D}{2}|Z)|${D}{2})*Z?$`);
const CIRCLE = new RegExp(`^O(${D})(${D})(${D})(${D})?$`);
const REF = /^@([a-z][a-z0-9-]*)(?::([0-9a-z])([0-9a-z])([0-9a-z])(-)?)?$/;
const digit = (c) => DIGITS.indexOf(c);

// The shapes of a drawing with references resolved (icons: name -> drawing):
//   { points: [[x, y], ...], controls: [null | [cx, cy], ...] } for a run, where controls[i] curves
//   the line from points[i - 1] to points[i]; { circle: [cx, cy, r], stars: n } for a circle.
export function shapes(drawing, icons = {}, seen = []) {
  const out = [];
  for (const part of drawing.split(' ').filter(Boolean)) {
    if (RUN.test(part)) {
      const points = [];
      const controls = [];
      let control = null;
      for (let i = 0; i < part.length; ) {
        if (part[i] === 'Q') {
          control = [digit(part[i + 1]), digit(part[i + 2])];
          i += 3;
        } else if (part[i] === 'Z') {
          points.push(points[0]), controls.push(control), (control = null), i++;
        } else {
          points.push([digit(part[i]), digit(part[i + 1])]), controls.push(control), (control = null), (i += 2);
        }
      }
      out.push({ points, controls });
      continue;
    }
    const c = part.match(CIRCLE);
    if (c) {
      out.push({ circle: [digit(c[1]), digit(c[2]), digit(c[3])], stars: c[4] ? digit(c[4]) : 4 });
      continue;
    }
    const m = part.match(REF);
    if (!m) throw new Error(`Bad part "${part}" in "${drawing}"`);
    const [, name, x, y, s, mirror] = m;
    if (!(name in icons)) throw new Error(`Unknown icon "${name}"`);
    if (seen.includes(name)) throw new Error(`Icon "${name}" refers to itself`);
    const [dx, dy, scale] = x ? [digit(x), digit(y), digit(s) / GRID] : [0, 0, 1];
    const at = (p) => p && [dx + (mirror ? GRID - p[0] : p[0]) * scale, dy + p[1] * scale];
    for (const shape of shapes(icons[name], icons, [...seen, name])) {
      if (shape.circle) {
        const [cx, cy, r] = shape.circle;
        out.push({ circle: [...at([cx, cy]), r * scale], stars: shape.stars });
      } else out.push({ points: shape.points.map(at), controls: shape.controls.map(at) });
    }
  }
  return out;
}

const round = (v) => +v.toFixed(3);

// { stars: [[x, y], ...], lines: [[i, j] | [i, j, cx, cy], ...], circles: [[cx, cy, r], ...] }: lines
// join stars i and j, curving through the control point cx,cy when they have one.
export function decode(drawing, icons = {}) {
  const stars = [];
  const index = new Map();
  const lines = new Map();
  const circles = new Map();
  const star = ([x, y]) => {
    const key = `${round(x)},${round(y)}`;
    if (!index.has(key)) index.set(key, stars.push([round(x), round(y)]) - 1);
    return index.get(key);
  };
  for (const shape of shapes(drawing, icons)) {
    if (shape.circle) {
      const [cx, cy, r] = shape.circle.map(round);
      circles.set(`${cx},${cy},${r}`, [cx, cy, r]);
      for (let k = 0; k < shape.stars; k++) {
        const a = -Math.PI / 2 + (2 * Math.PI * k) / shape.stars;
        star([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      continue;
    }
    const ids = shape.points.map(star);
    for (let i = 1; i < ids.length; i++) {
      const control = shape.controls[i]?.map(round);
      if (ids[i - 1] === ids[i] && !control) continue;
      // A straight line is the same either way round; a curve keeps its direction with its control point.
      const [a, b] = control ? [ids[i - 1], ids[i]] : [ids[i - 1], ids[i]].sort((p, q) => p - q);
      lines.set(`${a},${b},${control ?? ''}`, control ? [a, b, ...control] : [a, b]);
    }
  }
  return { stars, lines: [...lines.values()], circles: [...circles.values()] };
}

// SVG path data for the lines and circles of a decoded drawing (stars are left to the renderer).
export function pathData({ stars, lines, circles }) {
  const p = ([x, y]) => `${x} ${y}`;
  return [
    ...lines.map(([a, b, cx, cy]) =>
      cx === undefined ? `M${p(stars[a])}L${p(stars[b])}` : `M${p(stars[a])}Q${cx} ${cy} ${p(stars[b])}`,
    ),
    ...circles.map(([cx, cy, r]) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`),
  ].join('');
}

// The drawing of a tale: its own if it has one, else its tale type's (data: constellations.json).
export const taleDrawing = (data, id, atu) => data.tales[id] ?? data.types[atu] ?? null;
