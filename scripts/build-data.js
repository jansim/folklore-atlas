#!/usr/bin/env node
// Builds the map data from the trilogy submodule (vendor/trilogy):
//   - vendor/trilogy/data/aft.csv     Annotated Folktales: tale text, provenance, ATU tale type
//   - vendor/trilogy/data/atu_df.csv  ATU tale type index: names and chapters
//   - data/places.json                our gazetteer: provenance -> map position
// Writes docs/data/map.json (places, tale list, tale types) and one
// docs/data/tales/<id>.json per tale with its full text.
//
// Usage: node scripts/build-data.js

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TRILOGY = path.join(ROOT, 'vendor/trilogy/data');
const OUT = path.join(ROOT, 'docs/data');
const EXCERPT_LENGTH = 240;

if (!fs.existsSync(path.join(TRILOGY, 'aft.csv'))) {
  console.error('vendor/trilogy is missing. Run: git submodule update --init');
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

const titleCase = (s) =>
  s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Of|The|And|A|An|To|In)\b/g, (w, _, i) => (i === 0 ? w : w.toLowerCase()));

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

// ---------- Tale types ----------

const kinds = [];
const types = {};
for (const t of readCsv('atu_df.csv')) {
  const kind = titleCase(t.chapter);
  if (!kinds.includes(kind)) kinds.push(kind);
  types[t.atu_id] = [clean(t.tale_name).replace(/\s*\(previously [^)]*\)\s*/i, ' ').trim(), kinds.indexOf(kind)];
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
  // Compact tale tuple: [id, title, atu_id, excerpt]
  placed.get(place.id).push([id, title, t.atu_id, excerpt(text)]);
  const tale = { id, title, atu: t.atu_id, place: place.id, provenance, source: clean(t.source), notes: clean(t.notes), text };
  fs.writeFileSync(path.join(OUT, 'tales', `${id}.json`), JSON.stringify(tale));
});

const usedTypes = new Set([...placed.values()].flat().map((t) => t[2]));
const out = {
  source: 'https://github.com/j-hagedorn/trilogy',
  kinds,
  types: Object.fromEntries(Object.entries(types).filter(([id]) => usedTypes.has(id))),
  places: gazetteer.places
    .filter((p) => placed.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, tales: placed.get(p.id) })),
};
fs.writeFileSync(path.join(OUT, 'map.json'), JSON.stringify(out));

const total = [...placed.values()].reduce((n, l) => n + l.length, 0);
console.log(`Placed ${total} of ${tales.length} tales at ${out.places.length} places (${usedTypes.size} tale types) → docs/data/`);
for (const [p, n] of unplaced) console.log(`  not placed: ${JSON.stringify(p)} (${n})`);
for (const p of gazetteer.places) if (!placed.has(p.id)) console.log(`  unused place: ${p.id}`);
