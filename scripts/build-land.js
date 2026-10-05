#!/usr/bin/env node
// Converts Natural Earth 1:110m land (world-atlas TopoJSON) into the flat
// GeoJSON drawn by the map: rings that cross the antimeridian are unwrapped
// (so Chukotka continues past 180° instead of streaking across the map) and
// Antarctica, which has no tales, is dropped.
//
// Usage: node scripts/build-land.js <land-110m.json> <topojson-client.js>
//   land-110m.json:     https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json
//   topojson-client.js: https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.js

const fs = require('node:fs');
const path = require('node:path');

const [landFile, clientFile] = process.argv.slice(2).map((f) => path.resolve(f));
const topojson = require(clientFile);
const topo = JSON.parse(fs.readFileSync(landFile, 'utf8'));
const land = topojson.feature(topo, topo.objects.land);

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

const polygons = land.features
  .flatMap((f) => (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]))
  .map((poly) => poly.map(unwrap))
  // An unwrapped ring may now sit a whole turn to the west; bring it back so it ends near 180°.
  .map((poly) => (Math.min(...poly[0].map(([lng]) => lng)) < -180 ? poly.map((ring) => ring.map(([lng, lat]) => [round(lng + 360), lat])) : poly))
  .filter((poly) => Math.max(...poly[0].map(([, lat]) => lat)) > -60);

const out = { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polygons } };
fs.writeFileSync(path.join(__dirname, '../docs/data/land.json'), JSON.stringify(out));
console.log(`Wrote ${polygons.length} land polygons to docs/data/land.json`);
