#!/usr/bin/env node
// Builds docs/data/world.json, the countries and land drawn by the map: Natural
// Earth 1:110m (public domain) as TopoJSON, packaged by world-atlas. The site
// draws it with d3-geo, and scripts/build-data.js uses it to find the country
// each place lies in.
//
// Usage: node scripts/build-world.js [countries-110m.json]
// Without a file it downloads https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json

const fs = require('node:fs');
const path = require('node:path');

const SOURCE = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const OUT = path.join(__dirname, '../docs/data/world.json');

async function main() {
  const file = process.argv[2];
  const topo = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : await fetch(SOURCE).then((r) => r.json());
  if (!topo.objects?.countries || !topo.objects?.land) throw new Error('Expected world-atlas countries TopoJSON');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(topo));
  console.log(`Wrote ${topo.objects.countries.geometries.length} countries to docs/data/world.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
