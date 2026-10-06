#!/usr/bin/env node
// Writes the countries drawn by the map, Natural Earth (public domain) as TopoJSON from the
// world-atlas package:
//   dist/data/world.json         1:110m, for the globe and the whole flat map. scripts/build-data.js
//                                uses the same file to find the country each place lies in.
//   dist/data/world-detail.json  1:50m, simplified, for the map zoomed in; loaded after the first view.
//
// Usage: node scripts/build-world.js

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { quantize } from 'topojson-client';
import { presimplify, quantile, simplify } from 'topojson-simplify';
import { DATA_OUT } from './paths.js';

// The share of the 1:50m points the detailed map keeps (the most significant ones, by triangle area).
const DETAIL_KEEP = 0.3;

const require = createRequire(import.meta.url);
const read = (name) => {
  const topo = JSON.parse(fs.readFileSync(require.resolve(`world-atlas/${name}`), 'utf8'));
  if (!topo.objects?.countries || !topo.objects?.land) throw new Error(`Expected world-atlas countries TopoJSON in ${name}`);
  return topo;
};
const points = (topo) => topo.arcs.reduce((n, arc) => n + arc.length, 0);

const world = read('countries-110m.json');
const pre = presimplify(read('countries-50m.json'));
const detail = quantize(simplify(pre, quantile(pre, DETAIL_KEEP)), 1e5);

fs.mkdirSync(DATA_OUT, { recursive: true });
fs.writeFileSync(path.join(DATA_OUT, 'world.json'), JSON.stringify(world));
fs.writeFileSync(path.join(DATA_OUT, 'world-detail.json'), JSON.stringify(detail));
console.log(`Wrote ${world.objects.countries.geometries.length} countries to dist/data/world.json (${points(world)} points)`);
console.log(`Wrote ${detail.objects.countries.geometries.length} countries to dist/data/world-detail.json (${points(detail)} points)`);
