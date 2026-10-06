// Draws the map and the wisps on two canvases: the map layer is redrawn only when the view
// (or a highlight) changes; the wisp layer (wisps, constellation, labels) on every frame.
// Both draw with plain canvas calls and pre-rendered sprites: no SVG filters or CSS blur.

import { geoPath } from 'd3-geo';

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;

// A canvas that fills the window, at the screen's pixel density up to maxDpr. Soft things
// (the wisps) look the same at 1x and cost a quarter of the pixels of 2x on a high-density screen.
export function layer(canvas, maxDpr = 2) {
  const ctx = canvas.getContext('2d');
  const l = { canvas, ctx, w: 0, h: 0, dpr: 1 };
  l.resize = (w, h) => {
    const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
    if (w === l.w && h === l.h && dpr === l.dpr) return false;
    Object.assign(l, { w, h, dpr });
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    return true;
  };
  l.clear = () => {
    ctx.setTransform(l.dpr, 0, 0, l.dpr, 0, 0);
    ctx.clearRect(0, 0, l.w, l.h);
  };
  return l;
}

// ---------- The map ----------

const COUNTRY = { fill: '#0F1738', stroke: '#222D63', width: 0.5 };
const KIN = { fill: [58, 53, 80], stroke: [156, 138, 94], width: 0.5 };
const OWN = { fill: [110, 95, 58], stroke: [244, 213, 141], width: 1.1 };
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;

// What stays put while the globe turns: the glow behind it, its disc, rim and astrolabe ring.
// Redrawn only when the zoom or the layout changes.
export function drawBackdrop(l, { vw, projection, frame }) {
  const { ctx } = l;
  l.clear();
  const path = geoPath(projection, ctx);

  const glow = (1 - vw.a) * 0.55;
  if (glow > 0.005) {
    const r = vw.s + 56;
    const g = ctx.createRadialGradient(vw.cx, vw.cy, 0, vw.cx, vw.cy, r);
    g.addColorStop(0, `rgba(43,63,158,${glow})`);
    g.addColorStop(Math.max(0, (vw.s - 28) / r), `rgba(43,63,158,${glow})`);
    g.addColorStop(1, 'rgba(43,63,158,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(vw.cx, vw.cy, r, 0, TAU);
    ctx.fill();
  }

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(frame.cx, frame.cy, frame.rx, frame.ry, 0, 0, TAU);
  ctx.clip();
  ctx.beginPath();
  path({ type: 'Sphere' });
  ctx.fillStyle = '#0B1233';
  ctx.fill();
  ctx.restore();

  if (vw.a < 0.999) {
    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.globalAlpha = 1 - vw.a;
    ctx.strokeStyle = '#3B4A92';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (frame.op > 0.005) drawFrame(ctx, frame);
}

// What turns with the globe: graticule, land, borders, highlighted countries and coasts.
// highlights: Map country feature -> { kin: 0..1, own: 0..1 }
export function drawMap(l, { projection, frame, land, borders, coast, graticule, highlights }) {
  const { ctx } = l;
  l.clear();
  const path = geoPath(projection, ctx);

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(frame.cx, frame.cy, frame.rx, frame.ry, 0, 0, TAU);
  ctx.clip();

  ctx.beginPath();
  path(graticule);
  ctx.setLineDash([1, 4]);
  ctx.strokeStyle = '#26306A';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  path(land);
  ctx.fillStyle = COUNTRY.fill;
  ctx.fill();
  ctx.beginPath();
  path(borders);
  ctx.strokeStyle = COUNTRY.stroke;
  ctx.lineWidth = COUNTRY.width;
  ctx.stroke();

  for (const [f, h] of highlights) {
    for (const [style, level] of [[KIN, h.kin], [OWN, h.own]]) {
      if (level < 0.01) continue;
      ctx.beginPath();
      path(f);
      ctx.fillStyle = rgba(style.fill, level);
      ctx.fill();
      ctx.strokeStyle = rgba(style.stroke, level);
      ctx.lineWidth = style.width;
      ctx.stroke();
    }
  }

  ctx.beginPath();
  path(coast);
  ctx.setLineDash([1.4, 2.8]);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#5363B8';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';
  ctx.restore();
}

// The astrolabe ring around the globe; it grows away as the map unrolls.
function drawFrame(ctx, { cx, cy, rx, ry, op }) {
  const rx2 = rx + 18;
  const ry2 = ry + 18;
  ctx.globalAlpha = op;
  ctx.strokeStyle = '#8A7440';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx2, ry2, 0, 0, TAU);
  ctx.stroke();

  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let deg = 0; deg < 360; deg += 2) {
    const c = Math.cos(deg * RAD);
    const s = Math.sin(deg * RAD);
    const L = deg % 30 === 0 ? 15 : deg % 10 === 0 ? 9 : 4;
    ctx.moveTo(cx + rx2 * c, cy + ry2 * s);
    ctx.lineTo(cx + (rx2 - L) * c, cy + (ry2 - L) * s);
  }
  ctx.stroke();

  ctx.fillStyle = '#E9C77B';
  ctx.beginPath();
  for (let deg = 15; deg < 360; deg += 30) {
    const px = cx + (rx + 9) * Math.cos(deg * RAD);
    const py = cy + (ry + 9) * Math.sin(deg * RAD);
    const k = 3.2;
    const q = 0.8;
    ctx.moveTo(px, py - k);
    for (const [dx, dy] of [[q, -q], [k, 0], [q, q], [0, k], [-q, q], [-k, 0], [-q, -q]]) ctx.lineTo(px + dx, py + dy);
    ctx.closePath();
  }
  ctx.fill();

  ctx.font = "600 13px 'Cormorant Garamond', Georgia, serif";
  if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
  ctx.fillStyle = '#C9A962';
  ctx.textAlign = 'center';
  ctx.fillText('SEPTENTRIO', cx + 3, cy - ry2 - 12);
  ctx.fillText('MERIDIES', cx + 3, cy + ry2 + 22);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.globalAlpha = 1;
}

// ---------- Wisps ----------

// Soft round sprites, rendered once: [radius in CSS px, [stop, rgba]...].
function sprite(radius, stops, dpr) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(radius * 2 * dpr);
  const ctx = c.getContext('2d');
  const r = c.width / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  c.radius = radius;
  return c;
}

export function wispSprites(dpr) {
  return {
    dpr,
    halo: sprite(18, [[0, 'rgba(244,213,141,0.2)'], [0.45, 'rgba(244,213,141,0.15)'], [1, 'rgba(244,213,141,0)']], dpr),
    core: sprite(16, [[0, '#FFF6DC'], [0.15, '#FFF6DC'], [0.22, 'rgba(244,213,141,0.85)'], [0.5, 'rgba(244,213,141,0.22)'], [1, 'rgba(244,213,141,0)']], dpr),
    end: sprite(5, [[0, '#FFF1CC'], [0.45, 'rgba(255,241,204,0.8)'], [1, 'rgba(255,241,204,0)']], dpr),
  };
}

const draw = (ctx, img, x, y, scale) => {
  const r = img.radius * scale;
  ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
};

// Breathing: 0..1, smooth, on the wisp's own period.
const breath = (t, w) => 0.5 - 0.5 * Math.cos(TAU * ((t + w.delay) / w.dur));

// wisps: [{ x, y, alpha, state: '' | 'kin' | 'on', dur, delay }]
export function drawWisps(ctx, sprites, wisps, t) {
  for (const w of wisps) {
    const b = breath(t, w);
    const on = w.state === 'on';
    const kin = w.state === 'kin';
    ctx.globalAlpha = w.alpha * (0.25 + 0.75 * b) * (on ? 1.6 : 1);
    draw(ctx, sprites.halo, w.x, w.y, (on ? 1.5 : 1) * (0.7 + 0.55 * b));

    const ray = on ? 13 : 8;
    ctx.globalAlpha = w.alpha * 0.45;
    ctx.fillStyle = '#FFF0C8';
    ctx.fillRect(w.x - ray, w.y - 0.5, ray * 2, 1);
    ctx.fillRect(w.x - 0.5, w.y - ray, 1, ray * 2);

    ctx.globalAlpha = w.alpha * (on ? 1 : 0.5 + 0.5 * b);
    draw(ctx, sprites.core, w.x, w.y, (on ? 1.9 : kin ? 1.35 : 1) * (on ? 1 : 0.8 + 0.38 * b));

    if (on) {
      const k = (t % 2.6) / 2.6;
      ctx.globalAlpha = w.alpha * (1 - k) * 0.8;
      ctx.strokeStyle = '#F4D58D';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(w.x, w.y, 15 * (0.7 + 0.9 * k), 0, TAU);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

// The constellation: a glow and a flowing dotted line along every arc, and a spark at its end.
export function drawConstellation(ctx, sprites, arcs, t) {
  if (!arcs) return;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(244,213,141,0.1)';
  ctx.lineWidth = 6;
  ctx.stroke(arcs.path);
  ctx.strokeStyle = 'rgba(248,222,156,0.55)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 5]);
  ctx.lineDashOffset = -((t * 56) / 5) % 56;
  ctx.stroke(arcs.path);
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';
  for (const e of arcs.ends) {
    ctx.globalAlpha = e.alpha;
    draw(ctx, sprites.end, e.x, e.y, 1);
  }
  ctx.globalAlpha = 1;
}
