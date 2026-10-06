#!/usr/bin/env node
// Copies the countries drawn by the map to dist/data/world.json: Natural Earth 1:110m
// (public domain) as TopoJSON, from the world-atlas package. scripts/build-data.js uses
// the same file to find the country each place lies in.
//
// Usage: node scripts/build-world.js

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { DATA_OUT } from './paths.js';

const source = createRequire(import.meta.url).resolve('world-atlas/countries-110m.json');
const topo = JSON.parse(fs.readFileSync(source, 'utf8'));
if (!topo.objects?.countries || !topo.objects?.land) throw new Error('Expected world-atlas countries TopoJSON');

fs.mkdirSync(DATA_OUT, { recursive: true });
fs.writeFileSync(path.join(DATA_OUT, 'world.json'), JSON.stringify(topo));
console.log(`Wrote ${topo.objects.countries.geometries.length} countries to dist/data/world.json`);
