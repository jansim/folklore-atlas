#!/usr/bin/env node
// Builds the map data from the trilogy submodule (vendor/trilogy):
//   - vendor/trilogy/data/aft.csv     Annotated Folktales: tale text, provenance, ATU tale type
//   - vendor/trilogy/data/atu_df.csv  ATU tale type index: type names and families
//   - data/places.json                our gazetteer: provenance -> map position
//   - data/atu-kinds.json             the kinds of tale by ATU number, and family names atu_df.csv lacks
//   - data/constellations.json        constellation drawings for the tales, copied without its comment
//   - dist/data/world.json            country outlines (scripts/build-world.js), to find each place's country
// Writes dist/data/map.json (places, tale list, tale types) and one
// dist/data/tales/<id>.json per tale with its full text, and dist/data/constellations.json.
//
// Usage: node scripts/build-data.js

import fs from 'node:fs';
import path from 'node:path';
import { DATA_OUT as OUT, ROOT, TRILOGY } from './paths.js';
const EXCERPT_LENGTH = 240;
const PARAGRAPH_LENGTH = 520;

if (!fs.existsSync(path.join(TRILOGY, 'aft.csv'))) {
  console.error('vendor/trilogy is missing. Run: git submodule update --init');
  process.exit(1);
}
if (!fs.existsSync(path.join(OUT, 'world.json'))) {
  console.error('dist/data/world.json is missing. Run: npm run build:world');
  process.exit(1);
}

// Minimal RFC 4180 CSV parser (quoted fields, "" escapes, newlines in quotes).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') field += c, i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(field), (field = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field), rows.push(row), (row = []), (field = '');
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  const [header, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const readCsv = (file) => parseCsv(fs.readFileSync(path.join(TRILOGY, file), 'utf8'));

// Some fields were stored as UTF-8 read as Latin-1 ("AsbjÃ¸rnsen"); repair those runs.
const fixMojibake = (s) =>
  s.replace(/[Â-ô][\u0080-¿]{1,3}/g, (m) => {
    const fixed = Buffer.from(m, 'latin1').toString('utf8');
    return fixed.includes('�') || fixed.length !== 1 ? m : fixed;
  });
const clean = (s) => (s && s !== 'NA' ? fixMojibake(s).replace(/\s+/g, ' ').trim() : null);

// The texts come without line breaks: break them into paragraphs of a few sentences for reading.
function paragraphs(s) {
  const sentences = s.match(/[^.!?]+(?:[.!?]+["'’”)]*|$)\s*/g) ?? [s];
  const out = [''];
  for (const sentence of sentences) {
    if (out[out.length - 1].length > PARAGRAPH_LENGTH) out.push('');
    out[out.length - 1] += sentence;
  }
  return out.map((p) => p.trim()).filter(Boolean);
}

const titleCase = (s) =>
  s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/(?<!^)\b(Of|The|And|A|An|To|In|Or|By|From|Between|About)\b/g, (w) => w.toLowerCase());

const excerpt = (s) => (s.length <= EXCERPT_LENGTH ? s : s.slice(0, s.lastIndexOf(' ', EXCERPT_LENGTH)) + '…');

// ---------- Gazetteer ----------

const gazetteer = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/places.json'), 'utf8'));
const placeById = new Map(gazetteer.places.map((p) => [p.id, p]));
const aliases = gazetteer.places.flatMap((p) => p.aliases.map((a) => ({ alias: a, place: p })));

function locate(provenance) {
  if (!provenance) return null;
  if (gazetteer.match[provenance]) return placeById.get(gazetteer.match[provenance]);
  const parts = provenance
    .toLowerCase()
    .split(/[,;/()]|--/)
    .map((s) => s.trim())
    .filter(Boolean);
  const hits = parts.flatMap((part) =>
    aliases.filter(({ alias }) => part === alias || part.startsWith(alias + ' ')).map(({ place }) => place),
  );
  return hits.find((p) => !p.generic) ?? hits[0] ?? null;
}

// ---------- Countries ----------

// Decode the TopoJSON countries into planar [lng, lat] rings, enough to find the country a place lies in.
function topoCountries(topo) {
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
  return topo.objects.countries.geometries.map((g) => ({
    name: g.properties.name,
    polygons: g.type === 'Polygon' ? [g.arcs.map(ring)] : g.type === 'MultiPolygon' ? g.arcs.map((p) => p.map(ring)) : [],
  }));
}

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const countries = topoCountries(JSON.parse(fs.readFileSync(path.join(OUT, 'world.json'), 'utf8')));
// The country a place lies in or, for a place on a coast or a small island, the nearest one within ~4°.
function countryAt(lng, lat) {
  const inside = countries.find((c) =>
    c.polygons.some(([outer, ...holes]) => inRing([lng, lat], outer) && !holes.some((h) => inRing([lng, lat], h))),
  );
  if (inside) return inside.name;
  let best = null;
  let bestDistance = 16;
  for (const c of countries)
    for (const [outer] of c.polygons)
      for (const [x, y] of outer) {
        const d = ((x - lng) * Math.cos((lat * Math.PI) / 180)) ** 2 + (y - lat) ** 2;
        if (d < bestDistance) (best = c.name), (bestDistance = d);
      }
  return best;
}

// ---------- Tale types ----------

// Families come from atu_df.csv's divisions ("Supernatural Helpers 500-559"), completed by
// data/atu-kinds.json; kinds come from data/atu-kinds.json (atu_df.csv's chapters are wrong for 850-1199).
const atuKinds = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/atu-kinds.json'), 'utf8'));
const atuRows = readCsv('atu_df.csv');
const atuNumber = (atu) => parseInt(atu, 10);
const kindOf = (n) => atuKinds.kinds.findIndex((k) => n >= k.from && n <= k.to);

const familyRanges = new Map();
for (const row of atuRows) {
  const m = clean(row.division)?.match(/^(.*) (\d+)-(\d+)$/);
  if (m) familyRanges.set(`${m[2]}-${m[3]}`, { name: titleCase(m[1]), from: Number(m[2]), to: Number(m[3]) });
}
for (const f of atuKinds.families) familyRanges.set(`${f.from}-${f.to}`, f);
const families = [...familyRanges.values()].sort((a, b) => a.from - b.from).map((f) => ({ ...f, kind: kindOf(f.from) }));
for (const f of families) {
  if (f.kind < 0 || kindOf(f.to) !== f.kind) throw new Error(`Family ${f.name} (${f.from}-${f.to}) is not within one kind of tale`);
}
const familyOf = (atu) => families.findIndex((f) => atuNumber(atu) >= f.from && atuNumber(atu) <= f.to);

const types = {};
for (const t of atuRows) {
  types[t.atu_id] = [clean(t.tale_name).replace(/\s*\(previously [^)]*\)\s*/i, ' ').trim(), familyOf(t.atu_id)];
}

// ---------- Tales ----------

const tales = readCsv('aft.csv');
const placed = new Map();
const unplaced = new Map();
fs.rmSync(path.join(OUT, 'tales'), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'tales'), { recursive: true });

tales.forEach((t, i) => {
  const id = i + 1; // row number in aft.csv; stable for the pinned submodule commit
  const provenance = clean(t.provenance);
  const text = clean(t.text) ?? '';
  const title = clean(t.tale_title) ?? 'Untitled';
  const place = locate(provenance);
  if (!place) {
    unplaced.set(provenance, (unplaced.get(provenance) ?? 0) + 1);
    return;
  }
  if (!placed.has(place.id)) placed.set(place.id, []);
  if (!types[t.atu_id]) types[t.atu_id] = ['Unnamed tale type', familyOf(t.atu_id)];
  // Compact tale tuple: [id, title, atu_id, excerpt]
  placed.get(place.id).push([id, title, t.atu_id, excerpt(text)]);
  const tale = { id, title, atu: t.atu_id, place: place.id, provenance, source: clean(t.source), notes: clean(t.notes), paragraphs: paragraphs(text) };
  fs.writeFileSync(path.join(OUT, 'tales', `${id}.json`), JSON.stringify(tale));
});

const usedTypes = new Set([...placed.values()].flat().map((t) => t[2]));
const out = {
  source: 'https://github.com/j-hagedorn/trilogy',
  kinds: atuKinds.kinds.map((k) => k.name),
  // [family name, kind index]
  families: families.map((f) => [f.name, f.kind]),
  // atu id -> [type name, family index]
  types: Object.fromEntries(Object.entries(types).filter(([id]) => usedTypes.has(id))),
  places: gazetteer.places
    .filter((p) => placed.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, country: p.generic ? null : countryAt(p.lng, p.lat), tales: placed.get(p.id) })),
};
fs.writeFileSync(path.join(OUT, 'map.json'), JSON.stringify(out));

const { _comment, ...constellations } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/constellations.json'), 'utf8'));
fs.writeFileSync(path.join(OUT, 'constellations.json'), JSON.stringify(constellations));

const total = [...placed.values()].reduce((n, l) => n + l.length, 0);
console.log(`Placed ${total} of ${tales.length} tales at ${out.places.length} places (${usedTypes.size} tale types) → dist/data/`);
for (const [p, n] of unplaced) console.log(`  not placed: ${JSON.stringify(p)} (${n})`);
for (const p of gazetteer.places) if (!placed.has(p.id)) console.log(`  unused place: ${p.id}`);
for (const [atu, [, family]] of Object.entries(out.types)) if (family < 0) console.log(`  no family for ATU ${atu}`);
for (const p of out.places) if (!p.country && !placeById.get(p.id).generic) console.log(`  not in a country: ${p.id}`);
