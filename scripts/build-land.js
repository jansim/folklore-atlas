#!/usr/bin/env node
// Builds docs/data/land.json, the land outlines drawn by the map, from Natural
// Earth 1:110m land (public domain) as packaged by world-atlas:
// rings that cross the antimeridian are unwrapped (so Chukotka continues past
// 180° instead of streaking across the map) and Antarctica, which has no tales,
// is dropped.
//
// Usage: node scripts/build-land.js [land-110m.json]
// Without a file it downloads https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json

const fs = require('node:fs');
const path = require('node:path');

const SOURCE = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';
const OUT = path.join(__dirname, '../docs/data/land.json');

// Decode the TopoJSON polygons of one object into GeoJSON polygon coordinates.
function topoPolygons(topo, object) {
  const { scale, translate } = topo.transform;
  const arcs = topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => [(x += dx) * scale[0] + translate[0], (y += dy) * scale[1] + translate[1]]);
  });
  const ring = (indexes) =>
    indexes.flatMap((i, n) => {
      const points = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
      return n === 0 ? points : points.slice(1);
    });
  const geometries = object.type === 'GeometryCollection' ? object.geometries : [object];
  return geometries.flatMap((g) =>
    g.type === 'Polygon' ? [g.arcs.map(ring)] : g.type === 'MultiPolygon' ? g.arcs.map((p) => p.map(ring)) : [],
  );
}

const round = (n) => Math.round(n * 100) / 100;
function unwrap(ring) {
  let offset = 0;
  return ring.map(([lng, lat], i) => {
    if (i > 0) {
      const prev = ring[i - 1][0];
      if (lng - prev > 180) offset -= 360;
      else if (prev - lng > 180) offset += 360;
    }
    return [round(lng + offset), round(lat)];
  });
}

async function main() {
  const file = process.argv[2];
  const topo = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : await fetch(SOURCE).then((r) => r.json());

  const polygons = topoPolygons(topo, topo.objects.land)
    .map((poly) => poly.map(unwrap))
    // An unwrapped ring may now sit a whole turn to the west; bring it back so it ends near 180°.
    .map((poly) => (Math.min(...poly[0].map(([lng]) => lng)) < -180 ? poly.map((r) => r.map(([lng, lat]) => [round(lng + 360), lat])) : poly))
    .filter((poly) => Math.max(...poly[0].map(([, lat]) => lat)) > -60);

  const out = { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polygons } };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`Wrote ${polygons.length} land polygons to docs/data/land.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
